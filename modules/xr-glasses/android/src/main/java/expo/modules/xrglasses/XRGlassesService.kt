package expo.modules.xrglasses

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
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/**
 * Engagement mode state representing visuals and audio status.
 */
data class EngagementMode(
    val visualsOn: Boolean,
    val audioOn: Boolean
)

/**
 * Device capabilities data class.
 * Reflects actual AI glasses hardware capabilities.
 */
data class DeviceCapabilities(
    val isXrPeripheral: Boolean,    // Device is XR glasses
    val hasXrProjection: Boolean,   // Device can project to glasses
    val hasTouchInput: Boolean,     // Has touchpad/touch input
    val hasCamera: Boolean,         // Has camera
    val hasMicrophone: Boolean,     // Has microphone
    val hasAudioOutput: Boolean     // Has speakers
)

/**
 * Connection state enum.
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

/**
 * XRGlassesService - Core service for XR Glasses communication.
 *
 * This service handles all communication with XR glasses hardware using
 * Jetpack XR Projected APIs when available. It falls back gracefully
 * when the XR SDK is not present.
 */
class XRGlassesService(
    private val context: Context,
    private val module: XRGlassesModule
) {
    companion object {
        private const val TAG = "XRGlassesService"

        // Real Android XR feature constants (discovered from actual device features)
        private const val FEATURE_XR_PERIPHERAL = "android.hardware.type.xr_peripheral"  // Device is XR glasses
        private const val FEATURE_XR_PROJECTED = "com.google.android.feature.XR_PROJECTED"  // Phone can project to glasses
        private const val FEATURE_TOUCHSCREEN = "android.hardware.touchscreen"  // Has touch input (touchpad)
        private const val FEATURE_CAMERA = "android.hardware.camera"  // Has camera
        private const val FEATURE_MICROPHONE = "android.hardware.microphone"  // Has microphone
        private const val FEATURE_AUDIO_OUTPUT = "android.hardware.audio.output"  // Has speakers
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Connection state
    private var connectionState = ConnectionState.DISCONNECTED
    private var isConnected = false

    // XR SDK availability
    private var xrSdkAvailable = false
    private var projectedContextInstance: Any? = null
    private var glassesContext: android.content.Context? = null  // Context for the connected glasses

    // Emulation mode for testing
    private var emulationMode = false
    private var emulatedEngagementMode = EngagementMode(visualsOn = false, audioOn = false)
    private var emulatedCapabilities = DeviceCapabilities(
        isXrPeripheral = true,
        hasXrProjection = false,  // Emulated glasses don't project, they receive
        hasTouchInput = true,
        hasCamera = true,
        hasMicrophone = true,
        hasAudioOutput = true
    )

    // Flow for connection state changes
    private val _connectionStateFlow = MutableStateFlow(false)
    val connectionStateFlow: StateFlow<Boolean> = _connectionStateFlow.asStateFlow()

    // Job for monitoring connection state
    private var connectionMonitorJob: Job? = null

    // Speech recognition
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var continuousMode = false
    private var useNetworkRecognizer = false  // Falls back to true if on-device fails
    private val mainHandler = Handler(Looper.getMainLooper())

    // Camera capture
    private var cameraManager: GlassesCameraManager? = null
    private var isCameraInitialized = false

    init {
        Log.d(TAG, "XRGlassesService initialized")
        checkXrSdkAvailability()
        detectXRCapabilities()
    }

    /**
     * Check if Jetpack XR SDK is available.
     */
    private fun checkXrSdkAvailability() {
        try {
            // Try to load the ProjectedContext class
            Class.forName("androidx.xr.projected.ProjectedContext")
            xrSdkAvailable = true
            Log.d(TAG, "Jetpack XR SDK is available")
        } catch (e: ClassNotFoundException) {
            xrSdkAvailable = false
            Log.d(TAG, "Jetpack XR SDK not available, will use emulation mode")
        }
    }

    /**
     * Detect available XR capabilities on this device (the phone).
     */
    private fun detectXRCapabilities() {
        val pm = context.packageManager

        val hasXrProjection = pm.hasSystemFeature(FEATURE_XR_PROJECTED)
        val isXrPeripheral = pm.hasSystemFeature(FEATURE_XR_PERIPHERAL)
        val hasTouchInput = pm.hasSystemFeature(FEATURE_TOUCHSCREEN)
        val hasCamera = pm.hasSystemFeature(FEATURE_CAMERA)
        val hasMicrophone = pm.hasSystemFeature(FEATURE_MICROPHONE)
        val hasAudioOutput = pm.hasSystemFeature(FEATURE_AUDIO_OUTPUT)

        Log.d(TAG, "Phone XR Capabilities - XR Projection: $hasXrProjection, " +
                "XR Peripheral: $isXrPeripheral, Touch: $hasTouchInput, " +
                "Camera: $hasCamera, Mic: $hasMicrophone, Audio: $hasAudioOutput")

        // Check if Jetpack XR Projected is available via reflection
        val hasProjectedSupport = checkProjectedContextAvailable()
        Log.d(TAG, "Projected context available: $hasProjectedSupport")

        if (!hasProjectedSupport && !hasXrProjection) {
            Log.d(TAG, "No XR projection support detected, emulation mode available")
        }
    }

    /**
     * Check if ProjectedContext is available using reflection.
     */
    private fun checkProjectedContextAvailable(): Boolean {
        if (!xrSdkAvailable) return false

        return try {
            // Try ProjectedActivityCompat.Companion to check availability
            val companionClass = Class.forName("androidx.xr.projected.ProjectedActivityCompat\$Companion")
            Log.d(TAG, "ProjectedActivityCompat.Companion found, XR projection may be available")
            true
        } catch (e: Exception) {
            Log.d(TAG, "checkProjectedContextAvailable failed: ${e.message}")
            false
        }
    }

    /**
     * Check if running in a projected device context.
     */
    suspend fun isProjectedDevice(): Boolean = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext true
        }

        return@withContext checkProjectedContextAvailable()
    }

    /**
     * Check if glasses are currently connected.
     */
    suspend fun isGlassesConnected(): Boolean = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext isConnected
        }

        // Check via Jetpack XR if available
        if (xrSdkAvailable && projectedContextInstance != null) {
            try {
                val ctx = projectedContextInstance!!
                val method = ctx.javaClass.getMethod("isConnected")
                return@withContext method.invoke(ctx) as? Boolean ?: isConnected
            } catch (e: Exception) {
                Log.e(TAG, "Error checking glasses connection via SDK", e)
            }
        }

        return@withContext isConnected
    }

    /**
     * Connect to the XR glasses.
     * Validates device compatibility before attempting connection.
     */
    suspend fun connect() = withContext(Dispatchers.Main) {
        Log.d(TAG, "Connecting to XR glasses (emulation: $emulationMode, xrSdkAvailable: $xrSdkAvailable)")

        connectionState = ConnectionState.CONNECTING

        if (emulationMode) {
            // Simulate connection delay
            delay(500)
            isConnected = true
            connectionState = ConnectionState.CONNECTED
            emulatedEngagementMode = EngagementMode(visualsOn = true, audioOn = true)

            _connectionStateFlow.value = true
            module.emitEvent("onConnectionStateChanged", mapOf("connected" to true))
            module.emitEvent("onEngagementModeChanged", mapOf(
                "visualsOn" to true,
                "audioOn" to true
            ))

            Log.d(TAG, "Emulated connection established")
            return@withContext
        }

        // Validate device compatibility before attempting real connection
        val pm = context.packageManager
        val hasXrProjection = pm.hasSystemFeature(FEATURE_XR_PROJECTED)

        if (!xrSdkAvailable) {
            val errorMsg = "This device does not support XR glasses. The Jetpack XR SDK is not available."
            Log.e(TAG, errorMsg)
            connectionState = ConnectionState.ERROR
            module.emitEvent("onDeviceStateChanged", mapOf(
                "state" to "INCOMPATIBLE_DEVICE",
                "error" to errorMsg
            ))
            throw Exception(errorMsg)
        }

        if (!hasXrProjection) {
            val errorMsg = "This device does not support XR projection. Please use a compatible phone with Android XR support."
            Log.e(TAG, errorMsg)
            connectionState = ConnectionState.ERROR
            module.emitEvent("onDeviceStateChanged", mapOf(
                "state" to "MISSING_XR_PROJECTION",
                "error" to errorMsg
            ))
            throw Exception(errorMsg)
        }

        // Real connection via Jetpack XR Projected
        if (xrSdkAvailable) {
            try {
                if (projectedContextInstance == null) {
                    Log.d(TAG, "Attempting to create ProjectedActivityCompat...")

                    // Use Kotlin reflection to call the suspend function
                    val activityCompatClass = Class.forName("androidx.xr.projected.ProjectedActivityCompat")
                    val companionField = activityCompatClass.getDeclaredField("Companion")
                    val companion = companionField.get(null)

                    // Try to call create(Context) - it's a suspend function
                    val createMethod = companion.javaClass.methods.find { it.name == "create" }
                    if (createMethod != null) {
                        Log.d(TAG, "Found create method, invoking...")

                        // For suspend functions via reflection, we need to use coroutines
                        // The method takes (Context, Continuation) - we'll use suspendCoroutine
                        val result = kotlinx.coroutines.suspendCancellableCoroutine<Any?> { continuation ->
                            try {
                                val invoked = createMethod.invoke(companion, context, continuation)
                                // If it returns COROUTINE_SUSPENDED, the continuation will be resumed later
                                if (invoked != kotlin.coroutines.intrinsics.COROUTINE_SUSPENDED) {
                                    continuation.resume(invoked) {}
                                }
                            } catch (e: Exception) {
                                continuation.cancel(e)
                            }
                        }

                        projectedContextInstance = result
                        Log.d(TAG, "ProjectedActivityCompat.create returned: $result")

                        if (result != null) {
                            Log.d(TAG, "Available methods on result: ${result.javaClass.methods.map { it.name }}")

                            // Try to get the glasses device context for capability queries
                            try {
                                val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
                                val createDeviceContextMethod = projectedContextClass.methods.find {
                                    it.name == "createProjectedDeviceContext"
                                }
                                if (createDeviceContextMethod != null) {
                                    val deviceContext = createDeviceContextMethod.invoke(null, context)
                                    if (deviceContext is android.content.Context) {
                                        glassesContext = deviceContext
                                        Log.d(TAG, "Got glasses device context for capability queries")
                                    }
                                }
                            } catch (e: Exception) {
                                Log.d(TAG, "Could not get glasses context: ${e.message}")
                            }

                            isConnected = true
                            connectionState = ConnectionState.CONNECTED
                            _connectionStateFlow.value = true
                            module.emitEvent("onConnectionStateChanged", mapOf("connected" to true))
                            module.emitEvent("onEngagementModeChanged", mapOf(
                                "visualsOn" to true,
                                "audioOn" to true
                            ))
                            Log.d(TAG, "Real XR connection established!")
                        } else {
                            throw Exception("create() returned null")
                        }
                    } else {
                        throw Exception("create method not found on Companion")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed: ${e.message}", e)
                connectionState = ConnectionState.ERROR

                // Provide user-friendly error messages
                val userMessage = when {
                    e.message?.contains("no service") == true || e.message?.contains("System doesn't include") == true ->
                        "No XR glasses detected. Please ensure your glasses are paired and connected via the Glasses companion app."
                    e.message?.contains("null") == true ->
                        "Failed to establish connection with XR glasses. Please try again."
                    else ->
                        e.message ?: "Connection failed. Please check your glasses are powered on and paired."
                }

                module.emitEvent("onDeviceStateChanged", mapOf(
                    "state" to "CONNECTION_FAILED",
                    "error" to userMessage
                ))
                throw Exception(userMessage)
            }
        }
    }

    /**
     * Start polling for connection state changes.
     */
    private fun startConnectionPolling() {
        connectionMonitorJob?.cancel()
        connectionMonitorJob = scope.launch {
            while (isActive && !isConnected) {
                delay(1000) // Poll every second

                val ctx = projectedContextInstance ?: break
                try {
                    val isConnectedMethod = ctx.javaClass.getMethod("isConnected")
                    val connected = isConnectedMethod.invoke(ctx) as? Boolean ?: false

                    if (connected && !isConnected) {
                        isConnected = true
                        connectionState = ConnectionState.CONNECTED
                        _connectionStateFlow.value = true
                        module.emitEvent("onConnectionStateChanged", mapOf("connected" to true))
                        module.emitEvent("onEngagementModeChanged", mapOf(
                            "visualsOn" to true,
                            "audioOn" to true
                        ))
                        Log.d(TAG, "Connection detected via polling")
                        break
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error polling connection state", e)
                }
            }
        }
    }

    /**
     * Disconnect from the XR glasses.
     */
    suspend fun disconnect() = withContext(Dispatchers.Main) {
        Log.d(TAG, "Disconnecting from XR glasses")

        connectionMonitorJob?.cancel()
        connectionMonitorJob = null

        isConnected = false
        connectionState = ConnectionState.DISCONNECTED

        if (emulationMode) {
            emulatedEngagementMode = EngagementMode(visualsOn = false, audioOn = false)
        }

        // Clean up projected context
        if (projectedContextInstance != null) {
            try {
                val closeMethod = projectedContextInstance!!.javaClass.getMethod("close")
                closeMethod.invoke(projectedContextInstance)
            } catch (e: Exception) {
                Log.d(TAG, "Could not close ProjectedContext: ${e.message}")
            }
            projectedContextInstance = null
        }

        // Clean up glasses context
        glassesContext = null

        _connectionStateFlow.value = false
        module.emitEvent("onConnectionStateChanged", mapOf("connected" to false))

        Log.d(TAG, "Disconnected")
    }

    /**
     * Check if glasses can display visuals.
     */
    suspend fun isDisplayCapable(): Boolean = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext isConnected && emulatedEngagementMode.visualsOn
        }

        return@withContext isConnected
    }

    /**
     * Control screen always-on behavior.
     */
    suspend fun setKeepScreenOn(enabled: Boolean) = withContext(Dispatchers.Main) {
        Log.d(TAG, "Setting keep screen on: $enabled")

        if (emulationMode) {
            Log.d(TAG, "Emulated: Keep screen on set to $enabled")
            module.emitEvent("onInputEvent", mapOf(
                "action" to if (enabled) "SCREEN_ON_ENABLED" else "SCREEN_ON_DISABLED",
                "timestamp" to System.currentTimeMillis()
            ))
            return@withContext
        }

        // In real mode, would use ProjectedDisplayController
        Log.d(TAG, "Keep screen on set to $enabled")
    }

    /**
     * Get current engagement mode.
     */
    suspend fun getEngagementMode(): EngagementMode = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext emulatedEngagementMode
        }

        // For real connection, return based on connection state
        return@withContext EngagementMode(
            visualsOn = isConnected,
            audioOn = isConnected
        )
    }

    /**
     * Get device capabilities.
     * When connected to glasses, queries the glasses' actual system features.
     * Otherwise returns the phone's capabilities.
     */
    suspend fun getDeviceCapabilities(): Map<String, Any> = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext mapOf(
                "isXrPeripheral" to emulatedCapabilities.isXrPeripheral,
                "hasXrProjection" to emulatedCapabilities.hasXrProjection,
                "hasTouchInput" to emulatedCapabilities.hasTouchInput,
                "hasCamera" to emulatedCapabilities.hasCamera,
                "hasMicrophone" to emulatedCapabilities.hasMicrophone,
                "hasAudioOutput" to emulatedCapabilities.hasAudioOutput,
                "isEmulated" to true,
                "deviceType" to "emulated_glasses"
            )
        }

        // Use glasses context if connected, otherwise use phone context
        val targetContext = if (isConnected && glassesContext != null) {
            Log.d(TAG, "Querying capabilities from connected glasses")
            glassesContext!!
        } else {
            Log.d(TAG, "Querying capabilities from phone (not connected to glasses)")
            context
        }

        val pm = targetContext.packageManager
        val isXrPeripheral = pm.hasSystemFeature(FEATURE_XR_PERIPHERAL)
        val hasXrProjection = pm.hasSystemFeature(FEATURE_XR_PROJECTED)
        val hasTouchInput = pm.hasSystemFeature(FEATURE_TOUCHSCREEN)
        val hasCamera = pm.hasSystemFeature(FEATURE_CAMERA)
        val hasMicrophone = pm.hasSystemFeature(FEATURE_MICROPHONE)
        val hasAudioOutput = pm.hasSystemFeature(FEATURE_AUDIO_OUTPUT)

        Log.d(TAG, "Capabilities - XR Peripheral: $isXrPeripheral, XR Projection: $hasXrProjection, " +
                "Touch: $hasTouchInput, Camera: $hasCamera, Mic: $hasMicrophone, Audio: $hasAudioOutput")

        return@withContext mapOf(
            "isXrPeripheral" to isXrPeripheral,
            "hasXrProjection" to hasXrProjection,
            "hasTouchInput" to hasTouchInput,
            "hasCamera" to hasCamera,
            "hasMicrophone" to hasMicrophone,
            "hasAudioOutput" to hasAudioOutput,
            "isEmulated" to false,
            "xrSdkAvailable" to xrSdkAvailable,
            "deviceType" to if (isConnected && glassesContext != null) "glasses" else "phone"
        )
    }

    /**
     * Enable or disable emulation mode.
     */
    suspend fun setEmulationMode(enabled: Boolean) = withContext(Dispatchers.Main) {
        Log.d(TAG, "Setting emulation mode: $enabled")
        emulationMode = enabled

        if (!enabled && isConnected) {
            disconnect()
        }

        module.emitEvent("onDeviceStateChanged", mapOf(
            "state" to if (enabled) "EMULATION_ENABLED" else "EMULATION_DISABLED"
        ))
    }

    /**
     * Simulate an input event for testing.
     * Only works in emulation mode.
     */
    suspend fun simulateInputEvent(action: String) = withContext(Dispatchers.Main) {
        if (!emulationMode) {
            Log.w(TAG, "simulateInputEvent only works in emulation mode")
            return@withContext
        }

        Log.d(TAG, "Simulating input event: $action")

        val timestamp = System.currentTimeMillis()
        module.emitEvent("onInputEvent", mapOf(
            "action" to action,
            "timestamp" to timestamp
        ))

        // Handle specific simulated actions
        when (action) {
            "TOGGLE_VISUALS" -> {
                emulatedEngagementMode = emulatedEngagementMode.copy(
                    visualsOn = !emulatedEngagementMode.visualsOn
                )
                module.emitEvent("onEngagementModeChanged", mapOf(
                    "visualsOn" to emulatedEngagementMode.visualsOn,
                    "audioOn" to emulatedEngagementMode.audioOn
                ))
            }
            "TOGGLE_AUDIO" -> {
                emulatedEngagementMode = emulatedEngagementMode.copy(
                    audioOn = !emulatedEngagementMode.audioOn
                )
                module.emitEvent("onEngagementModeChanged", mapOf(
                    "visualsOn" to emulatedEngagementMode.visualsOn,
                    "audioOn" to emulatedEngagementMode.audioOn
                ))
            }
            "DISCONNECT" -> {
                disconnect()
            }
        }
    }

    // ============================================================
    // Speech Recognition (runs on phone, uses glasses mic via projected context)
    // ============================================================

    /**
     * Initialize speech recognizer.
     * Always uses phone context (which has RECORD_AUDIO permission).
     * When connected via Jetpack XR, the system routes glasses mic audio automatically.
     * Tries on-device first for low latency, falls back to network if language packs unavailable.
     */
    private fun initSpeechRecognizer() {
        // Always use phone context for SpeechRecognizer - it has the RECORD_AUDIO permission
        // When connected via Jetpack XR, audio from glasses mic is routed automatically
        val recognizerContext = context
        Log.d(TAG, "Creating speech recognizer with phone context (connected=$isConnected)")

        if (!SpeechRecognizer.isRecognitionAvailable(recognizerContext)) {
            Log.e(TAG, "Speech recognition not available")
            module.emitEvent("onSpeechError", mapOf(
                "code" to -1,
                "message" to "Speech recognition not available on this device",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

        speechRecognizer = if (useNetworkRecognizer) {
            Log.d(TAG, "Creating network-based speech recognizer")
            SpeechRecognizer.createSpeechRecognizer(recognizerContext)
        } else {
            // Try on-device first for lower latency
            try {
                Log.d(TAG, "Creating on-device speech recognizer")
                SpeechRecognizer.createOnDeviceSpeechRecognizer(recognizerContext)
            } catch (e: Exception) {
                Log.w(TAG, "On-device recognizer failed, using network: ${e.message}")
                useNetworkRecognizer = true
                SpeechRecognizer.createSpeechRecognizer(recognizerContext)
            }
        }

        speechRecognizer?.setRecognitionListener(createRecognitionListener())
        Log.d(TAG, "SpeechRecognizer initialized (network=$useNetworkRecognizer)")
    }

    // Track audio levels for debugging
    private var lastLoggedRms = 0L
    private var maxRmsThisSession = -100f

    private fun createRecognitionListener() = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "Speech: Ready for speech - SPEAK NOW")
            maxRmsThisSession = -100f  // Reset max RMS for new session
            module.emitEvent("onSpeechStateChanged", mapOf(
                "isListening" to true,
                "timestamp" to System.currentTimeMillis()
            ))
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech: Beginning of speech DETECTED - voice activity found!")
        }

        override fun onRmsChanged(rmsdB: Float) {
            // Track max audio level
            if (rmsdB > maxRmsThisSession) {
                maxRmsThisSession = rmsdB
            }
            // Log audio levels periodically (every 500ms) for debugging
            val now = System.currentTimeMillis()
            if (now - lastLoggedRms > 500) {
                lastLoggedRms = now
                Log.d(TAG, "Speech: Audio level RMS=$rmsdB dB (max this session: $maxRmsThisSession dB)")
                // RMS values: -2 to 10 is typical for speech, negative values indicate silence/low audio
                if (rmsdB < 0) {
                    Log.w(TAG, "Speech: Audio level very low - check microphone input!")
                }
            }
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Log.d(TAG, "Speech: End of speech")
        }

        override fun onError(error: Int) {
            // Error 13 = LANGUAGE_PACK_ERROR (on-device model not available)
            val isLanguagePackError = error == 13

            // If on-device failed with language pack error, switch to network and retry
            if (isLanguagePackError && !useNetworkRecognizer) {
                Log.w(TAG, "On-device language pack not available, switching to network recognizer")
                useNetworkRecognizer = true
                speechRecognizer?.destroy()
                speechRecognizer = null
                initSpeechRecognizer()
                if (isListening) {
                    mainHandler.postDelayed({
                        startListeningInternal()
                    }, 100)
                }
                return
            }

            val errorMessage = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH -> {
                    // Log diagnostic info when no speech detected
                    Log.w(TAG, "Speech: ERROR_NO_MATCH - Max audio RMS this session: $maxRmsThisSession dB")
                    if (maxRmsThisSession < 0) {
                        "No speech detected (microphone may not be working - max audio level: $maxRmsThisSession dB)"
                    } else if (maxRmsThisSession < 2) {
                        "No speech detected (audio level low - max: $maxRmsThisSession dB, try speaking louder)"
                    } else {
                        "No speech detected"
                    }
                }
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout - no voice activity detected"
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error - check microphone permissions and hardware"
                SpeechRecognizer.ERROR_NETWORK -> "Network error - check internet connection"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout - slow internet connection"
                SpeechRecognizer.ERROR_CLIENT -> "Client error - speech recognizer issue"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy - try again"
                SpeechRecognizer.ERROR_SERVER -> "Server error - Google speech service unavailable"
                13 -> "Language pack not available"
                else -> "Recognition error: $error"
            }

            Log.e(TAG, "Speech error: $errorMessage (code: $error, maxRms: $maxRmsThisSession)")
            module.emitEvent("onSpeechError", mapOf(
                "code" to error,
                "message" to errorMessage,
                "timestamp" to System.currentTimeMillis()
            ))

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
                val bestIndex = if (confidences != null && confidences.isNotEmpty()) {
                    confidences.indices.maxByOrNull { confidences[it] } ?: 0
                } else {
                    0
                }

                val text = matches[bestIndex]
                val confidence = confidences?.getOrNull(bestIndex) ?: 0f

                Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")
                module.emitEvent("onSpeechResult", mapOf(
                    "text" to text,
                    "confidence" to confidence,
                    "isFinal" to true,
                    "timestamp" to System.currentTimeMillis()
                ))
            }

            // Restart listening in continuous mode
            if (continuousMode && isListening) {
                mainHandler.postDelayed({
                    if (isListening) {
                        Log.d(TAG, "Speech: Continuous mode - restarting listener")
                        startListeningInternal()
                    }
                }, 100)
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            if (!matches.isNullOrEmpty()) {
                val text = matches[0]
                Log.d(TAG, "Speech partial: '$text'")
                module.emitEvent("onPartialResult", mapOf(
                    "text" to text,
                    "isFinal" to false,
                    "timestamp" to System.currentTimeMillis()
                ))
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

    /**
     * Start speech recognition.
     */
    fun startSpeechRecognition(continuous: Boolean) {
        Log.d(TAG, "Starting speech recognition (continuous: $continuous)")

        if (speechRecognizer == null) {
            initSpeechRecognizer()
        }

        if (speechRecognizer == null) {
            Log.e(TAG, "Failed to initialize speech recognizer")
            return
        }

        continuousMode = continuous
        isListening = true
        startListeningInternal()
    }

    private fun startListeningInternal() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)

        }

        try {
            speechRecognizer?.startListening(intent)
            Log.d(TAG, "Speech recognition started (network=$useNetworkRecognizer) - listening for speech...")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start listening: ${e.message}")
            module.emitEvent("onSpeechError", mapOf(
                "code" to -1,
                "message" to "Failed to start speech recognition: ${e.message}",
                "timestamp" to System.currentTimeMillis()
            ))
        }
    }

    /**
     * Stop speech recognition.
     */
    fun stopSpeechRecognition() {
        Log.d(TAG, "Stopping speech recognition")
        isListening = false
        continuousMode = false
        speechRecognizer?.stopListening()
        module.emitEvent("onSpeechStateChanged", mapOf(
            "isListening" to false,
            "timestamp" to System.currentTimeMillis()
        ))
    }

    /**
     * Check if speech recognition is available.
     */
    fun isSpeechRecognitionAvailable(): Boolean {
        return SpeechRecognizer.isRecognitionAvailable(context)
    }

    // ============================================================
    // Camera Capture (uses ProjectedContext for glasses camera)
    // ============================================================

    /**
     * Initialize camera for capturing images from glasses.
     * Uses ProjectedContext to access glasses camera when connected.
     * Falls back to phone camera in emulation mode.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param lowPowerMode If true, uses lower resolution (640x480 vs 1280x720)
     */
    fun initializeCamera(lifecycleOwner: LifecycleOwner, lowPowerMode: Boolean = false) {
        Log.d(TAG, "Initializing camera (emulation: $emulationMode, lowPower: $lowPowerMode)")

        if (cameraManager != null) {
            Log.d(TAG, "Camera already initialized, releasing first")
            releaseCamera()
        }

        cameraManager = GlassesCameraManager(
            context = context,
            onImageCaptured = { base64, width, height ->
                Log.d(TAG, "Image captured: ${width}x${height}")
                module.emitEvent("onImageCaptured", mapOf(
                    "imageBase64" to base64,
                    "width" to width,
                    "height" to height,
                    "isEmulated" to emulationMode,
                    "timestamp" to System.currentTimeMillis()
                ))
            },
            onError = { message ->
                Log.e(TAG, "Camera error: $message")
                module.emitEvent("onCameraError", mapOf(
                    "message" to message,
                    "timestamp" to System.currentTimeMillis()
                ))
            },
            onCameraStateChanged = { ready ->
                isCameraInitialized = ready
                Log.d(TAG, "Camera state changed: ready=$ready")
                module.emitEvent("onCameraStateChanged", mapOf(
                    "isReady" to ready,
                    "isEmulated" to emulationMode,
                    "timestamp" to System.currentTimeMillis()
                ))
            }
        )

        cameraManager?.initializeCamera(lifecycleOwner, emulationMode, lowPowerMode)
    }

    /**
     * Capture an image from the glasses camera.
     * The result will be delivered via the onImageCaptured event.
     */
    fun captureImage() {
        if (cameraManager == null) {
            Log.e(TAG, "Camera not initialized")
            module.emitEvent("onCameraError", mapOf(
                "message" to "Camera not initialized. Call initializeCamera first.",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

        if (!isCameraInitialized) {
            Log.e(TAG, "Camera not ready")
            module.emitEvent("onCameraError", mapOf(
                "message" to "Camera not ready yet. Wait for onCameraStateChanged event.",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

        cameraManager?.captureImage()
    }

    /**
     * Release camera resources.
     */
    fun releaseCamera() {
        Log.d(TAG, "Releasing camera")
        cameraManager?.release()
        cameraManager = null
        isCameraInitialized = false
    }

    /**
     * Check if camera is initialized and ready.
     */
    fun isCameraReady(): Boolean {
        return isCameraInitialized && cameraManager?.isCameraReady() == true
    }

    /**
     * Cleanup resources.
     */
    fun cleanup() {
        Log.d(TAG, "Cleaning up XRGlassesService")
        connectionMonitorJob?.cancel()
        scope.cancel()

        // Cleanup speech recognizer
        speechRecognizer?.destroy()
        speechRecognizer = null
        isListening = false

        // Cleanup camera
        releaseCamera()

        if (projectedContextInstance != null) {
            try {
                val closeMethod = projectedContextInstance!!.javaClass.getMethod("close")
                closeMethod.invoke(projectedContextInstance)
            } catch (e: Exception) {
                // Ignore cleanup errors
            }
            projectedContextInstance = null
        }

        glassesContext = null
        isConnected = false
        connectionState = ConnectionState.DISCONNECTED
    }
}
