package expo.modules.xrglasses.glasses

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import androidx.activity.result.ActivityResultLauncher
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
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

        // Track activity instances for debugging
        private var instanceCount = 0
        private var activeInstances = 0

        // Broadcast actions for IPC to phone (outgoing)
        const val ACTION_SPEECH_RESULT = "expo.modules.xrglasses.SPEECH_RESULT"
        const val ACTION_SPEECH_PARTIAL = "expo.modules.xrglasses.SPEECH_PARTIAL"
        const val ACTION_SPEECH_ERROR = "expo.modules.xrglasses.SPEECH_ERROR"
        const val ACTION_SPEECH_STATE = "expo.modules.xrglasses.SPEECH_STATE"

        // Broadcast actions from phone (incoming)
        const val ACTION_CLOSE_GLASSES = "expo.modules.xrglasses.CLOSE_GLASSES"
        const val ACTION_START_LISTENING = "expo.modules.xrglasses.CMD_START_LISTENING"
        const val ACTION_STOP_LISTENING = "expo.modules.xrglasses.CMD_STOP_LISTENING"

        // Extras - Speech
        const val EXTRA_TEXT = "text"
        const val EXTRA_CONTINUOUS = "continuous"
        const val EXTRA_CONFIDENCE = "confidence"
        const val EXTRA_ERROR_CODE = "error_code"
        const val EXTRA_ERROR_MESSAGE = "error_message"
        const val EXTRA_IS_LISTENING = "is_listening"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var continuousMode = false
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var isActivityDestroyed = false

    // Broadcast receiver to handle close command from phone
    private val closeReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?,
            ) {
                if (intent?.action == ACTION_CLOSE_GLASSES) {
                    Log.d(TAG, "Received close command from phone, finishing activity")
                    finish()
                }
            }
        }

    // Broadcast receiver to handle speech commands from phone (glasses-first ASR)
    private val speechCommandReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?,
            ) {
                when (intent?.action) {
                    ACTION_START_LISTENING -> {
                        Log.d(TAG, "Received START_LISTENING command from phone")
                        continuousMode = intent.getBooleanExtra(EXTRA_CONTINUOUS, true)
                        if (speechRecognizer == null && isPermissionGranted) {
                            initSpeechRecognizer()
                        }
                        startListening()
                    }
                    ACTION_STOP_LISTENING -> {
                        Log.d(TAG, "Received STOP_LISTENING command from phone")
                        stopListening()
                    }
                }
            }
        }

    // Track permission state for UI
    private var isPermissionGranted by mutableStateOf(false)

    // Required permissions for glasses functionality
    private val requiredPermissions = listOf(Manifest.permission.RECORD_AUDIO)

    // Projected Permissions launcher - uses XR SDK to request permissions across projected context
    private var projectedPermissionLauncher: ActivityResultLauncher<*>? = null

    // UI State
    private val _uiState = MutableStateFlow(GlassesUiState())
    val uiState: StateFlow<GlassesUiState> = _uiState.asStateFlow()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instanceCount++
        activeInstances++
        Log.d(TAG, "GlassesActivity created on glasses display (instance #$instanceCount, active: $activeInstances)")

        // Register close receiver to handle disconnect from phone
        val closeFilter = IntentFilter(ACTION_CLOSE_GLASSES)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(closeReceiver, closeFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(closeReceiver, closeFilter)
        }

        // Register speech command receiver for glasses-first ASR
        val speechFilter =
            IntentFilter().apply {
                addAction(ACTION_START_LISTENING)
                addAction(ACTION_STOP_LISTENING)
            }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(speechCommandReceiver, speechFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(speechCommandReceiver, speechFilter)
        }

        // Try to set up projected permissions launcher via reflection
        setupProjectedPermissionsLauncher()

        // Check initial permission state
        isPermissionGranted = checkAudioPermission()

        setContent {
            GlassesScreen(
                uiState = uiState.collectAsStateWithLifecycle().value,
                onClose = { finish() },
            )
        }

        if (isPermissionGranted) {
            Log.d(TAG, "RECORD_AUDIO permission granted, initializing speech")
            initSpeechRecognizer()
            handleIntent(intent)
        } else {
            Log.w(TAG, "RECORD_AUDIO permission not granted - requesting via projected API")
            updateUiState { copy(error = "Mic permission needed - grant on phone") }
            // Try to request permission using projected API
            requestProjectedPermissions()
        }
    }

    /**
     * Set up the ProjectedPermissionsResultContract launcher via reflection.
     * This allows permissions to work properly across the projected context.
     */
    private fun setupProjectedPermissionsLauncher() {
        try {
            // Try to load the projected permissions classes
            val contractClass = Class.forName("androidx.xr.projected.permissions.ProjectedPermissionsResultContract")
            val paramsClass = Class.forName("androidx.xr.projected.permissions.ProjectedPermissionsRequestParams")

            // Create the contract instance
            val contract = contractClass.getDeclaredConstructor().newInstance()

            // Register for activity result
            projectedPermissionLauncher =
                registerForActivityResult(
                    contract as androidx.activity.result.contract.ActivityResultContract<Any, Any>,
                ) { results ->
                    Log.d(TAG, "Projected permission results: $results")
                    handleProjectedPermissionResults(results)
                }

            Log.d(TAG, "ProjectedPermissionsResultContract set up successfully")
        } catch (e: Exception) {
            Log.w(TAG, "Could not set up projected permissions (may not be available): ${e.message}")
            // Fall back to standard permission request
        }
    }

    /**
     * Request permissions using the Projected Permissions API.
     */
    private fun requestProjectedPermissions() {
        try {
            val launcher = projectedPermissionLauncher
            if (launcher != null) {
                // Create ProjectedPermissionsRequestParams
                val paramsClass = Class.forName("androidx.xr.projected.permissions.ProjectedPermissionsRequestParams")
                val constructor =
                    paramsClass.constructors.find {
                        it.parameterCount == 2 || it.parameterCount == 3
                    }

                if (constructor != null) {
                    constructor.isAccessible = true
                    val params =
                        if (constructor.parameterCount == 2) {
                            constructor.newInstance(requiredPermissions, "Microphone access needed for voice commands")
                        } else {
                            constructor.newInstance(requiredPermissions, "Microphone access needed for voice commands", null)
                        }

                    // Launch with list of params
                    @Suppress("UNCHECKED_CAST")
                    (launcher as ActivityResultLauncher<List<Any>>).launch(listOf(params))
                    Log.d(TAG, "Launched projected permission request")
                    return
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not request projected permissions: ${e.message}")
        }

        // Fallback: just show message since standard permission dialogs don't work on glasses
        Log.d(TAG, "Falling back to permission message - grant on phone")
    }

    /**
     * Handle results from projected permission request.
     */
    private fun handleProjectedPermissionResults(results: Any?) {
        try {
            if (results is Map<*, *>) {
                val granted =
                    requiredPermissions.all { permission ->
                        results[permission] == true
                    }

                isPermissionGranted = granted

                if (granted) {
                    Log.d(TAG, "Projected permissions granted!")
                    updateUiState { copy(error = null) }
                    initSpeechRecognizer()
                    handleIntent(intent)
                } else {
                    Log.w(TAG, "Projected permissions denied")
                    updateUiState { copy(error = "Mic permission denied") }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling permission results: ${e.message}")
        }
    }

    private fun checkAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private var useNetworkRecognizer = false

    private fun initSpeechRecognizer() {
        val onDeviceAvailable =
            try {
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

        speechRecognizer =
            if (onDeviceAvailable && !useNetworkRecognizer) {
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

    private fun createRecognitionListener() =
        object : RecognitionListener {
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
                        mainHandler.postDelayed({
                            if (!isActivityDestroyed) startListeningInternal()
                        }, 100)
                    }
                    return
                }

                val errorMessage =
                    when (error) {
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
                        if (!isActivityDestroyed && isListening) startListeningInternal()
                    }, 500)
                }
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

                if (!matches.isNullOrEmpty()) {
                    val bestIndex =
                        if (confidences != null && confidences.isNotEmpty()) {
                            confidences.indices.maxByOrNull { confidences[it] } ?: 0
                        } else {
                            0
                        }

                    val text = matches[bestIndex]
                    val confidence = confidences?.getOrNull(bestIndex) ?: 0f

                    Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")
                    updateUiState {
                        copy(
                            transcript = text,
                            partialTranscript = "",
                            isListening = false,
                        )
                    }
                    sendResult(text, confidence)
                }

                if (continuousMode && isListening) {
                    mainHandler.postDelayed({
                        if (!isActivityDestroyed && isListening) startListeningInternal()
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

            override fun onEvent(
                eventType: Int,
                params: Bundle?,
            ) {
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
            "expo.modules.xrglasses.START_LISTENING",
            -> {
                if (intent.getBooleanExtra("start_listening", false) ||
                    intent.action == "expo.modules.xrglasses.START_LISTENING"
                ) {
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
        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
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
    private fun sendResult(
        text: String,
        confidence: Float,
    ) {
        val intent =
            Intent(ACTION_SPEECH_RESULT).apply {
                putExtra(EXTRA_TEXT, text)
                putExtra(EXTRA_CONFIDENCE, confidence)
                setPackage(packageName)
            }
        sendBroadcast(intent)
    }

    private fun sendPartialResult(text: String) {
        val intent =
            Intent(ACTION_SPEECH_PARTIAL).apply {
                putExtra(EXTRA_TEXT, text)
                setPackage(packageName)
            }
        sendBroadcast(intent)
    }

    private fun sendError(
        code: Int,
        message: String,
    ) {
        val intent =
            Intent(ACTION_SPEECH_ERROR).apply {
                putExtra(EXTRA_ERROR_CODE, code)
                putExtra(EXTRA_ERROR_MESSAGE, message)
                setPackage(packageName)
            }
        sendBroadcast(intent)
    }

    private fun sendState(isListening: Boolean) {
        val intent =
            Intent(ACTION_SPEECH_STATE).apply {
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
        isActivityDestroyed = true
        activeInstances--

        // Remove all pending handler callbacks to prevent leaks
        mainHandler.removeCallbacksAndMessages(null)

        // Unregister receivers
        try {
            unregisterReceiver(closeReceiver)
        } catch (e: Exception) {
            // Ignore if already unregistered
        }
        try {
            unregisterReceiver(speechCommandReceiver)
        } catch (e: Exception) {
            // Ignore if already unregistered
        }

        // Clean up speech recognizer
        isListening = false
        continuousMode = false
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null

        Log.d(TAG, "GlassesActivity destroyed (instance #$instanceCount, remaining active: $activeInstances)")

        // Warn if there are leaked instances
        if (activeInstances < 0) {
            Log.e(TAG, "WARNING: activeInstances went negative ($activeInstances) - tracking error!")
            activeInstances = 0
        }
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
    val error: String? = null,
)
