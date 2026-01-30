package expo.modules.xrglasses

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * GlassesCameraManager - Handles camera capture from AI glasses hardware.
 *
 * Uses Jetpack XR Projected APIs to access the glasses camera from the phone app.
 * See: https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context
 *
 * Key considerations from docs:
 * - Use ProjectedContext.createProjectedDeviceContext() to access glasses hardware
 * - DEFAULT_BACK_CAMERA maps to glasses' outward-facing camera
 * - Optimize resolution/FPS for battery and thermal limits
 */
class GlassesCameraManager(
    private val context: Context,
    private val onImageCaptured: (String, Int, Int) -> Unit,  // base64, width, height
    private val onError: (String) -> Unit,
    private val onCameraStateChanged: (Boolean) -> Unit
) {
    companion object {
        private const val TAG = "GlassesCameraManager"

        // Recommended resolutions from Google docs
        // Video Communication: 1280x720 @ 15fps
        // Computer Vision: 640x480 @ 10fps
        // AI Video Streaming: 640x480 @ 1fps
        private val DEFAULT_CAPTURE_SIZE = Size(1280, 720)
        private val LOW_POWER_CAPTURE_SIZE = Size(640, 480)
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var glassesContext: Context? = null
    private var isCameraReady = false
    private var isEmulationMode = false

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    /**
     * Initialize camera using projected context for glasses hardware.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param emulationMode If true, uses phone camera instead of glasses camera
     * @param lowPowerMode If true, uses lower resolution for battery optimization
     */
    fun initializeCamera(
        lifecycleOwner: LifecycleOwner,
        emulationMode: Boolean = false,
        lowPowerMode: Boolean = false
    ) {
        this.isEmulationMode = emulationMode
        Log.d(TAG, "Initializing camera (emulation: $emulationMode, lowPower: $lowPowerMode)")

        scope.launch {
            try {
                // Get the appropriate context for camera access
                val cameraContext = if (emulationMode) {
                    // In emulation mode, use phone's camera
                    Log.d(TAG, "Using phone camera context (emulation mode)")
                    context
                } else {
                    // Use ProjectedContext to access glasses camera
                    Log.d(TAG, "Attempting to get glasses camera context via ProjectedContext")
                    getGlassesContext() ?: run {
                        Log.w(TAG, "Could not get glasses context, falling back to phone camera")
                        context
                    }
                }

                // Get CameraProvider using the appropriate context
                val cameraProviderFuture = ProcessCameraProvider.getInstance(cameraContext)

                cameraProviderFuture.addListener({
                    try {
                        cameraProvider = cameraProviderFuture.get()
                        setupImageCapture(lifecycleOwner, lowPowerMode)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to get camera provider", e)
                        onError("Failed to initialize camera: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(context))

            } catch (e: Exception) {
                Log.e(TAG, "Camera initialization failed", e)
                onError("Camera initialization failed: ${e.message}")
            }
        }
    }

    /**
     * Get projected device context for glasses hardware access.
     * Uses reflection since the SDK may not be available on all devices.
     */
    private fun getGlassesContext(): Context? {
        return try {
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val createMethod = projectedContextClass.methods.find {
                it.name == "createProjectedDeviceContext"
            }

            if (createMethod != null) {
                val result = createMethod.invoke(null, context)
                if (result is Context) {
                    glassesContext = result
                    Log.d(TAG, "Successfully obtained glasses context via ProjectedContext")
                    result
                } else {
                    Log.w(TAG, "createProjectedDeviceContext returned non-Context: $result")
                    null
                }
            } else {
                Log.w(TAG, "createProjectedDeviceContext method not found")
                null
            }
        } catch (e: IllegalStateException) {
            // Projected device not found - this is expected when glasses aren't connected
            Log.d(TAG, "Projected device not found: ${e.message}")
            null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get glasses context", e)
            null
        }
    }

    /**
     * Setup ImageCapture use case with appropriate resolution.
     */
    private fun setupImageCapture(lifecycleOwner: LifecycleOwner, lowPowerMode: Boolean) {
        val provider = cameraProvider ?: run {
            onError("Camera provider not available")
            return
        }

        // Select the back camera (maps to glasses camera when using projected context)
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // Check if camera is available
        if (!provider.hasCamera(cameraSelector)) {
            Log.w(TAG, "Back camera not available")
            onError("Camera not available on this device")
            return
        }

        // Configure resolution based on power mode
        val targetSize = if (lowPowerMode) LOW_POWER_CAPTURE_SIZE else DEFAULT_CAPTURE_SIZE
        val resolutionStrategy = ResolutionStrategy(
            targetSize,
            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER
        )
        val resolutionSelector = ResolutionSelector.Builder()
            .setResolutionStrategy(resolutionStrategy)
            .build()

        // Build ImageCapture use case
        val imageCaptureBuilder = ImageCapture.Builder()
            .setResolutionSelector(resolutionSelector)
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)

        imageCapture = imageCaptureBuilder.build()

        try {
            // Unbind any existing use cases
            provider.unbindAll()

            // Bind to lifecycle
            provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                imageCapture
            )

            isCameraReady = true
            onCameraStateChanged(true)
            Log.d(TAG, "Camera initialized successfully (resolution: ${targetSize.width}x${targetSize.height})")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera use cases", e)
            onError("Failed to start camera: ${e.message}")
        }
    }

    /**
     * Capture a single image from the glasses camera.
     * Returns the image as a base64-encoded JPEG via callback.
     */
    fun captureImage() {
        val capture = imageCapture ?: run {
            onError("Camera not initialized")
            return
        }

        if (!isCameraReady) {
            onError("Camera not ready")
            return
        }

        Log.d(TAG, "Capturing image...")

        capture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    Log.d(TAG, "Image captured: ${image.width}x${image.height}")

                    scope.launch(Dispatchers.Default) {
                        try {
                            // Convert ImageProxy to base64 JPEG
                            val base64Image = imageProxyToBase64(image)
                            val width = image.width
                            val height = image.height
                            image.close()

                            withContext(Dispatchers.Main) {
                                onImageCaptured(base64Image, width, height)
                            }
                        } catch (e: Exception) {
                            image.close()
                            Log.e(TAG, "Failed to process captured image", e)
                            withContext(Dispatchers.Main) {
                                onError("Failed to process image: ${e.message}")
                            }
                        }
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "Image capture failed", exception)
                    onError("Capture failed: ${exception.message}")
                }
            }
        )
    }

    /**
     * Convert ImageProxy to base64-encoded JPEG string.
     */
    private fun imageProxyToBase64(image: ImageProxy): String {
        val buffer: ByteBuffer = image.planes[0].buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)

        // Decode to bitmap
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw Exception("Failed to decode image bytes")

        // Apply rotation if needed
        val rotatedBitmap = if (image.imageInfo.rotationDegrees != 0) {
            val matrix = Matrix().apply {
                postRotate(image.imageInfo.rotationDegrees.toFloat())
            }
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } else {
            bitmap
        }

        // Compress to JPEG
        val outputStream = ByteArrayOutputStream()
        rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)

        // Clean up bitmaps
        if (rotatedBitmap != bitmap) {
            rotatedBitmap.recycle()
        }
        bitmap.recycle()

        // Encode to base64
        return Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
    }

    /**
     * Check if camera is ready to capture.
     */
    fun isCameraReady(): Boolean = isCameraReady

    /**
     * Check if using emulation mode (phone camera instead of glasses).
     */
    fun isEmulationMode(): Boolean = isEmulationMode

    /**
     * Release camera resources.
     */
    fun release() {
        Log.d(TAG, "Releasing camera resources")
        scope.cancel()

        try {
            cameraProvider?.unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "Error unbinding camera: ${e.message}")
        }

        cameraProvider = null
        imageCapture = null
        glassesContext = null
        isCameraReady = false
        onCameraStateChanged(false)
    }
}
