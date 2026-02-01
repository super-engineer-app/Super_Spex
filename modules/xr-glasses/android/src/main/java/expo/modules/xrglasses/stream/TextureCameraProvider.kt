package expo.modules.xrglasses.stream

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * TextureCameraProvider - Provides camera frames to Agora for streaming.
 *
 * Uses CameraX ImageAnalysis to capture frames and convert them to NV21 format
 * for pushing to Agora. Configured to match the selected quality preset.
 *
 * Frame flow:
 * 1. CameraX captures YUV_420_888 frame
 * 2. Convert to NV21 format (fast, ~1ms)
 * 3. Push to Agora via callback
 *
 * Note: Initial implementation uses buffer mode. Can be upgraded to texture mode
 * for additional 2-5ms latency savings if needed.
 */
class TextureCameraProvider(
    private val context: Context,
    private val onFrame: (buffer: ByteArray, width: Int, height: Int, rotation: Int, timestampMs: Long) -> Unit,
    private val onError: (String) -> Unit
) {
    companion object {
        private const val TAG = "TextureCameraProvider"
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var cameraExecutor: ExecutorService? = null
    private var isCapturing = false
    private var currentQuality: StreamQuality = StreamQuality.BALANCED

    // Reusable buffer to avoid allocations
    private var nv21Buffer: ByteArray? = null

    /**
     * Start capturing camera frames at the specified quality.
     */
    fun startCapture(lifecycleOwner: LifecycleOwner, quality: StreamQuality) {
        if (isCapturing) {
            Log.w(TAG, "Already capturing, stopping first")
            stopCapture()
        }

        currentQuality = quality
        Log.d(TAG, "Starting camera capture at ${quality.width}x${quality.height} @ ${quality.fps}fps")

        cameraExecutor = Executors.newSingleThreadExecutor()

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                setupImageAnalysis(lifecycleOwner, quality)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get camera provider", e)
                onError("Failed to initialize camera: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    /**
     * Setup ImageAnalysis use case for frame capture.
     */
    private fun setupImageAnalysis(lifecycleOwner: LifecycleOwner, quality: StreamQuality) {
        val provider = cameraProvider ?: run {
            onError("Camera provider not available")
            return
        }

        // Try back camera first (glasses POV), fallback to front camera for testing
        val cameraSelector = when {
            provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> {
                Log.d(TAG, "Using back camera")
                CameraSelector.DEFAULT_BACK_CAMERA
            }
            provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> {
                Log.w(TAG, "Back camera not available, using front camera for testing")
                CameraSelector.DEFAULT_FRONT_CAMERA
            }
            else -> {
                Log.e(TAG, "No camera available on this device")
                onError("No camera available")
                return
            }
        }

        // Build ImageAnalysis with quality-appropriate resolution
        imageAnalysis = ImageAnalysis.Builder()
            .setTargetResolution(Size(quality.width, quality.height))
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)  // Drop stale frames
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(cameraExecutor!!) { imageProxy ->
                    processFrame(imageProxy)
                }
            }

        try {
            provider.unbindAll()
            provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                imageAnalysis
            )

            isCapturing = true
            Log.d(TAG, "Camera capture started successfully")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera", e)
            onError("Failed to start camera: ${e.message}")
        }
    }

    /**
     * Process a single frame from CameraX.
     */
    private fun processFrame(imageProxy: ImageProxy) {
        if (!isCapturing) {
            imageProxy.close()
            return
        }

        try {
            val width = imageProxy.width
            val height = imageProxy.height
            val rotation = imageProxy.imageInfo.rotationDegrees
            val timestamp = imageProxy.imageInfo.timestamp / 1_000_000  // Convert to milliseconds

            // Convert YUV_420_888 to NV21
            val nv21 = yuv420ToNv21(imageProxy)

            if (nv21 != null) {
                onFrame(nv21, width, height, rotation, timestamp)
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
        } finally {
            imageProxy.close()
        }
    }

    /**
     * Convert YUV_420_888 to NV21 format.
     * NV21 is the format expected by Agora for video frames.
     *
     * YUV_420_888: Y plane, U plane, V plane (may have padding)
     * NV21: Y plane, interleaved VU plane
     */
    private fun yuv420ToNv21(imageProxy: ImageProxy): ByteArray? {
        val width = imageProxy.width
        val height = imageProxy.height
        val ySize = width * height
        val uvSize = width * height / 2
        val totalSize = ySize + uvSize

        // Reuse or allocate buffer
        if (nv21Buffer == null || nv21Buffer!!.size != totalSize) {
            nv21Buffer = ByteArray(totalSize)
        }
        val nv21 = nv21Buffer!!

        val planes = imageProxy.planes
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer

        val yRowStride = planes[0].rowStride
        val uvRowStride = planes[1].rowStride
        val uvPixelStride = planes[1].pixelStride

        // Copy Y plane
        if (yRowStride == width) {
            // No padding, fast copy
            yBuffer.position(0)
            yBuffer.get(nv21, 0, ySize)
        } else {
            // Has padding, copy row by row
            var pos = 0
            for (row in 0 until height) {
                yBuffer.position(row * yRowStride)
                yBuffer.get(nv21, pos, width)
                pos += width
            }
        }

        // Interleave U and V into VU (NV21 format)
        var uvIndex = ySize
        val uvHeight = height / 2
        val uvWidth = width / 2

        if (uvPixelStride == 2 && uvRowStride == width) {
            // Common case: semi-planar format, U and V are already interleaved
            // Just need to swap U and V for NV21 (VU order)
            vBuffer.position(0)
            val vuData = ByteArray(uvSize)
            vBuffer.get(vuData, 0, uvSize)
            System.arraycopy(vuData, 0, nv21, ySize, uvSize)
        } else {
            // General case: copy pixel by pixel
            for (row in 0 until uvHeight) {
                for (col in 0 until uvWidth) {
                    val bufferIndex = row * uvRowStride + col * uvPixelStride
                    vBuffer.position(bufferIndex)
                    uBuffer.position(bufferIndex)
                    nv21[uvIndex++] = vBuffer.get()  // V first (NV21)
                    nv21[uvIndex++] = uBuffer.get()  // Then U
                }
            }
        }

        return nv21
    }

    /**
     * Update the quality preset while capturing.
     */
    fun updateQuality(lifecycleOwner: LifecycleOwner, quality: StreamQuality) {
        if (quality == currentQuality) return

        Log.d(TAG, "Updating quality to ${quality.displayName}")
        currentQuality = quality

        // Rebind with new resolution
        if (isCapturing) {
            cameraProvider?.unbindAll()
            setupImageAnalysis(lifecycleOwner, quality)
        }
    }

    /**
     * Stop capturing camera frames.
     */
    fun stopCapture() {
        Log.d(TAG, "Stopping camera capture")
        isCapturing = false

        try {
            cameraProvider?.unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "Error unbinding camera: ${e.message}")
        }

        cameraExecutor?.shutdown()
        cameraExecutor = null
        cameraProvider = null
        imageAnalysis = null
        nv21Buffer = null
    }

    /**
     * Check if currently capturing.
     */
    fun isCapturing(): Boolean = isCapturing
}
