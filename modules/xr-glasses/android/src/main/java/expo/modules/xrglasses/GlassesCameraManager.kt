package expo.modules.xrglasses

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import android.util.Log
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * GlassesCameraManager - Handles camera capture from AI glasses hardware.
 *
 * Uses SharedCameraProvider to access the camera, which handles ProjectedContext
 * for glasses camera access. SharedCameraProvider allows multiple use cases
 * (ImageAnalysis + ImageCapture) to work simultaneously.
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
        private const val DEFAULT_CAPTURE_WIDTH = 1280
        private const val DEFAULT_CAPTURE_HEIGHT = 720
        private const val LOW_POWER_CAPTURE_WIDTH = 640
        private const val LOW_POWER_CAPTURE_HEIGHT = 480
    }

    private var imageCapture: ImageCapture? = null
    private var isCameraReady = false
    private var isEmulationMode = false
    private var cameraSource: String = "unknown"

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    /**
     * Initialize camera using SharedCameraProvider for glasses hardware access.
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
                // Determine resolution based on power mode
                val width = if (lowPowerMode) LOW_POWER_CAPTURE_WIDTH else DEFAULT_CAPTURE_WIDTH
                val height = if (lowPowerMode) LOW_POWER_CAPTURE_HEIGHT else DEFAULT_CAPTURE_HEIGHT

                // Acquire ImageCapture from SharedCameraProvider
                val config = SharedCameraProvider.CaptureConfig(
                    width = width,
                    height = height,
                    captureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
                )

                imageCapture = SharedCameraProvider.getInstance(context).acquireImageCapture(
                    lifecycleOwner = lifecycleOwner,
                    config = config,
                    emulationMode = emulationMode
                )

                if (imageCapture != null) {
                    cameraSource = SharedCameraProvider.getInstance(context).getCameraSource()
                    isCameraReady = true
                    onCameraStateChanged(true)
                    Log.d(TAG, "Camera initialized successfully (resolution: ${width}x${height}, source: $cameraSource)")
                } else {
                    Log.e(TAG, "Failed to acquire ImageCapture from SharedCameraProvider")
                    onError("Failed to initialize camera")
                }

            } catch (e: Exception) {
                Log.e(TAG, "Camera initialization failed", e)
                onError("Camera initialization failed: ${e.message}")
            }
        }
    }

    /**
     * Capture a single image from the glasses camera.
     * Returns the image as a base64-encoded JPEG via callback.
     */
    fun captureImage() {
        // Get ImageCapture from SharedCameraProvider (may have been updated)
        val capture = SharedCameraProvider.getInstance(context).getImageCapture() ?: run {
            onError("Camera not initialized")
            return
        }

        if (!isCameraReady) {
            onError("Camera not ready")
            return
        }

        Log.d(TAG, "========================================")
        Log.d(TAG, ">>> CAPTURING IMAGE FROM: $cameraSource")
        Log.d(TAG, "========================================")

        capture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    Log.d(TAG, ">>> IMAGE CAPTURED SUCCESSFULLY from $cameraSource: ${image.width}x${image.height}")

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

        // Release ImageCapture from SharedCameraProvider
        SharedCameraProvider.getInstance(context).releaseImageCapture()

        imageCapture = null
        isCameraReady = false
        onCameraStateChanged(false)
    }
}
