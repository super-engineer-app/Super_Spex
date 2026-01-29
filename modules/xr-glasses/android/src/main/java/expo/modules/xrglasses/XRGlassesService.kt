package expo.modules.xrglasses

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.view.WindowManager
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
 * This service handles all communication with XR glasses hardware.
 * It supports both real Jetpack XR hardware (when available) and an
 * emulation mode for development and testing on regular Android devices.
 *
 * Emulation mode allows developers to test the app flow without actual
 * XR glasses hardware.
 */
class XRGlassesService(
    private val context: Context,
    private val module: XRGlassesModule
) {
    companion object {
        private const val TAG = "XRGlassesService"

        // Jetpack XR feature constants (may not be available on all devices)
        private const val FEATURE_XR_INPUT_CONTROLLER = "android.hardware.xr.input.controller"
        private const val FEATURE_XR_INPUT_HAND_TRACKING = "android.hardware.xr.input.hand_tracking"
        private const val FEATURE_XR_INPUT_EYE_TRACKING = "android.hardware.xr.input.eye_tracking"
        private const val FEATURE_XR_API_SPATIAL = "android.software.xr.spatial"
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // Connection state
    private var connectionState = ConnectionState.DISCONNECTED
    private var isConnected = false

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

    init {
        Log.d(TAG, "XRGlassesService initialized")
        detectXRCapabilities()
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

        // If no real XR capabilities, we can still use emulation mode
        if (!hasController && !hasHandTracking && !hasEyeTracking && !hasSpatialApi) {
            Log.d(TAG, "No XR hardware detected, emulation mode available")
        }
    }

    /**
     * Check if running in a projected device context.
     * In emulation mode, this can be simulated.
     */
    suspend fun isProjectedDevice(): Boolean = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext true
        }

        // Try to check for real projected device context
        // This requires Jetpack XR libraries which may not be available
        try {
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val method = projectedContextClass.getMethod("isProjectedDeviceContext", Context::class.java)
            return@withContext method.invoke(null, context) as Boolean
        } catch (e: ClassNotFoundException) {
            Log.d(TAG, "ProjectedContext not available, XR SDK not present")
            return@withContext false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking projected device context", e)
            return@withContext false
        }
    }

    /**
     * Check if glasses are currently connected.
     */
    suspend fun isGlassesConnected(): Boolean = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext isConnected
        }

        // Try real connection check via Jetpack XR
        try {
            // This would use ProjectedContext.isProjectedDeviceConnected() flow
            // For now, return the local state
            return@withContext isConnected
        } catch (e: Exception) {
            Log.e(TAG, "Error checking glasses connection", e)
            return@withContext false
        }
    }

    /**
     * Connect to the XR glasses.
     */
    suspend fun connect() = withContext(Dispatchers.Main) {
        Log.d(TAG, "Connecting to XR glasses (emulation: $emulationMode)")

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

        // Try real connection via Jetpack XR
        try {
            // This would use ProjectedContext.createProjectedDeviceContext()
            // and set up the display controller and engagement mode client

            isConnected = true
            connectionState = ConnectionState.CONNECTED
            _connectionStateFlow.value = true
            module.emitEvent("onConnectionStateChanged", mapOf("connected" to true))

            // Start listening for connection state changes
            scope.launch {
                // Would subscribe to ProjectedContext.isProjectedDeviceConnected() flow here
            }

            Log.d(TAG, "Connection established")
        } catch (e: Exception) {
            Log.e(TAG, "Connection failed", e)
            connectionState = ConnectionState.ERROR
            throw e
        }
    }

    /**
     * Disconnect from the XR glasses.
     */
    suspend fun disconnect() = withContext(Dispatchers.Main) {
        Log.d(TAG, "Disconnecting from XR glasses")

        isConnected = false
        connectionState = ConnectionState.DISCONNECTED

        if (emulationMode) {
            emulatedEngagementMode = EngagementMode(visualsOn = false, audioOn = false)
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

        // Check via ProjectedDeviceController
        return@withContext isConnected
    }

    /**
     * Control screen always-on behavior.
     */
    suspend fun setKeepScreenOn(enabled: Boolean) = withContext(Dispatchers.Main) {
        Log.d(TAG, "Setting keep screen on: $enabled")

        // This would use ProjectedDisplayController.addLayoutParamsFlags()
        // or removeLayoutParamsFlags() with FLAG_KEEP_SCREEN_ON

        if (emulationMode) {
            // In emulation mode, just log the action
            Log.d(TAG, "Emulated: Keep screen on set to $enabled")
        }
    }

    /**
     * Get current engagement mode.
     */
    suspend fun getEngagementMode(): EngagementMode = withContext(Dispatchers.Main) {
        if (emulationMode) {
            return@withContext emulatedEngagementMode
        }

        // Would use EngagementModeClient.getEngagementModeFlags()
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
            "isEmulated" to false
        )
    }

    /**
     * Enable or disable emulation mode.
     * Emulation mode allows testing without real XR hardware.
     */
    suspend fun setEmulationMode(enabled: Boolean) = withContext(Dispatchers.Main) {
        Log.d(TAG, "Setting emulation mode: $enabled")
        emulationMode = enabled

        if (!enabled && isConnected) {
            // If turning off emulation while "connected", reset state
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
        scope.cancel()
        isConnected = false
        connectionState = ConnectionState.DISCONNECTED
    }
}
