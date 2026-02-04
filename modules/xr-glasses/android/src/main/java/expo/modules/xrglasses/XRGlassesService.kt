package expo.modules.xrglasses

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.xrglasses.stream.AgoraStreamManager
import expo.modules.xrglasses.stream.StreamQuality
import expo.modules.xrglasses.stream.StreamSession
import expo.modules.xrglasses.stream.ViewerInfo
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

        // Track connection cycles for debugging state corruption
        private var connectionCycleCount = 0

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

    // Launch method flag: true = use intermediate activity, false = use direct launch
    // The intermediate activity approach isolates React Native from projected context creation
    private var useIntermediateActivityLaunch = true

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

    // Camera capture (for single image capture)
    private var cameraManager: GlassesCameraManager? = null
    private var isCameraInitialized = false

    // Track if streaming is active to prevent camera conflicts
    private var streamingWasActive = false  // Track if streaming was active before lifecycle pause

    // Remote View streaming (runs in main process, not :xr_process)
    // This is necessary because ProjectedContext.createProjectedDeviceContext()
    // only works from the main process, not from :xr_process
    private var isStreamingActive = false
    private var streamingCameraManager: StreamingCameraManager? = null
    private var agoraStreamManager: AgoraStreamManager? = null
    private var streamingLifecycleOwner: LifecycleOwner? = null
    private var currentStreamQuality: StreamQuality = StreamQuality.BALANCED
    private var currentStreamingCameraSource: String = "unknown"

    // Agora App ID - loaded from BuildConfig (set via .env file)
    private val AGORA_APP_ID: String by lazy {
        try {
            val buildConfigClass = Class.forName("com.xrglasses.app.BuildConfig")
            val field = buildConfigClass.getField("AGORA_APP_ID")
            field.get(null) as? String ?: ""
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get AGORA_APP_ID from BuildConfig", e)
            ""
        }
    }

    // ============================================================
    // Parking Timer (uses coroutine delay - efficient, no CPU waste)
    // ============================================================
    private var parkingTimerJob: Job? = null
    private var parkingTimerEndTime: Long = 0
    private var parkingTimerWarningTime: Long = 0
    private var parkingTimerDurationMinutes: Int = 0
    private var parkingTimerWarningShown = false
    private var parkingTimerExpired = false
    private var alarmRingtone: android.media.Ringtone? = null

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
        connectionCycleCount++
        Log.d(TAG, "Connecting to XR glasses (cycle #$connectionCycleCount, emulation: $emulationMode, xrSdkAvailable: $xrSdkAvailable)")

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
        // NOTE: We intentionally do NOT call ProjectedActivityCompat.create(context) here!
        // Calling any XR SDK methods with the React Native context corrupts RN's rendering.
        // Instead, we verify XR is available and let GlassesActivity handle all XR SDK setup.
        if (xrSdkAvailable) {
            try {
                Log.d(TAG, "XR SDK available, skipping ProjectedActivityCompat.create to preserve RN context")
                Log.d(TAG, "GlassesActivity will handle XR SDK initialization")

                // Mark as connected - actual XR session is managed by GlassesActivity
                isConnected = true
                connectionState = ConnectionState.CONNECTED
                _connectionStateFlow.value = true
                module.emitEvent("onConnectionStateChanged", mapOf("connected" to true))
                module.emitEvent("onEngagementModeChanged", mapOf(
                    "visualsOn" to true,
                    "audioOn" to true
                ))
                Log.d(TAG, "Connection state set, launching GlassesActivity...")

                // Launch the GlassesActivity to project UI onto glasses
                // The intermediate activity and GlassesActivity will handle all XR SDK setup
                launchGlassesActivity()

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

    // Store activity reference for launching glasses activity
    private var currentActivity: android.app.Activity? = null

    /**
     * Set the current activity for launching glasses experiences.
     * Should be called before connect() with the current activity.
     */
    fun setCurrentActivity(activity: android.app.Activity?) {
        currentActivity = activity
    }

    /**
     * Launch the GlassesActivity to display UI on the glasses.
     *
     * Two launch strategies are supported:
     *
     * 1. **Intermediate Activity** (useIntermediateActivityLaunch = true):
     *    Launches ProjectionLauncherActivity which creates the projected context from
     *    ITSELF (not React Native's MainActivity), then launches GlassesActivity.
     *    This isolates React Native from any context corruption.
     *
     * 2. **Direct Launch** (useIntermediateActivityLaunch = false):
     *    Uses createProjectedActivityOptions(context) directly. The official Android XR
     *    docs show this can take a regular context for launching activities.
     *
     * The intermediate activity approach is the default as it's more robust and
     * completely isolates React Native from the projection setup.
     */
    private fun launchGlassesActivity() {
        if (useIntermediateActivityLaunch) {
            launchViaIntermediateActivity()
        } else {
            launchDirectly()
        }
    }

    /**
     * Launch using the intermediate ProjectionLauncherActivity.
     * This approach isolates React Native from the projected context creation.
     */
    private fun launchViaIntermediateActivity() {
        try {
            Log.d(TAG, "Launching GlassesActivity via intermediate ProjectionLauncherActivity...")

            val intent = Intent(context, ProjectionLauncherActivity::class.java).apply {
                action = ProjectionLauncherActivity.ACTION_LAUNCH_GLASSES
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            Log.d(TAG, "ProjectionLauncherActivity started - it will launch GlassesActivity")

            // The XR SDK may launch RequestPermissionsOnHostActivity on the phone display
            // which can temporarily corrupt React Native's UI on first connection after cold start.
            // Emit a refresh hint after a delay to let React Native know it may need to re-render.
            mainHandler.postDelayed({
                Log.d(TAG, "Emitting UI refresh hint after glasses launch")
                module.emitEvent("onUiRefreshNeeded", mapOf(
                    "reason" to "post_glasses_launch",
                    "timestamp" to System.currentTimeMillis()
                ))
            }, 2000) // Emit refresh hint - React side will do navigation refresh to fix corrupted UI

        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch via intermediate activity: ${e.message}", e)
            Log.d(TAG, "Falling back to direct launch...")
            launchDirectly()
        }
    }

    /**
     * Launch GlassesActivity directly with projected activity options.
     * Uses createProjectedActivityOptions(context) without creating a projected device context.
     */
    private fun launchDirectly() {
        try {
            Log.d(TAG, "Launching GlassesActivity directly...")

            // Try to use createProjectedActivityOptions directly with context
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val createOptionsMethod = projectedContextClass.methods.find {
                it.name == "createProjectedActivityOptions"
            }

            if (createOptionsMethod != null) {
                Log.d(TAG, "Found createProjectedActivityOptions, invoking with context...")

                // Use application context to avoid any issues with React Native activity
                val options = createOptionsMethod.invoke(null, context)

                if (options != null) {
                    val intent = Intent(context, expo.modules.xrglasses.glasses.GlassesActivity::class.java).apply {
                        action = "expo.modules.xrglasses.LAUNCH_GLASSES"
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }

                    val toBundleMethod = options.javaClass.getMethod("toBundle")
                    val bundle = toBundleMethod.invoke(options) as Bundle

                    context.startActivity(intent, bundle)
                    Log.d(TAG, "GlassesActivity launched with projected activity options!")
                    return
                }
            }

            // Fallback: simple launch without options (may not project correctly)
            Log.w(TAG, "createProjectedActivityOptions not available, using simple launch")
            launchSimple()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch GlassesActivity directly: ${e.message}", e)
            launchSimple()
        }
    }

    /**
     * Simple launch without projection options.
     * Relies on manifest's requiredDisplayCategory="xr_projected" for routing.
     */
    private fun launchSimple() {
        try {
            val intent = Intent(context, expo.modules.xrglasses.glasses.GlassesActivity::class.java).apply {
                action = "expo.modules.xrglasses.LAUNCH_GLASSES"
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            Log.d(TAG, "GlassesActivity launched via simple launch")
        } catch (e: Exception) {
            Log.e(TAG, "Simple launch failed: ${e.message}", e)
        }
    }

    /**
     * Set the launch method for GlassesActivity.
     * @param useIntermediate true = use ProjectionLauncherActivity, false = direct launch
     */
    fun setLaunchMethod(useIntermediate: Boolean) {
        useIntermediateActivityLaunch = useIntermediate
        Log.d(TAG, "Launch method set to: ${if (useIntermediate) "intermediate activity" else "direct"}")
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
        Log.d(TAG, "Disconnecting from XR glasses (cycle #$connectionCycleCount)")

        connectionMonitorJob?.cancel()
        connectionMonitorJob = null

        isConnected = false
        connectionState = ConnectionState.DISCONNECTED

        if (emulationMode) {
            emulatedEngagementMode = EngagementMode(visualsOn = false, audioOn = false)
        }

        // Send broadcast to close GlassesActivity on glasses
        try {
            val closeIntent = Intent("expo.modules.xrglasses.CLOSE_GLASSES")
            closeIntent.setPackage(context.packageName)
            context.sendBroadcast(closeIntent)
            Log.d(TAG, "Sent close broadcast to GlassesActivity")
        } catch (e: Exception) {
            Log.w(TAG, "Could not send close broadcast: ${e.message}")
        }

        // Clean up projected context
        if (projectedContextInstance != null) {
            try {
                val closeMethod = projectedContextInstance?.javaClass?.getMethod("close")
                closeMethod?.invoke(projectedContextInstance)
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

        // Query phone capabilities (we don't query glasses context to avoid corrupting RN)
        // Note: Glasses hardware capabilities would be queried from within GlassesActivity
        Log.d(TAG, "Querying capabilities from phone")
        val pm = context.packageManager
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
            "deviceType" to "phone"
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

        // IMPORTANT: Don't initialize image capture camera while streaming is active
        // Both use CameraX and unbindAll() would kill the streaming camera
        if (isStreamingActive) {
            Log.w(TAG, "Cannot initialize image capture camera while streaming - would kill streaming camera")
            module.emitEvent("onCameraError", mapOf(
                "message" to "Cannot use camera capture while streaming. Stop streaming first.",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

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

    // ============================================================
    // Remote View Streaming (runs in MAIN PROCESS, not :xr_process)
    // This is necessary because ProjectedContext.createProjectedDeviceContext()
    // only works from the main process.
    // ============================================================

    /**
     * Set the lifecycle owner for streaming camera.
     * Must be called before startRemoteView().
     */
    fun setStreamingLifecycleOwner(owner: LifecycleOwner) {
        streamingLifecycleOwner = owner
    }

    /**
     * Check if required permissions for streaming are granted.
     * Returns a list of missing permissions (empty if all granted).
     */
    private fun checkStreamingPermissions(): List<String> {
        val missing = mutableListOf<String>()

        // Camera permission is required for video
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            missing.add("Camera")
        }

        // Record audio permission is required for audio streaming
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            missing.add("Microphone")
        }

        return missing
    }

    /**
     * Start remote view streaming at the specified quality.
     * Runs in main process using ProjectedContext for camera access.
     *
     * @param quality Quality preset: "low_latency", "balanced", or "high_quality"
     */
    fun startRemoteView(quality: String) {
        Log.d(TAG, "Starting remote view with quality: $quality (main process, emulation: $emulationMode)")

        if (!isConnected) {
            Log.w(TAG, "Cannot start remote view - not connected to glasses")
            module.emitEvent("onStreamError", mapOf(
                "message" to "Not connected to glasses",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

        val lifecycleOwner = streamingLifecycleOwner
        if (lifecycleOwner == null) {
            Log.e(TAG, "Streaming lifecycle owner not set")
            module.emitEvent("onStreamError", mapOf(
                "message" to "Streaming not properly initialized",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }

        // Check permissions before starting
        val missingPermissions = checkStreamingPermissions()
        if (missingPermissions.isNotEmpty()) {
            val permissionMsg = "Missing permissions: ${missingPermissions.joinToString(", ")}"
            Log.e(TAG, "Cannot start streaming - $permissionMsg")
            module.emitEvent("onStreamError", mapOf(
                "message" to "Please grant $permissionMsg permissions in app settings",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }
        Log.d(TAG, "All streaming permissions granted")

        // Parse quality preset
        currentStreamQuality = when (quality) {
            "low_latency" -> StreamQuality.LOW_LATENCY
            "high_quality" -> StreamQuality.HIGH_QUALITY
            else -> StreamQuality.BALANCED
        }

        // Initialize Agora if needed
        if (agoraStreamManager == null) {
            agoraStreamManager = AgoraStreamManager(
                context = context,
                appId = AGORA_APP_ID,
                onStreamStarted = { session ->
                    Log.d(TAG, "Stream started: ${session.viewerUrl}")
                    module.emitEvent("onStreamStarted", mapOf(
                        "channelId" to session.channelId,
                        "viewerUrl" to session.viewerUrl,
                        "quality" to session.quality.displayName,
                        "timestamp" to System.currentTimeMillis()
                    ))
                },
                onStreamStopped = {
                    Log.d(TAG, "Stream stopped")
                    module.emitEvent("onStreamStopped", mapOf(
                        "timestamp" to System.currentTimeMillis()
                    ))
                },
                onStreamError = { error ->
                    Log.e(TAG, "Stream error: $error")
                    module.emitEvent("onStreamError", mapOf(
                        "message" to error,
                        "timestamp" to System.currentTimeMillis()
                    ))
                },
                onViewerUpdate = { count, viewer ->
                    Log.d(TAG, "Viewer update: count=$count")
                    module.emitEvent("onViewerUpdate", mapOf(
                        "viewerCount" to count,
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            )
        }

        // Initialize streaming camera manager
        if (streamingCameraManager == null) {
            streamingCameraManager = StreamingCameraManager(
                context = context,
                onFrame = { buffer, width, height, rotation, timestampMs ->
                    // Push frame to Agora
                    agoraStreamManager?.pushVideoFrameBuffer(buffer, width, height, rotation, timestampMs)
                },
                onError = { error ->
                    Log.e(TAG, "Streaming camera error: $error")
                    module.emitEvent("onStreamError", mapOf(
                        "message" to "Camera error: $error",
                        "timestamp" to System.currentTimeMillis()
                    ))
                },
                onCameraReady = { ready ->
                    Log.d(TAG, "Streaming camera ready: $ready (session ready: ${agoraStreamManager?.isSessionReady()})")
                    // Note: We no longer start Agora here - it's started before camera
                    // This callback just logs camera readiness
                },
                onCameraSourceChanged = { source ->
                    Log.d(TAG, "Streaming camera source changed: $source")
                    currentStreamingCameraSource = source
                    module.emitEvent("onStreamCameraSourceChanged", mapOf(
                        "cameraSource" to source,
                        "isEmulationMode" to emulationMode,  // Keep for backwards compat
                        "isDemoMode" to emulationMode,  // New alias - clearer naming
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            )
        }

        // IMPORTANT: Start Agora stream FIRST, before camera
        // This fixes the race condition where frames were dropped because session wasn't ready
        Log.d(TAG, "Starting Agora stream first (before camera)...")
        val session = agoraStreamManager?.startStream(currentStreamQuality)
        if (session == null) {
            Log.e(TAG, "Failed to start Agora stream")
            module.emitEvent("onStreamError", mapOf(
                "message" to "Failed to start stream - check network connection",
                "timestamp" to System.currentTimeMillis()
            ))
            return
        }
        Log.d(TAG, "Agora stream started successfully, now starting camera...")

        // Start camera capture AFTER Agora session is ready
        // In emulation mode (demo mode), use phone camera for testing
        streamingCameraManager?.startCapture(lifecycleOwner, currentStreamQuality, emulationMode)
        isStreamingActive = true

        // Keep screen on during streaming
        setScreenOn(true)

        Log.d(TAG, "Remote view started - streaming from ${if (emulationMode) "phone camera (demo mode)" else "glasses camera"}")
    }

    /**
     * Stop remote view streaming.
     */
    fun stopRemoteView() {
        Log.d(TAG, "Stopping remote view")

        // Stop camera capture
        streamingCameraManager?.stopCapture()

        // Stop Agora stream
        agoraStreamManager?.stopStream()

        // Allow screen to turn off
        setScreenOn(false)

        isStreamingActive = false
        Log.d(TAG, "Remote view stopped")
    }

    /**
     * Set screen always-on flag during streaming.
     * Uses the Activity's window FLAG_KEEP_SCREEN_ON.
     */
    private fun setScreenOn(enabled: Boolean) {
        try {
            // Get current activity from context
            val activity = context as? android.app.Activity
                ?: (context as? android.content.ContextWrapper)?.baseContext as? android.app.Activity

            if (activity != null) {
                activity.runOnUiThread {
                    if (enabled) {
                        activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        Log.d(TAG, "Screen keep-awake ENABLED")
                    } else {
                        activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        Log.d(TAG, "Screen keep-awake DISABLED")
                    }
                }
            } else {
                Log.w(TAG, "Could not get Activity for screen keep-awake")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set screen on: ${e.message}")
        }
    }

    /**
     * Update stream quality while streaming.
     *
     * @param quality Quality preset: "low_latency", "balanced", or "high_quality"
     */
    fun setRemoteViewQuality(quality: String) {
        Log.d(TAG, "Setting remote view quality: $quality")

        val newQuality = when (quality) {
            "low_latency" -> StreamQuality.LOW_LATENCY
            "high_quality" -> StreamQuality.HIGH_QUALITY
            else -> StreamQuality.BALANCED
        }

        if (newQuality == currentStreamQuality) return

        currentStreamQuality = newQuality

        // Update Agora quality
        agoraStreamManager?.setQuality(newQuality)

        // Update camera quality
        streamingLifecycleOwner?.let { owner ->
            streamingCameraManager?.updateQuality(owner, newQuality)
        }
    }

    /**
     * Check if remote view is currently active.
     */
    fun isRemoteViewActive(): Boolean {
        return isStreamingActive
    }

    // ============================================================
    // Parking Timer Implementation
    // Uses coroutine delay() which suspends efficiently without blocking
    // Similar to Linux sleep/wait - no CPU waste, just scheduling
    // ============================================================

    /**
     * Start a parking timer with the specified duration.
     * Will emit warning event 5 minutes before expiration and alarm event at expiration.
     *
     * @param durationMinutes Timer duration in minutes
     */
    fun startParkingTimer(durationMinutes: Int) {
        Log.d(TAG, "Starting parking timer for $durationMinutes minutes")

        // Cancel existing timer if running
        cancelParkingTimer()

        val now = System.currentTimeMillis()
        val durationMs = durationMinutes * 60 * 1000L
        val warningAdvanceMs = 5 * 60 * 1000L // 5 minutes warning

        parkingTimerDurationMinutes = durationMinutes
        parkingTimerEndTime = now + durationMs
        parkingTimerWarningTime = parkingTimerEndTime - warningAdvanceMs
        parkingTimerWarningShown = false
        parkingTimerExpired = false

        // Emit start event
        module.emitEvent("onParkingTimerStarted", mapOf(
            "durationMinutes" to durationMinutes,
            "endTime" to parkingTimerEndTime,
            "warningTime" to parkingTimerWarningTime,
            "timestamp" to System.currentTimeMillis()
        ))

        // Launch coroutine for efficient waiting (uses delay, not polling)
        parkingTimerJob = scope.launch {
            try {
                // Calculate delay until warning time
                val warningDelayMs = parkingTimerWarningTime - System.currentTimeMillis()

                // Only schedule warning if it's in the future (timer > 5 min)
                if (warningDelayMs > 0) {
                    Log.d(TAG, "Parking timer: waiting ${warningDelayMs}ms until warning")
                    delay(warningDelayMs) // Efficient suspend, no CPU waste

                    if (isActive) {
                        Log.d(TAG, "Parking timer: 5 minute warning!")
                        parkingTimerWarningShown = true
                        playWarningSound()
                        module.emitEvent("onParkingTimerWarning", mapOf(
                            "remainingMinutes" to 5,
                            "remainingMs" to (parkingTimerEndTime - System.currentTimeMillis()),
                            "timestamp" to System.currentTimeMillis()
                        ))
                    }
                }

                // Calculate remaining delay until expiration
                val endDelayMs = parkingTimerEndTime - System.currentTimeMillis()
                if (endDelayMs > 0) {
                    Log.d(TAG, "Parking timer: waiting ${endDelayMs}ms until expiration")
                    delay(endDelayMs) // Efficient suspend
                }

                if (isActive) {
                    Log.d(TAG, "Parking timer: EXPIRED!")
                    parkingTimerExpired = true
                    playAlarmSound()
                    module.emitEvent("onParkingTimerExpired", mapOf(
                        "timestamp" to System.currentTimeMillis()
                    ))
                }
            } catch (e: CancellationException) {
                Log.d(TAG, "Parking timer cancelled")
                throw e // Re-throw to properly cancel
            } catch (e: Exception) {
                Log.e(TAG, "Parking timer error: ${e.message}", e)
            }
        }

        Log.d(TAG, "Parking timer started: ends at $parkingTimerEndTime, warning at $parkingTimerWarningTime")
    }

    /**
     * Cancel the parking timer if running.
     */
    fun cancelParkingTimer() {
        Log.d(TAG, "Cancelling parking timer")

        parkingTimerJob?.cancel()
        parkingTimerJob = null

        // Stop alarm if playing
        stopAlarmSound()

        val wasActive = parkingTimerEndTime > System.currentTimeMillis()

        parkingTimerEndTime = 0
        parkingTimerWarningTime = 0
        parkingTimerDurationMinutes = 0
        parkingTimerWarningShown = false
        parkingTimerExpired = false

        if (wasActive) {
            module.emitEvent("onParkingTimerCancelled", mapOf(
                "timestamp" to System.currentTimeMillis()
            ))
        }
    }

    /**
     * Get current parking timer state.
     * Returns active status, remaining time, and warning/expiration flags.
     */
    fun getParkingTimerState(): Map<String, Any> {
        val now = System.currentTimeMillis()
        val isActive = parkingTimerEndTime > now && parkingTimerJob?.isActive == true
        val remainingMs = if (isActive) parkingTimerEndTime - now else 0L

        return mapOf(
            "isActive" to isActive,
            "remainingMs" to remainingMs,
            "endTime" to parkingTimerEndTime,
            "durationMinutes" to parkingTimerDurationMinutes,
            "warningShown" to parkingTimerWarningShown,
            "expired" to parkingTimerExpired
        )
    }

    /**
     * Stop the alarm sound if it's currently playing.
     */
    fun stopAlarmSound() {
        try {
            alarmRingtone?.stop()
            alarmRingtone = null
            Log.d(TAG, "Alarm sound stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping alarm: ${e.message}")
        }
    }

    /**
     * Play a warning beep sound (5 minutes before timer expires).
     * Uses ToneGenerator for a short, attention-getting beep.
     */
    private fun playWarningSound() {
        try {
            // Play 3 short beeps for warning
            val toneGenerator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
            mainHandler.post {
                toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 200)
            }
            mainHandler.postDelayed({
                toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 200)
            }, 400)
            mainHandler.postDelayed({
                toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 200)
            }, 800)
            mainHandler.postDelayed({
                toneGenerator.release()
            }, 1200)
            Log.d(TAG, "Warning sound played")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play warning sound: ${e.message}", e)
        }
    }

    /**
     * Play the alarm sound when timer expires.
     * Uses the system alarm ringtone for maximum attention.
     * Sound continues until stopAlarmSound() is called.
     */
    private fun playAlarmSound() {
        try {
            // Stop existing alarm if playing
            stopAlarmSound()

            // Get alarm or notification sound
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            if (alarmUri != null) {
                alarmRingtone = RingtoneManager.getRingtone(context, alarmUri)
                alarmRingtone?.play()
                Log.d(TAG, "Alarm sound started")

                // Auto-stop after 30 seconds to prevent endless alarm
                mainHandler.postDelayed({
                    stopAlarmSound()
                }, 30_000)
            } else {
                // Fallback to ToneGenerator if no ringtone available
                Log.w(TAG, "No alarm ringtone found, using ToneGenerator fallback")
                val toneGenerator = ToneGenerator(AudioManager.STREAM_ALARM, 100)
                toneGenerator.startTone(ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK, 5000)
                mainHandler.postDelayed({
                    toneGenerator.release()
                }, 5500)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play alarm sound: ${e.message}", e)
        }
    }

    /**
     * Cleanup resources.
     */
    fun cleanup() {
        Log.d(TAG, "Cleaning up XRGlassesService")
        connectionMonitorJob?.cancel()

        // Cleanup parking timer
        cancelParkingTimer()

        // Cancel scope after parking timer to ensure proper cleanup
        scope.cancel()

        // Cleanup speech recognizer
        speechRecognizer?.destroy()
        speechRecognizer = null
        isListening = false

        // Cleanup camera (image capture)
        releaseCamera()

        // Cleanup streaming
        stopRemoteView()
        streamingCameraManager = null
        agoraStreamManager?.destroy()
        agoraStreamManager = null
        streamingLifecycleOwner = null

        if (projectedContextInstance != null) {
            try {
                val closeMethod = projectedContextInstance?.javaClass?.getMethod("close")
                closeMethod?.invoke(projectedContextInstance)
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
