package expo.modules.xrglasses

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.xrglasses.stream.StreamQuality
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * StreamingCameraManager - Captures continuous frames from glasses camera for Agora streaming.
 *
 * This class runs in the MAIN PROCESS and uses ProjectedContext.createProjectedDeviceContext()
 * to access the glasses camera. This is necessary because:
 * 1. :xr_process cannot access cameras via ProjectedContext (verified by testing)
 * 2. The main process CAN access glasses camera via ProjectedContext (GlassesCameraManager works)
 *
 * Frame flow:
 * 1. Get glasses camera context via ProjectedContext.createProjectedDeviceContext()
 * 2. CameraX ImageAnalysis captures YUV_420_888 frames continuously
 * 3. Convert to NV21 format (fast, ~1ms)
 * 4. Push to Agora via callback
 */
class StreamingCameraManager(
    private val context: Context,
    private val onFrame: (buffer: ByteArray, width: Int, height: Int, rotation: Int, timestampMs: Long) -> Unit,
    private val onError: (String) -> Unit,
    private val onCameraReady: (Boolean) -> Unit
) {
    companion object {
        private const val TAG = "StreamingCameraManager"
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var cameraExecutor: ExecutorService? = null
    private var isCapturing = false
    private var currentQuality: StreamQuality = StreamQuality.BALANCED

    // Camera context obtained via ProjectedContext
    private var glassesContext: Context? = null
    private var cameraSource: String = "unknown"

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
        Log.d(TAG, "Starting streaming camera capture at ${quality.width}x${quality.height} @ ${quality.fps}fps")

        cameraExecutor = Executors.newSingleThreadExecutor()

        // Get glasses camera context via ProjectedContext (MUST use this from main process)
        val effectiveCameraContext = getGlassesCameraContext()
        if (effectiveCameraContext == null) {
            Log.e(TAG, "Failed to get glasses camera context")
            onError("Failed to get glasses camera context")
            return
        }

        val cameraProviderFuture = ProcessCameraProvider.getInstance(effectiveCameraContext)
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
     * Get the glasses camera context via ProjectedContext.createProjectedDeviceContext().
     * This allows accessing the glasses camera from the main process.
     */
    private fun getGlassesCameraContext(): Context? {
        return try {
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val createMethod = projectedContextClass.methods.find {
                it.name == "createProjectedDeviceContext"
            }

            if (createMethod != null) {
                val result = createMethod.invoke(null, context)
                if (result is Context) {
                    glassesContext = result
                    cameraSource = "GLASSES (via ProjectedContext)"
                    Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                    result
                } else {
                    Log.w(TAG, "createProjectedDeviceContext returned non-Context: $result")
                    cameraSource = "PHONE (fallback)"
                    Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                    context
                }
            } else {
                Log.w(TAG, "createProjectedDeviceContext method not found, using phone camera")
                cameraSource = "PHONE (no ProjectedContext)"
                Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                context
            }
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Projected device not found: ${e.message}, using phone camera")
            cameraSource = "PHONE (no projected device)"
            Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
            context
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get glasses camera context: ${e.message}", e)
            cameraSource = "PHONE (error fallback)"
            Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
            context
        }
    }

    /**
     * Setup ImageAnalysis use case for continuous frame capture.
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
                Log.w(TAG, "Back camera not available, using front camera")
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
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
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
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> STREAMING CAMERA STARTED: $cameraSource")
            Log.d(TAG, "========================================")
            onCameraReady(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera", e)
            onError("Failed to start camera: ${e.message}")
        }
    }

    /**
     * Process a single frame from CameraX and send to Agora.
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
     * Convert YUV_420_888 to NV21 format (expected by Agora).
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
            yBuffer.position(0)
            yBuffer.get(nv21, 0, ySize)
        } else {
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
            vBuffer.position(0)
            val vuData = ByteArray(uvSize)
            vBuffer.get(vuData, 0, uvSize)
            System.arraycopy(vuData, 0, nv21, ySize, uvSize)
        } else {
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

        Log.d(TAG, "Updating streaming quality to ${quality.displayName}")
        currentQuality = quality

        if (isCapturing) {
            cameraProvider?.unbindAll()
            setupImageAnalysis(lifecycleOwner, quality)
        }
    }

    /**
     * Stop capturing camera frames.
     */
    fun stopCapture() {
        Log.d(TAG, "Stopping streaming camera capture (was using: $cameraSource)")
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
        glassesContext = null
        cameraSource = "unknown"
        onCameraReady(false)
    }

    /**
     * Check if currently capturing.
     */
    fun isCapturing(): Boolean = isCapturing
}
