package expo.modules.xrglasses

import android.app.Activity
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.*

/**
 * XRGlassesModule - Expo native module for XR Glasses communication.
 *
 * This module provides the bridge between JavaScript and the native Android
 * XR capabilities. It supports both real Jetpack XR hardware and an emulation
 * mode for development and testing.
 */
class XRGlassesModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var glassesService: XRGlassesService? = null

    override fun definition() = ModuleDefinition {
        Name("XRGlasses")

        // Events that can be sent to JavaScript
        Events(
            "onConnectionStateChanged",
            "onInputEvent",
            "onEngagementModeChanged",
            "onDeviceStateChanged",
            // Speech recognition events (from GlassesActivity via broadcast)
            "onSpeechResult",        // Final transcription
            "onPartialResult",       // Interim transcription
            "onSpeechError",         // Recognition errors
            "onSpeechStateChanged",  // Listening state changes
            // Camera capture events
            "onImageCaptured",       // Image captured successfully
            "onCameraError",         // Camera error
            "onCameraStateChanged"   // Camera ready state changes
        )

        // Initialize the XR Glasses service
        Function("initialize") {
            val context = appContext.reactContext
                ?: throw CodedException("NO_CONTEXT", "No context available", null)
            glassesService = XRGlassesService(context, this@XRGlassesModule)

            // Register callback for speech events from GlassesActivity
            GlassesBroadcastReceiver.moduleCallback = { eventName, data ->
                this@XRGlassesModule.sendEvent(eventName, data)
            }
        }

        // Check if this is a projected device context (running on XR glasses)
        AsyncFunction("isProjectedDevice") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isProjectedDevice() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        // Check if glasses are currently connected
        AsyncFunction("isGlassesConnected") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isGlassesConnected() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        // Connect to the XR glasses
        AsyncFunction("connect") { promise: Promise ->
            scope.launch {
                try {
                    // Pass current activity to service for proper projected context creation
                    glassesService?.setCurrentActivity(appContext.currentActivity)
                    glassesService?.connect()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("CONNECT_FAILED", e.message, e))
                }
            }
        }

        // Disconnect from the XR glasses
        AsyncFunction("disconnect") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.disconnect()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("DISCONNECT_FAILED", e.message, e))
                }
            }
        }

        // Check if glasses support display output
        AsyncFunction("isDisplayCapable") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isDisplayCapable() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        // Control screen always-on behavior
        AsyncFunction("keepScreenOn") { enabled: Boolean, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.setKeepScreenOn(enabled)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("DISPLAY_CONTROL_FAILED", e.message, e))
                }
            }
        }

        // Get current engagement mode
        AsyncFunction("getEngagementMode") { promise: Promise ->
            scope.launch {
                try {
                    val mode = glassesService?.getEngagementMode()
                    promise.resolve(mapOf(
                        "visualsOn" to (mode?.visualsOn ?: false),
                        "audioOn" to (mode?.audioOn ?: false)
                    ))
                } catch (e: Exception) {
                    promise.reject(CodedException("GET_MODE_FAILED", e.message, e))
                }
            }
        }

        // Get device capabilities
        AsyncFunction("getDeviceCapabilities") { promise: Promise ->
            scope.launch {
                try {
                    val caps = glassesService?.getDeviceCapabilities()
                    promise.resolve(caps)
                } catch (e: Exception) {
                    promise.reject(CodedException("GET_CAPS_FAILED", e.message, e))
                }
            }
        }

        // Enable/disable emulation mode for testing
        AsyncFunction("setEmulationMode") { enabled: Boolean, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.setEmulationMode(enabled)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("SET_EMULATION_FAILED", e.message, e))
                }
            }
        }

        // Simulate input event (for testing)
        AsyncFunction("simulateInputEvent") { action: String, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.simulateInputEvent(action)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("SIMULATE_EVENT_FAILED", e.message, e))
                }
            }
        }

        // ============================================================
        // Speech Recognition Functions
        // Runs on phone using glasses context for mic routing
        // ============================================================

        // Start speech recognition
        AsyncFunction("startSpeechRecognition") { continuous: Boolean, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.startSpeechRecognition(continuous)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("SPEECH_START_FAILED", e.message, e))
                }
            }
        }

        // Stop speech recognition
        AsyncFunction("stopSpeechRecognition") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.stopSpeechRecognition()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("SPEECH_STOP_FAILED", e.message, e))
                }
            }
        }

        // Check if speech recognition is available on this device
        AsyncFunction("isSpeechRecognitionAvailable") { promise: Promise ->
            val available = glassesService?.isSpeechRecognitionAvailable() ?: false
            promise.resolve(available)
        }

        // ============================================================
        // Camera Capture Functions
        // Uses ProjectedContext to access glasses camera
        // ============================================================

        // Initialize camera for image capture
        AsyncFunction("initializeCamera") { lowPowerMode: Boolean, promise: Promise ->
            scope.launch {
                try {
                    val activity = appContext.currentActivity
                    if (activity == null) {
                        promise.reject(CodedException("NO_ACTIVITY", "No activity available", null))
                        return@launch
                    }

                    if (activity !is LifecycleOwner) {
                        promise.reject(CodedException("NOT_LIFECYCLE_OWNER", "Activity is not a LifecycleOwner", null))
                        return@launch
                    }

                    glassesService?.initializeCamera(activity, lowPowerMode)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("CAMERA_INIT_FAILED", e.message, e))
                }
            }
        }

        // Capture an image from the camera
        AsyncFunction("captureImage") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.captureImage()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("CAPTURE_FAILED", e.message, e))
                }
            }
        }

        // Release camera resources
        AsyncFunction("releaseCamera") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.releaseCamera()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("RELEASE_FAILED", e.message, e))
                }
            }
        }

        // Check if camera is ready
        AsyncFunction("isCameraReady") { promise: Promise ->
            val ready = glassesService?.isCameraReady() ?: false
            promise.resolve(ready)
        }

        // Cleanup on module destroy
        OnDestroy {
            scope.cancel()
            glassesService?.cleanup()
            // Clear the broadcast receiver callback
            GlassesBroadcastReceiver.moduleCallback = null
        }
    }

    /**
     * Send an event to JavaScript layer.
     * Uses the inherited sendEvent from Module class.
     */
    fun emitEvent(eventName: String, data: Map<String, Any?>) {
        sendEvent(eventName, data)
    }
}
