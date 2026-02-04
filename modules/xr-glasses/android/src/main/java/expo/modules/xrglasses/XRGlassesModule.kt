package expo.modules.xrglasses

import android.app.Activity
import android.content.IntentFilter
import android.os.Build
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
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob() + NativeErrorHandler.coroutineExceptionHandler)
    private var glassesService: XRGlassesService? = null
    private var errorReceiver: GlassesBroadcastReceiver? = null

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
            "onCameraStateChanged",  // Camera ready state changes
            // Remote View streaming events (from GlassesActivity via broadcast)
            "onStreamStarted",       // Stream started with channel/URL info
            "onStreamStopped",       // Stream stopped
            "onStreamError",         // Streaming error
            "onViewerUpdate",        // Viewer count/info changed
            "onStreamCameraSourceChanged",  // Camera source changed (phone vs glasses)
            // Parking timer events
            "onParkingTimerStarted",   // Timer started
            "onParkingTimerWarning",   // 5 minute warning
            "onParkingTimerExpired",   // Timer expired (alarm!)
            "onParkingTimerCancelled", // Timer cancelled
            // UI events
            "onUiRefreshNeeded",       // Hint to refresh UI (after XR permission flow)
            // Native error events (for error reporting)
            "onNativeError"          // Native Kotlin/Android errors
        )

        // Initialize the XR Glasses service
        Function("initialize") {
            val context = appContext.reactContext
                ?: throw CodedException("NO_CONTEXT", "No context available", null)
            glassesService = XRGlassesService(context, this@XRGlassesModule)

            // Initialize native error handler for crash reporting
            NativeErrorHandler.initialize(context)

            // Register callback for speech events from GlassesActivity
            GlassesBroadcastReceiver.moduleCallback = { eventName, data ->
                this@XRGlassesModule.sendEvent(eventName, data)
            }

            // Register broadcast receiver for native errors
            errorReceiver = GlassesBroadcastReceiver()
            val errorFilter = IntentFilter(NativeErrorHandler.ACTION_NATIVE_ERROR)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(errorReceiver, errorFilter, android.content.Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(errorReceiver, errorFilter)
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

        // ============================================================
        // Remote View Functions
        // Streams glasses camera view to remote viewers via Agora
        // ============================================================

        // Start remote view streaming
        AsyncFunction("startRemoteView") { quality: String, promise: Promise ->
            scope.launch {
                try {
                    // Get activity as lifecycle owner for camera
                    val activity = appContext.currentActivity
                    if (activity is LifecycleOwner) {
                        glassesService?.setStreamingLifecycleOwner(activity)
                        // Also set current activity for screen keep-awake
                        glassesService?.setCurrentActivity(activity)
                    } else {
                        promise.reject(CodedException("NO_LIFECYCLE_OWNER", "Activity is not a LifecycleOwner", null))
                        return@launch
                    }
                    glassesService?.startRemoteView(quality)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("STREAM_START_FAILED", e.message, e))
                }
            }
        }

        // Stop remote view streaming
        AsyncFunction("stopRemoteView") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.stopRemoteView()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("STREAM_STOP_FAILED", e.message, e))
                }
            }
        }

        // Set stream quality while streaming
        AsyncFunction("setRemoteViewQuality") { quality: String, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.setRemoteViewQuality(quality)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("SET_QUALITY_FAILED", e.message, e))
                }
            }
        }

        // Check if currently streaming
        AsyncFunction("isRemoteViewActive") { promise: Promise ->
            val active = glassesService?.isRemoteViewActive() ?: false
            promise.resolve(active)
        }

        // ============================================================
        // Parking Timer Functions
        // Efficient timer using coroutine delay (no CPU waste)
        // ============================================================

        // Start parking timer with specified duration
        AsyncFunction("startParkingTimer") { durationMinutes: Int, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.startParkingTimer(durationMinutes)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("TIMER_START_FAILED", e.message, e))
                }
            }
        }

        // Cancel parking timer
        AsyncFunction("cancelParkingTimer") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.cancelParkingTimer()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("TIMER_CANCEL_FAILED", e.message, e))
                }
            }
        }

        // Get current parking timer state
        AsyncFunction("getParkingTimerState") { promise: Promise ->
            scope.launch {
                try {
                    val state = glassesService?.getParkingTimerState() ?: mapOf(
                        "isActive" to false,
                        "remainingMs" to 0L,
                        "endTime" to 0L,
                        "durationMinutes" to 0,
                        "warningShown" to false,
                        "expired" to false
                    )
                    promise.resolve(state)
                } catch (e: Exception) {
                    promise.reject(CodedException("TIMER_STATE_FAILED", e.message, e))
                }
            }
        }

        // Stop the alarm sound (user dismisses alarm)
        AsyncFunction("stopParkingAlarm") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.stopAlarmSound()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("ALARM_STOP_FAILED", e.message, e))
                }
            }
        }

        // Cleanup on module destroy
        OnDestroy {
            scope.cancel()
            glassesService?.cleanup()
            // Clear the broadcast receiver callback
            GlassesBroadcastReceiver.moduleCallback = null
            // Unregister error receiver
            errorReceiver?.let {
                try {
                    appContext.reactContext?.unregisterReceiver(it)
                } catch (e: Exception) {
                    // Ignore if already unregistered
                }
            }
            errorReceiver = null
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
