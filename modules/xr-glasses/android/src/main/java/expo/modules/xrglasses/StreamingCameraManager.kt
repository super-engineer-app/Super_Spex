package expo.modules.xrglasses

import android.content.Context
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import expo.modules.xrglasses.stream.StreamQuality
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * StreamingCameraManager - Captures continuous frames from glasses camera for Agora streaming.
 *
 * This class runs in the MAIN PROCESS and uses SharedCameraProvider to access the camera.
 * SharedCameraProvider handles ProjectedContext for glasses camera access and allows
 * multiple use cases (ImageAnalysis + ImageCapture) to work simultaneously.
 *
 * Frame flow:
 * 1. SharedCameraProvider gets glasses camera context via ProjectedContext
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
    private val onCameraSourceChanged: ((String) -> Unit)? = null,
) {
    companion object {
        private const val TAG = "StreamingCameraManager"
        private const val LOG_INTERVAL_MS = 5000L
    }

    private var imageAnalysis: ImageAnalysis? = null
    private val isCapturing = AtomicBoolean(false)

    @Volatile private var currentQuality: StreamQuality = StreamQuality.BALANCED

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
    private val lifecycleObserver =
        object : DefaultLifecycleObserver {
            override fun onResume(owner: LifecycleOwner) {
                Log.d(TAG, ">>> Lifecycle RESUMED - wasCapturing: $wasCapturingBeforePause, isCapturing: ${isCapturing.get()}")
            }

            override fun onPause(owner: LifecycleOwner) {
                Log.d(TAG, ">>> Lifecycle PAUSED - isCapturing: ${isCapturing.get()}")
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
    fun startCapture(
        lifecycleOwner: LifecycleOwner,
        quality: StreamQuality,
        emulationMode: Boolean = false,
    ) {
        this.isEmulationMode = emulationMode
        if (isCapturing.get()) {
            Log.w(TAG, "Already capturing, stopping first")
            stopCapture()
        }

        currentQuality = quality
        frameCount = 0 // Reset frame counter for debug logging
        Log.d(TAG, "Starting streaming camera capture at ${quality.width}x${quality.height} @ ${quality.fps}fps (demoMode: $emulationMode)")

        // Register lifecycle observer to track app background/foreground
        currentLifecycleOwner?.lifecycle?.removeObserver(lifecycleObserver)
        currentLifecycleOwner = lifecycleOwner
        lifecycleOwner.lifecycle.addObserver(lifecycleObserver)

        // Create analyzer that processes frames
        val analyzer =
            ImageAnalysis.Analyzer { imageProxy ->
                processFrame(imageProxy)
            }

        // Acquire ImageAnalysis from SharedCameraProvider
        val config =
            SharedCameraProvider.AnalysisConfig(
                width = quality.width,
                height = quality.height,
                analyzer = analyzer,
            )

        imageAnalysis =
            SharedCameraProvider.getInstance(context).acquireImageAnalysis(
                lifecycleOwner = lifecycleOwner,
                config = config,
                emulationMode = emulationMode,
                onSourceChanged = { source ->
                    cameraSource = source
                    onCameraSourceChanged?.invoke(source)
                },
            )

        if (imageAnalysis != null) {
            isCapturing.set(true)
            cameraSource = SharedCameraProvider.getInstance(context).getCameraSource()
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> STREAMING CAMERA STARTED: $cameraSource")
            Log.d(TAG, ">>> Resolution: ${quality.width}x${quality.height} @ ${quality.fps}fps")
            Log.d(TAG, "========================================")
            onCameraReady(true)
        } else {
            Log.e(TAG, "Failed to acquire ImageAnalysis from SharedCameraProvider")
            onError("Failed to initialize streaming camera")
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
            val timestamp = imageProxy.imageInfo.timestamp / 1_000_000 // Convert to milliseconds

            frameCount++

            // Log periodically for monitoring
            val now = System.currentTimeMillis()
            if (now - lastLogTime > LOG_INTERVAL_MS) {
                Log.d(TAG, "Streaming frame #$frameCount: ${width}x$height, rotation=$rotation")
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
        val uvSize = width * height / 2 // Interleaved VU for NV21
        val totalSize = ySize + uvSize

        // Reuse or allocate buffer - thread-safe via AtomicReference
        var nv21 = nv21BufferRef.get()
        if (nv21 == null || nv21.size != totalSize) {
            nv21 = ByteArray(totalSize)
            nv21BufferRef.set(nv21)
            Log.d(TAG, "Allocated NV21 buffer: $totalSize bytes for ${width}x$height")
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
            vBuffer.rewind()
            uBuffer.rewind()

            for (row in 0 until uvHeight) {
                for (col in 0 until uvWidth) {
                    val bufferIndex = row * uvRowStride + col * uvPixelStride

                    // Bounds check to prevent BufferUnderflowException
                    if (bufferIndex < vBuffer.capacity() && bufferIndex < uBuffer.capacity() && uvIndex + 1 < totalSize) {
                        vBuffer.position(bufferIndex)
                        uBuffer.position(bufferIndex)
                        nv21[uvIndex++] = vBuffer.get() // V
                        nv21[uvIndex++] = uBuffer.get() // U
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
                        nv21[uvIndex++] = vBuffer.get() // V
                        nv21[uvIndex++] = uBuffer.get() // U
                    }
                }
            }
        }

        return nv21
    }

    /**
     * Update the quality preset while capturing.
     */
    fun updateQuality(
        lifecycleOwner: LifecycleOwner,
        quality: StreamQuality,
    ) {
        if (quality == currentQuality) return

        Log.d(TAG, "Updating streaming quality to ${quality.displayName}")
        currentQuality = quality

        if (isCapturing.get()) {
            // Stop and restart with new quality
            stopCapture()
            startCapture(lifecycleOwner, quality, isEmulationMode)
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

        // Release ImageAnalysis from SharedCameraProvider
        SharedCameraProvider.getInstance(context).releaseImageAnalysis()

        imageAnalysis = null
        nv21BufferRef.set(null)
        cameraSource = "unknown"
        onCameraReady(false)
    }

    /**
     * Check if currently capturing.
     */
    fun isCapturing(): Boolean = isCapturing.get()
}
