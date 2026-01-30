package expo.modules.xrglasses.glasses

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * GlassesActivity - Activity that runs ON THE GLASSES hardware.
 *
 * This activity is declared with android:requiredDisplayCategory="xr_projected"
 * which means it runs on the glasses display, not the phone. The SpeechRecognizer
 * created here uses the glasses' microphone directly, avoiding Bluetooth audio latency.
 *
 * Communication with the phone app is done via broadcasts.
 */
class GlassesActivity : Activity() {

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

    // Permission request code
    private val PERMISSION_REQUEST_RECORD_AUDIO = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "GlassesActivity created on glasses display")

        // Check/request microphone permission
        if (checkAudioPermission()) {
            initSpeechRecognizer()
            handleIntent(intent)
        } else {
            requestAudioPermission()
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

        // Try using ProjectedPermissionsResultContract if available
        try {
            val contractClass = Class.forName("androidx.xr.projected.ProjectedPermissionsResultContract")
            val paramsClass = Class.forName("androidx.xr.projected.ProjectedPermissionsRequestParams")

            // For now, fall back to standard permission request
            // ProjectedPermissionsResultContract requires ActivityResultLauncher setup
            requestPermissions(
                arrayOf(Manifest.permission.RECORD_AUDIO),
                PERMISSION_REQUEST_RECORD_AUDIO
            )
        } catch (e: ClassNotFoundException) {
            // ProjectedPermissionsResultContract not available, use standard API
            Log.d(TAG, "Using standard permission request")
            requestPermissions(
                arrayOf(Manifest.permission.RECORD_AUDIO),
                PERMISSION_REQUEST_RECORD_AUDIO
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
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
                sendError(
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS,
                    "Microphone permission denied. Voice commands require microphone access."
                )
                // Finish activity since we can't do speech recognition without permission
                finish()
            }
        }
    }

    private fun initSpeechRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e(TAG, "Speech recognition not available on this device")
            sendError(-1, "Speech recognition not available on this device")
            return
        }

        // Create ON-DEVICE recognizer for low latency
        // This runs on the glasses hardware, using the glasses microphone directly
        speechRecognizer = try {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
        } catch (e: Exception) {
            Log.w(TAG, "On-device recognizer not available, falling back to default: ${e.message}")
            SpeechRecognizer.createSpeechRecognizer(this)
        }

        speechRecognizer?.setRecognitionListener(createRecognitionListener())
        Log.d(TAG, "SpeechRecognizer initialized on glasses")
    }

    private fun createRecognitionListener() = object : RecognitionListener {

        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "Ready for speech")
            sendState(isListening = true)
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech started")
        }

        override fun onRmsChanged(rmsdB: Float) {
            // Could send audio level updates if needed for UI feedback
        }

        override fun onBufferReceived(buffer: ByteArray?) {
            // Raw audio buffer - not typically needed
        }

        override fun onEndOfSpeech() {
            Log.d(TAG, "Speech ended")
        }

        override fun onError(error: Int) {
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
                else -> "Recognition error: $error"
            }

            Log.e(TAG, "Speech error: $errorMessage (code: $error)")
            sendError(error, errorMessage)

            // Restart on recoverable errors if in continuous mode
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
                // Get the best result (highest confidence or first)
                val bestIndex = if (confidences != null && confidences.isNotEmpty()) {
                    confidences.indices.maxByOrNull { confidences[it] } ?: 0
                } else {
                    0
                }

                val text = matches[bestIndex]
                val confidence = confidences?.getOrNull(bestIndex) ?: 0f

                Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")
                sendResult(text, confidence)
            }

            // Restart listening if in continuous mode
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
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            // Prefer offline recognition for lower latency
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
        sendState(isListening = false)
        Log.d(TAG, "Stopped listening")
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
