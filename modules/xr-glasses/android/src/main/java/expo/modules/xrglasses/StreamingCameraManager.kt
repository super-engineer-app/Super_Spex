package expo.modules.xrglasses

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import expo.modules.xrglasses.stream.StreamQuality
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

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
 *
 * In DEMO MODE: Uses phone's camera instead of glasses camera (for testing without real glasses).
 */
class StreamingCameraManager(
    private val context: Context,
    private val onFrame: (buffer: ByteArray, width: Int, height: Int, rotation: Int, timestampMs: Long) -> Unit,
    private val onError: (String) -> Unit,
    private val onCameraReady: (Boolean) -> Unit,
    private val onCameraSourceChanged: ((String) -> Unit)? = null
) {
    companion object {
        private const val TAG = "StreamingCameraManager"
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageAnalysis: ImageAnalysis? = null
    @Volatile private var cameraExecutor: ExecutorService? = null
    private val isCapturing = AtomicBoolean(false)
    @Volatile private var currentQuality: StreamQuality = StreamQuality.BALANCED

    // Camera context obtained via ProjectedContext
    private var glassesContext: Context? = null
    @Volatile private var cameraSource: String = "unknown"
    @Volatile private var isEmulationMode: Boolean = false

    // Reusable buffer to avoid allocations - thread-safe access
    private val nv21BufferRef = AtomicReference<ByteArray?>(null)

    // Frame counter for periodic logging
    @Volatile private var frameCount = 0
    @Volatile private var lastLogTime = 0L

    // Lifecycle handling for app background/foreground
    private var currentLifecycleOwner: LifecycleOwner? = null
    @Volatile private var wasCapturingBeforePause = false

    // Lifecycle observer to handle app going to background/foreground
    private val lifecycleObserver = object : DefaultLifecycleObserver {
        override fun onResume(owner: LifecycleOwner) {
            Log.d(TAG, ">>> Lifecycle RESUMED - wasCapturing: $wasCapturingBeforePause, isCapturing: ${isCapturing.get()}")
            // Camera should auto-resume via CameraX lifecycle binding
            // But log it so we can debug if there are issues
        }

        override fun onPause(owner: LifecycleOwner) {
            Log.d(TAG, ">>> Lifecycle PAUSED - isCapturing: ${isCapturing.get()}")
            // Note: CameraX will automatically pause when lifecycle pauses
            // Frames will stop being captured until the app resumes
            wasCapturingBeforePause = isCapturing.get()
        }

        override fun onStop(owner: LifecycleOwner) {
            Log.d(TAG, ">>> Lifecycle STOPPED - this may interrupt streaming")
        }
    }

    /**
     * Start capturing camera frames at the specified quality.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param quality Stream quality preset
     * @param emulationMode If true, uses phone camera instead of glasses camera (demo mode for testing)
     */
    fun startCapture(lifecycleOwner: LifecycleOwner, quality: StreamQuality, emulationMode: Boolean = false) {
        this.isEmulationMode = emulationMode
        if (isCapturing.get()) {
            Log.w(TAG, "Already capturing, stopping first")
            stopCapture()
        }

        currentQuality = quality
        frameCount = 0  // Reset frame counter for debug logging
        Log.d(TAG, "Starting streaming camera capture at ${quality.width}x${quality.height} @ ${quality.fps}fps (demoMode: $emulationMode)")

        // Register lifecycle observer to track app background/foreground
        currentLifecycleOwner?.lifecycle?.removeObserver(lifecycleObserver)
        currentLifecycleOwner = lifecycleOwner
        lifecycleOwner.lifecycle.addObserver(lifecycleObserver)

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
     *
     * In DEMO MODE: Always returns phone context (for testing purposes).
     */
    private fun getGlassesCameraContext(): Context? {
        // In demo mode, always use phone camera for testing
        if (isEmulationMode) {
            cameraSource = "PHONE CAMERA (Demo Mode)"
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> DEMO MODE: Using PHONE CAMERA")
            Log.d(TAG, ">>> (Not glasses camera - for testing)")
            Log.d(TAG, "========================================")
            onCameraSourceChanged?.invoke(cameraSource)
            return context
        }

        return try {
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val createMethod = projectedContextClass.methods.find {
                it.name == "createProjectedDeviceContext"
            }

            if (createMethod != null) {
                val result = createMethod.invoke(null, context)
                if (result is Context) {
                    glassesContext = result
                    cameraSource = "GLASSES CAMERA"
                    Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                    onCameraSourceChanged?.invoke(cameraSource)
                    result
                } else {
                    Log.w(TAG, "createProjectedDeviceContext returned non-Context: $result")
                    cameraSource = "PHONE CAMERA (fallback)"
                    Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                    onCameraSourceChanged?.invoke(cameraSource)
                    context
                }
            } else {
                Log.w(TAG, "createProjectedDeviceContext method not found, using phone camera")
                cameraSource = "PHONE CAMERA (no ProjectedContext)"
                Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
                onCameraSourceChanged?.invoke(cameraSource)
                context
            }
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Projected device not found: ${e.message}, using phone camera")
            cameraSource = "PHONE CAMERA (no projected device)"
            Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
            onCameraSourceChanged?.invoke(cameraSource)
            context
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get glasses camera context: ${e.message}", e)
            cameraSource = "PHONE CAMERA (error fallback)"
            Log.d(TAG, ">>> STREAMING CAMERA SOURCE: $cameraSource")
            onCameraSourceChanged?.invoke(cameraSource)
            context
        }
    }

    /**
     * Get the current camera source being used for streaming.
     */
    fun getCameraSource(): String = cameraSource

    /**
     * Check if currently in emulation mode.
     */
    fun isInEmulationMode(): Boolean = isEmulationMode

    /**
     * Setup ImageAnalysis use case for continuous frame capture.
     * Uses the same ResolutionSelector pattern as GlassesCameraManager for consistency.
     */
    private fun setupImageAnalysis(lifecycleOwner: LifecycleOwner, quality: StreamQuality) {
        val provider = cameraProvider ?: run {
            onError("Camera provider not available")
            return
        }

        // Select the back camera (maps to glasses camera when using projected context)
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // Check if camera is available (same pattern as GlassesCameraManager)
        if (!provider.hasCamera(cameraSelector)) {
            Log.w(TAG, "Back camera not available")
            onError("Camera not available on this device")
            return
        }

        // Configure resolution using ResolutionSelector (same as GlassesCameraManager)
        val targetSize = Size(quality.width, quality.height)
        val resolutionStrategy = ResolutionStrategy(
            targetSize,
            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER
        )
        val resolutionSelector = ResolutionSelector.Builder()
            .setResolutionStrategy(resolutionStrategy)
            .build()

        // Build ImageAnalysis with quality-appropriate resolution
        val executor = cameraExecutor
        if (executor == null) {
            Log.e(TAG, "Camera executor is null, cannot setup image analysis")
            onError("Camera executor not initialized")
            return
        }

        imageAnalysis = ImageAnalysis.Builder()
            .setResolutionSelector(resolutionSelector)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(executor) { imageProxy ->
                    processFrame(imageProxy)
                }
            }

        try {
            // Unbind any existing use cases (same as GlassesCameraManager)
            provider.unbindAll()

            // Bind to lifecycle
            provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                imageAnalysis
            )

            isCapturing.set(true)
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> STREAMING CAMERA STARTED: $cameraSource")
            Log.d(TAG, ">>> Resolution: ${quality.width}x${quality.height} @ ${quality.fps}fps")
            Log.d(TAG, "========================================")
            onCameraReady(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera use cases", e)
            onError("Failed to start camera: ${e.message}")
        }
    }

    /**
     * Process a single frame from CameraX and send to Agora.
     */
    private fun processFrame(imageProxy: ImageProxy) {
        if (!isCapturing.get()) {
            imageProxy.close()
            return
        }

        try {
            val width = imageProxy.width
            val height = imageProxy.height
            val rotation = imageProxy.imageInfo.rotationDegrees
            val timestamp = imageProxy.imageInfo.timestamp / 1_000_000  // Convert to milliseconds

            frameCount++

            // Log periodically (every 5 seconds) for monitoring
            val now = System.currentTimeMillis()
            if (now - lastLogTime > 5000) {
                Log.d(TAG, "Streaming frame #$frameCount: ${width}x${height}, rotation=$rotation")
                lastLogTime = now
            }

            // Convert YUV_420_888 to NV21 format (standard Android camera format)
            val nv21 = yuv420ToNV21(imageProxy)

            if (nv21 != null) {
                onFrame(nv21, width, height, rotation, timestamp)
            } else {
                Log.e(TAG, "Failed to convert frame to NV21")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
        } finally {
            imageProxy.close()
        }
    }

    /**
     * Convert YUV_420_888 to NV21 format (Y plane + interleaved VU).
     * NV21 is the standard Android camera format and works well with Agora.
     *
     * NV21 layout: YYYYYYYY...VUVUVUVU...
     * - Full Y plane (width * height bytes)
     * - Interleaved VU plane (width * height / 2 bytes)
     */
    private fun yuv420ToNV21(imageProxy: ImageProxy): ByteArray? {
        val width = imageProxy.width
        val height = imageProxy.height
        val ySize = width * height
        val uvSize = width * height / 2  // Interleaved VU for NV21
        val totalSize = ySize + uvSize

        // Reuse or allocate buffer - thread-safe via AtomicReference
        var nv21 = nv21BufferRef.get()
        if (nv21 == null || nv21.size != totalSize) {
            nv21 = ByteArray(totalSize)
            nv21BufferRef.set(nv21)
            Log.d(TAG, "Allocated NV21 buffer: $totalSize bytes for ${width}x${height}")
        }

        val planes = imageProxy.planes
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer

        val yRowStride = planes[0].rowStride
        val uvRowStride = planes[1].rowStride
        val uvPixelStride = planes[1].pixelStride

        // Log buffer info on first frame (for debugging different devices)
        if (frameCount == 0) {
            Log.d(TAG, "YUV Buffer info: yRowStride=$yRowStride, uvRowStride=$uvRowStride, uvPixelStride=$uvPixelStride")
            Log.d(TAG, "Buffer capacities: Y=${yBuffer.remaining()}, U=${uBuffer.remaining()}, V=${vBuffer.remaining()}")
        }

        // Copy Y plane
        yBuffer.rewind()
        if (yRowStride == width) {
            // No padding, direct copy
            val yBytesToCopy = minOf(yBuffer.remaining(), ySize)
            yBuffer.get(nv21, 0, yBytesToCopy)
        } else {
            // Has padding, copy row by row
            for (row in 0 until height) {
                val srcPos = row * yRowStride
                if (srcPos + width <= yBuffer.capacity()) {
                    yBuffer.position(srcPos)
                    yBuffer.get(nv21, row * width, width)
                }
            }
        }

        // Copy UV planes to interleaved VU (NV21 format)
        val uvHeight = height / 2
        val uvWidth = width / 2
        var uvIndex = ySize

        // Handle UV planes based on pixel stride
        if (uvPixelStride == 2) {
            // UV planes are interleaved in memory (common on many devices)
            // vBuffer and uBuffer point to V and U values respectively, but they share memory
            // We need to interleave V and U into NV21's VU format
            vBuffer.rewind()
            uBuffer.rewind()

            for (row in 0 until uvHeight) {
                for (col in 0 until uvWidth) {
                    val bufferIndex = row * uvRowStride + col * uvPixelStride

                    // Bounds check to prevent BufferUnderflowException
                    if (bufferIndex < vBuffer.capacity() && bufferIndex < uBuffer.capacity() && uvIndex + 1 < totalSize) {
                        vBuffer.position(bufferIndex)
                        uBuffer.position(bufferIndex)
                        nv21[uvIndex++] = vBuffer.get()  // V
                        nv21[uvIndex++] = uBuffer.get()  // U
                    }
                }
            }
        } else {
            // Planes are NOT interleaved (pixelStride == 1), copy pixel by pixel
            vBuffer.rewind()
            uBuffer.rewind()

            for (row in 0 until uvHeight) {
                for (col in 0 until uvWidth) {
                    val bufferIndex = row * uvRowStride + col * uvPixelStride

                    // Bounds check
                    if (bufferIndex < vBuffer.capacity() && bufferIndex < uBuffer.capacity() && uvIndex + 1 < totalSize) {
                        vBuffer.position(bufferIndex)
                        uBuffer.position(bufferIndex)
                        nv21[uvIndex++] = vBuffer.get()  // V
                        nv21[uvIndex++] = uBuffer.get()  // U
                    }
                }
            }
        }

        return nv21
    }

    /**
     * Convert YUV_420_888 to I420 format (Y plane + U plane + V plane).
     * Alternative format for debugging.
     */
    private fun yuv420ToI420(imageProxy: ImageProxy): ByteArray? {
        val width = imageProxy.width
        val height = imageProxy.height
        val ySize = width * height
        val uvSize = width * height / 4  // Each U and V plane is 1/4 of Y
        val totalSize = ySize + uvSize * 2  // Y + U + V

        // Reuse or allocate buffer - thread-safe via AtomicReference
        var i420 = nv21BufferRef.get()
        if (i420 == null || i420.size != totalSize) {
            i420 = ByteArray(totalSize)
            nv21BufferRef.set(i420)
        }

        val planes = imageProxy.planes
        val yBuffer = planes[0].buffer
        val uBuffer = planes[1].buffer
        val vBuffer = planes[2].buffer

        val yRowStride = planes[0].rowStride
        val uvRowStride = planes[1].rowStride
        val uvPixelStride = planes[1].pixelStride

        // Copy Y plane
        yBuffer.rewind()
        if (yRowStride == width) {
            yBuffer.get(i420, 0, ySize)
        } else {
            for (row in 0 until height) {
                yBuffer.position(row * yRowStride)
                yBuffer.get(i420, row * width, width)
            }
        }

        // Copy U and V planes separately (I420 format: Y, then U, then V)
        val uvHeight = height / 2
        val uvWidth = width / 2
        var uIndex = ySize
        var vIndex = ySize + uvSize

        for (row in 0 until uvHeight) {
            for (col in 0 until uvWidth) {
                val bufferIndex = row * uvRowStride + col * uvPixelStride
                uBuffer.position(bufferIndex)
                vBuffer.position(bufferIndex)
                i420[uIndex++] = uBuffer.get()
                i420[vIndex++] = vBuffer.get()
            }
        }

        return i420
    }

    /**
     * Update the quality preset while capturing.
     */
    fun updateQuality(lifecycleOwner: LifecycleOwner, quality: StreamQuality) {
        if (quality == currentQuality) return

        Log.d(TAG, "Updating streaming quality to ${quality.displayName}")
        currentQuality = quality

        if (isCapturing.get()) {
            cameraProvider?.unbindAll()
            setupImageAnalysis(lifecycleOwner, quality)
        }
    }

    /**
     * Stop capturing camera frames.
     */
    fun stopCapture() {
        Log.d(TAG, "Stopping streaming camera capture (was using: $cameraSource)")
        isCapturing.set(false)
        wasCapturingBeforePause = false

        // Remove lifecycle observer
        currentLifecycleOwner?.lifecycle?.removeObserver(lifecycleObserver)
        currentLifecycleOwner = null

        try {
            cameraProvider?.unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "Error unbinding camera: ${e.message}")
        }

        cameraExecutor?.shutdown()
        cameraExecutor = null
        cameraProvider = null
        imageAnalysis = null
        nv21BufferRef.set(null)
        glassesContext = null
        cameraSource = "unknown"
        onCameraReady(false)
    }

    /**
     * Check if currently capturing.
     */
    fun isCapturing(): Boolean = isCapturing.get()
}
