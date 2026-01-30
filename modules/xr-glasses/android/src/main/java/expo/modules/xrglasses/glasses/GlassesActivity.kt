package expo.modules.xrglasses.glasses

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * GlassesActivity - Activity that runs ON THE GLASSES hardware.
 *
 * This activity is declared with android:requiredDisplayCategory="xr_projected"
 * which means it runs on the glasses display, not the phone. Uses Jetpack Compose
 * Glimmer for the UI, optimized for AI glasses displays.
 */
class GlassesActivity : ComponentActivity() {

    companion object {
        private const val TAG = "GlassesActivity"

        // Broadcast actions for IPC to phone
        const val ACTION_SPEECH_RESULT = "expo.modules.xrglasses.SPEECH_RESULT"
        const val ACTION_SPEECH_PARTIAL = "expo.modules.xrglasses.SPEECH_PARTIAL"
        const val ACTION_SPEECH_ERROR = "expo.modules.xrglasses.SPEECH_ERROR"
        const val ACTION_SPEECH_STATE = "expo.modules.xrglasses.SPEECH_STATE"

        // Extras
        const val EXTRA_TEXT = "text"
        const val EXTRA_CONFIDENCE = "confidence"
        const val EXTRA_ERROR_CODE = "error_code"
        const val EXTRA_ERROR_MESSAGE = "error_message"
        const val EXTRA_IS_LISTENING = "is_listening"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var continuousMode = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val PERMISSION_REQUEST_RECORD_AUDIO = 1001

    // UI State
    private val _uiState = MutableStateFlow(GlassesUiState())
    val uiState: StateFlow<GlassesUiState> = _uiState.asStateFlow()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "GlassesActivity created on glasses display")

        setContent {
            GlassesScreen(
                uiState = uiState.collectAsStateWithLifecycle().value,
                onClose = { finish() }
            )
        }

        // Check microphone permission - don't request on glasses (dialog can't show)
        // Permission should be granted from phone before launching this activity
        if (checkAudioPermission()) {
            Log.d(TAG, "RECORD_AUDIO permission granted, initializing speech")
            initSpeechRecognizer()
            handleIntent(intent)
        } else {
            Log.w(TAG, "RECORD_AUDIO permission not granted - speech recognition disabled")
            // Still show UI, just without speech recognition
            updateUiState { copy(error = "Mic permission needed - grant on phone") }
        }
    }

    private fun checkAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestAudioPermission() {
        Log.d(TAG, "Requesting RECORD_AUDIO permission")
        requestPermissions(
            arrayOf(Manifest.permission.RECORD_AUDIO),
            PERMISSION_REQUEST_RECORD_AUDIO
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == PERMISSION_REQUEST_RECORD_AUDIO) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "RECORD_AUDIO permission granted")
                initSpeechRecognizer()
                handleIntent(intent)
            } else {
                Log.e(TAG, "RECORD_AUDIO permission denied")
                updateUiState { copy(error = "Mic permission denied - grant on phone") }
                // Don't finish - keep UI visible without speech
            }
        }
    }

    private var useNetworkRecognizer = false

    private fun initSpeechRecognizer() {
        val onDeviceAvailable = try {
            SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
        } catch (e: Exception) {
            false
        }

        val networkAvailable = SpeechRecognizer.isRecognitionAvailable(this)
        Log.d(TAG, "Speech recognition - on-device: $onDeviceAvailable, network: $networkAvailable")

        if (!onDeviceAvailable && !networkAvailable) {
            Log.e(TAG, "No speech recognition available")
            updateUiState { copy(error = "Speech recognition not available") }
            sendError(-1, "Speech recognition not available on this device.")
            return
        }

        speechRecognizer = if (onDeviceAvailable && !useNetworkRecognizer) {
            try {
                Log.d(TAG, "Creating on-device speech recognizer")
                SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
            } catch (e: Exception) {
                Log.w(TAG, "On-device failed, using network: ${e.message}")
                useNetworkRecognizer = true
                SpeechRecognizer.createSpeechRecognizer(this)
            }
        } else if (networkAvailable) {
            Log.d(TAG, "Using network-based speech recognizer")
            useNetworkRecognizer = true
            SpeechRecognizer.createSpeechRecognizer(this)
        } else {
            Log.e(TAG, "Cannot create speech recognizer")
            sendError(-1, "Failed to create speech recognizer")
            return
        }

        speechRecognizer?.setRecognitionListener(createRecognitionListener())
        Log.d(TAG, "SpeechRecognizer initialized (network=$useNetworkRecognizer)")
    }

    private fun createRecognitionListener() = object : RecognitionListener {

        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "Ready for speech")
            updateUiState { copy(isListening = true, error = null) }
            sendState(isListening = true)
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech started")
        }

        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Log.d(TAG, "Speech ended")
        }

        override fun onError(error: Int) {
            val isLanguagePackError = error == 13

            if (isLanguagePackError && !useNetworkRecognizer) {
                Log.w(TAG, "Language pack not available, switching to network")
                useNetworkRecognizer = true
                speechRecognizer?.destroy()
                speechRecognizer = null
                initSpeechRecognizer()
                if (isListening) {
                    mainHandler.postDelayed({ startListeningInternal() }, 100)
                }
                return
            }

            val errorMessage = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                SpeechRecognizer.ERROR_NETWORK -> "Network error"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                SpeechRecognizer.ERROR_CLIENT -> "Client error"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                SpeechRecognizer.ERROR_SERVER -> "Server error"
                13 -> "Language pack not available"
                else -> "Recognition error: $error"
            }

            Log.e(TAG, "Speech error: $errorMessage (code: $error)")
            updateUiState { copy(error = errorMessage) }
            sendError(error, errorMessage)

            if (continuousMode && isListening && isRecoverableError(error)) {
                mainHandler.postDelayed({
                    if (isListening) startListeningInternal()
                }, 500)
            }
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

            if (!matches.isNullOrEmpty()) {
                val bestIndex = if (confidences != null && confidences.isNotEmpty()) {
                    confidences.indices.maxByOrNull { confidences[it] } ?: 0
                } else {
                    0
                }

                val text = matches[bestIndex]
                val confidence = confidences?.getOrNull(bestIndex) ?: 0f

                Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")
                updateUiState { copy(
                    transcript = text,
                    partialTranscript = "",
                    isListening = false
                )}
                sendResult(text, confidence)
            }

            if (continuousMode && isListening) {
                mainHandler.postDelayed({
                    if (isListening) startListeningInternal()
                }, 100)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            if (!matches.isNullOrEmpty()) {
                val text = matches[0]
                Log.d(TAG, "Partial result: '$text'")
                updateUiState { copy(partialTranscript = text) }
                sendPartialResult(text)
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {
            Log.d(TAG, "Speech event: $eventType")
        }
    }

    private fun isRecoverableError(error: Int): Boolean {
        return error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS &&
               error != SpeechRecognizer.ERROR_CLIENT &&
               error != SpeechRecognizer.ERROR_RECOGNIZER_BUSY
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return

        when (intent.action) {
            "expo.modules.xrglasses.LAUNCH_GLASSES",
            "expo.modules.xrglasses.START_LISTENING" -> {
                if (intent.getBooleanExtra("start_listening", false) ||
                    intent.action == "expo.modules.xrglasses.START_LISTENING") {
                    continuousMode = intent.getBooleanExtra("continuous", true)
                    startListening()
                }
            }
            "expo.modules.xrglasses.STOP_LISTENING" -> {
                stopListening()
            }
            "expo.modules.xrglasses.SHOW_RESPONSE" -> {
                val response = intent.getStringExtra("response") ?: ""
                updateUiState { copy(aiResponse = response) }
            }
        }
    }

    fun startListening() {
        if (speechRecognizer == null) {
            Log.e(TAG, "SpeechRecognizer not initialized")
            sendError(-1, "Speech recognizer not initialized")
            return
        }

        isListening = true
        startListeningInternal()
    }

    private fun startListeningInternal() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }

        try {
            speechRecognizer?.startListening(intent)
            Log.d(TAG, "Started listening")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start listening: ${e.message}")
            sendError(-1, "Failed to start speech recognition: ${e.message}")
        }
    }

    fun stopListening() {
        isListening = false
        continuousMode = false
        speechRecognizer?.stopListening()
        updateUiState { copy(isListening = false) }
        sendState(isListening = false)
        Log.d(TAG, "Stopped listening")
    }

    private fun updateUiState(update: GlassesUiState.() -> GlassesUiState) {
        _uiState.value = _uiState.value.update()
    }

    // IPC methods - send results to phone app via broadcast
    private fun sendResult(text: String, confidence: Float) {
        val intent = Intent(ACTION_SPEECH_RESULT).apply {
            putExtra(EXTRA_TEXT, text)
            putExtra(EXTRA_CONFIDENCE, confidence)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendPartialResult(text: String) {
        val intent = Intent(ACTION_SPEECH_PARTIAL).apply {
            putExtra(EXTRA_TEXT, text)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendError(code: Int, message: String) {
        val intent = Intent(ACTION_SPEECH_ERROR).apply {
            putExtra(EXTRA_ERROR_CODE, code)
            putExtra(EXTRA_ERROR_MESSAGE, message)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendState(isListening: Boolean) {
        val intent = Intent(ACTION_SPEECH_STATE).apply {
            putExtra(EXTRA_IS_LISTENING, isListening)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.d(TAG, "onNewIntent: ${intent.action}")
        handleIntent(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        isListening = false
        speechRecognizer?.destroy()
        speechRecognizer = null
        Log.d(TAG, "GlassesActivity destroyed")
    }
}

/**
 * UI State for the glasses display
 */
data class GlassesUiState(
    val isListening: Boolean = false,
    val transcript: String = "",
    val partialTranscript: String = "",
    val aiResponse: String = "",
    val error: String? = null
)
