package expo.modules.xrglasses

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
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
 */
data class DeviceCapabilities(
    val hasController: Boolean,
    val hasHandTracking: Boolean,
    val hasEyeTracking: Boolean,
    val hasSpatialApi: Boolean
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

        // Jetpack XR feature constants
        private const val FEATURE_XR_INPUT_CONTROLLER = "android.hardware.xr.input.controller"
        private const val FEATURE_XR_INPUT_HAND_TRACKING = "android.hardware.xr.input.hand_tracking"
        private const val FEATURE_XR_INPUT_EYE_TRACKING = "android.hardware.xr.input.eye_tracking"
        private const val FEATURE_XR_API_SPATIAL = "android.software.xr.spatial"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Connection state
    private var connectionState = ConnectionState.DISCONNECTED
    private var isConnected = false

    // XR SDK availability
    private var xrSdkAvailable = false
    private var projectedContextInstance: Any? = null

    // Emulation mode for testing
    private var emulationMode = false
    private var emulatedEngagementMode = EngagementMode(visualsOn = false, audioOn = false)
    private var emulatedCapabilities = DeviceCapabilities(
        hasController = true,
        hasHandTracking = true,
        hasEyeTracking = true,
        hasSpatialApi = true
    )

    // Flow for connection state changes
    private val _connectionStateFlow = MutableStateFlow(false)
    val connectionStateFlow: StateFlow<Boolean> = _connectionStateFlow.asStateFlow()

    // Job for monitoring connection state
    private var connectionMonitorJob: Job? = null

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
     * Detect available XR capabilities on this device.
     */
    private fun detectXRCapabilities() {
        val pm = context.packageManager

        val hasController = pm.hasSystemFeature(FEATURE_XR_INPUT_CONTROLLER)
        val hasHandTracking = pm.hasSystemFeature(FEATURE_XR_INPUT_HAND_TRACKING)
        val hasEyeTracking = pm.hasSystemFeature(FEATURE_XR_INPUT_EYE_TRACKING)
        val hasSpatialApi = pm.hasSystemFeature(FEATURE_XR_API_SPATIAL)

        Log.d(TAG, "XR Capabilities detected - Controller: $hasController, " +
                "HandTracking: $hasHandTracking, EyeTracking: $hasEyeTracking, " +
                "SpatialApi: $hasSpatialApi")

        // Check if Jetpack XR Projected is available via reflection
        val hasProjectedSupport = checkProjectedContextAvailable()
        Log.d(TAG, "Projected context available: $hasProjectedSupport")

        if (!hasProjectedSupport && !hasController && !hasHandTracking && !hasEyeTracking && !hasSpatialApi) {
            Log.d(TAG, "No XR hardware detected, emulation mode available")
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
                            // Try to check connection state
                            val isConnectedMethod = result.javaClass.methods.find { it.name == "isProjectedDeviceConnected" }
                            Log.d(TAG, "Available methods on result: ${result.javaClass.methods.map { it.name }}")

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
                module.emitEvent("onDeviceStateChanged", mapOf(
                    "state" to "CONNECTION_FAILED",
                    "error" to (e.message ?: "Unknown error")
                ))
                throw e
            }
        } else {
            Log.w(TAG, "XR SDK not available, enable emulation mode to test")
            connectionState = ConnectionState.ERROR
            throw Exception("XR SDK not available. Enable emulation mode to test.")
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
     */
    suspend fun getDeviceCapabilities(): Map<String, Any> = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext mapOf(
                "hasController" to emulatedCapabilities.hasController,
                "hasHandTracking" to emulatedCapabilities.hasHandTracking,
                "hasEyeTracking" to emulatedCapabilities.hasEyeTracking,
                "hasSpatialApi" to emulatedCapabilities.hasSpatialApi,
                "isEmulated" to true
            )
        }

        val pm = context.packageManager
        return@withContext mapOf(
            "hasController" to pm.hasSystemFeature(FEATURE_XR_INPUT_CONTROLLER),
            "hasHandTracking" to pm.hasSystemFeature(FEATURE_XR_INPUT_HAND_TRACKING),
            "hasEyeTracking" to pm.hasSystemFeature(FEATURE_XR_INPUT_EYE_TRACKING),
            "hasSpatialApi" to pm.hasSystemFeature(FEATURE_XR_API_SPATIAL),
            "isEmulated" to false,
            "xrSdkAvailable" to xrSdkAvailable
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

    /**
     * Cleanup resources.
     */
    fun cleanup() {
        Log.d(TAG, "Cleaning up XRGlassesService")
        connectionMonitorJob?.cancel()
        scope.cancel()

        if (projectedContextInstance != null) {
            try {
                val closeMethod = projectedContextInstance!!.javaClass.getMethod("close")
                closeMethod.invoke(projectedContextInstance)
            } catch (e: Exception) {
                // Ignore cleanup errors
            }
            projectedContextInstance = null
        }

        isConnected = false
        connectionState = ConnectionState.DISCONNECTED
    }
}
