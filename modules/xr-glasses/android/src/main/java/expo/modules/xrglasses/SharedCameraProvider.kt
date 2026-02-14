package expo.modules.xrglasses

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.atomic.AtomicInteger

/**
 * SharedCameraProvider - Singleton that manages CameraX with multiple use cases.
 *
 * CameraX allows binding multiple use cases (ImageAnalysis + ImageCapture) simultaneously
 * in a single bindToLifecycle() call. This class manages a single ProcessCameraProvider
 * with reference counting for each use case.
 *
 * Architecture:
 * - Single ProcessCameraProvider instance shared across consumers
 * - ImageAnalysis for streaming (StreamingCameraManager)
 * - ImageCapture for snapshots (GlassesCameraManager)
 * - Reference counting tracks active users of each use case
 * - Use cases are bound/unbound as needed when ref counts change
 *
 * Thread Safety:
 * - All public methods must be called from the main thread
 * - Reference counts use AtomicInteger for thread-safe increments/decrements
 */
class SharedCameraProvider private constructor(private val context: Context) {
    companion object {
        private const val TAG = "SharedCameraProvider"

        @Volatile
        private var instance: SharedCameraProvider? = null

        fun getInstance(context: Context): SharedCameraProvider {
            return instance ?: synchronized(this) {
                instance ?: SharedCameraProvider(context.applicationContext).also { instance = it }
            }
        }

        /**
         * Reset the singleton instance. Used for testing or when app needs to fully release camera.
         */
        fun resetInstance() {
            synchronized(this) {
                instance?.releaseAll()
                instance = null
            }
        }
    }

    // CameraX components
    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null

    // Reference counts for each use case
    private val previewRefCount = AtomicInteger(0)
    private val analysisRefCount = AtomicInteger(0)
    private val captureRefCount = AtomicInteger(0)
    private val videoCaptureRefCount = AtomicInteger(0)

    // Current configuration
    private var currentLifecycleOwner: LifecycleOwner? = null
    private var currentCameraContext: Context? = null
    private var isEmulationMode: Boolean = false

    // Callbacks for camera source changes
    private var onCameraSourceChanged: ((String) -> Unit)? = null

    // Track camera source for logging
    @Volatile
    private var cameraSource: String = "unknown"

    // Track pending provider initialization to coalesce rapid initAndBind calls.
    // When multiple acquires happen before the ProcessCameraProvider future resolves,
    // we only register one listener and collect onBound callbacks to invoke after
    // a single rebindUseCases() call.
    private var providerInitPending = false
    private val pendingOnBoundCallbacks = mutableListOf<(() -> Unit)?>()

    /**
     * Configuration for ImageAnalysis use case.
     */
    data class AnalysisConfig(
        val width: Int,
        val height: Int,
        val analyzer: ImageAnalysis.Analyzer,
    )

    /**
     * Configuration for ImageCapture use case.
     */
    data class CaptureConfig(
        val width: Int,
        val height: Int,
        val captureMode: Int = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY,
    )

    /**
     * Acquire Preview use case for live camera display.
     * Increments reference count and binds if this is the first consumer.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param surfaceProvider Surface provider from PreviewView
     * @param emulationMode If true, uses phone camera instead of glasses
     * @return The Preview use case, or null if initialization failed
     */
    fun acquirePreview(
        lifecycleOwner: LifecycleOwner,
        surfaceProvider: Preview.SurfaceProvider,
        emulationMode: Boolean,
    ): Preview? {
        val count = previewRefCount.incrementAndGet()
        Log.d(TAG, "acquirePreview: refCount=$count")

        this.isEmulationMode = emulationMode

        if (count == 1 || preview == null) {
            Log.d(TAG, "First Preview consumer, creating use case")
            preview =
                Preview.Builder().build().also {
                    it.setSurfaceProvider(surfaceProvider)
                }
            initAndBind(lifecycleOwner, emulationMode)
        } else {
            preview?.setSurfaceProvider(surfaceProvider)
        }

        return preview
    }

    /**
     * Release Preview use case.
     * Decrements reference count and unbinds if no consumers remain.
     */
    fun releasePreview() {
        val count = previewRefCount.decrementAndGet()
        Log.d(TAG, "releasePreview: refCount=$count")

        if (count <= 0) {
            previewRefCount.set(0)
            preview?.setSurfaceProvider(null)
            preview = null
            Log.d(TAG, "Preview released, rebinding remaining use cases")
            rebindUseCases()
        }
    }

    /**
     * Acquire ImageAnalysis use case for streaming.
     * Increments reference count and binds if this is the first consumer.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param config Analysis configuration (resolution, analyzer)
     * @param emulationMode If true, uses phone camera instead of glasses
     * @param onSourceChanged Callback for camera source changes
     * @return The ImageAnalysis use case, or null if initialization failed
     */
    fun acquireImageAnalysis(
        lifecycleOwner: LifecycleOwner,
        config: AnalysisConfig,
        emulationMode: Boolean,
        onSourceChanged: ((String) -> Unit)? = null,
    ): ImageAnalysis? {
        val count = analysisRefCount.incrementAndGet()
        Log.d(TAG, "acquireImageAnalysis: refCount=$count")

        this.onCameraSourceChanged = onSourceChanged
        this.isEmulationMode = emulationMode

        // If this is the first consumer, create and bind
        if (count == 1 || imageAnalysis == null) {
            Log.d(TAG, "First ImageAnalysis consumer, creating use case")

            // Build the ImageAnalysis use case
            val targetSize = Size(config.width, config.height)
            val resolutionStrategy =
                ResolutionStrategy(
                    targetSize,
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER,
                )
            val resolutionSelector =
                ResolutionSelector.Builder()
                    .setResolutionStrategy(resolutionStrategy)
                    .build()

            imageAnalysis =
                ImageAnalysis.Builder()
                    .setResolutionSelector(resolutionSelector)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                    .build()
                    .also { it.setAnalyzer(ContextCompat.getMainExecutor(context), config.analyzer) }

            // Initialize camera provider and bind
            initAndBind(lifecycleOwner, emulationMode)
        } else {
            // Update the analyzer on existing use case
            imageAnalysis?.setAnalyzer(ContextCompat.getMainExecutor(context), config.analyzer)
        }

        return imageAnalysis
    }

    /**
     * Release ImageAnalysis use case.
     * Decrements reference count and unbinds if no consumers remain.
     */
    fun releaseImageAnalysis() {
        val count = analysisRefCount.decrementAndGet()
        Log.d(TAG, "releaseImageAnalysis: refCount=$count")

        if (count <= 0) {
            analysisRefCount.set(0) // Prevent negative counts
            imageAnalysis?.clearAnalyzer()
            imageAnalysis = null
            Log.d(TAG, "ImageAnalysis released, rebinding remaining use cases")
            rebindUseCases()
        }
    }

    /**
     * Acquire ImageCapture use case for snapshots.
     * Increments reference count and binds if this is the first consumer.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param config Capture configuration (resolution, mode)
     * @param emulationMode If true, uses phone camera instead of glasses
     * @return The ImageCapture use case, or null if initialization failed
     */
    fun acquireImageCapture(
        lifecycleOwner: LifecycleOwner,
        config: CaptureConfig,
        emulationMode: Boolean,
        onBound: (() -> Unit)? = null,
    ): ImageCapture? {
        val count = captureRefCount.incrementAndGet()
        Log.d(TAG, "acquireImageCapture: refCount=$count")

        this.isEmulationMode = emulationMode

        // If this is the first consumer, create and bind
        if (count == 1 || imageCapture == null) {
            Log.d(TAG, "First ImageCapture consumer, creating use case")

            // Build the ImageCapture use case
            val targetSize = Size(config.width, config.height)
            val resolutionStrategy =
                ResolutionStrategy(
                    targetSize,
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER,
                )
            val resolutionSelector =
                ResolutionSelector.Builder()
                    .setResolutionStrategy(resolutionStrategy)
                    .build()

            imageCapture =
                ImageCapture.Builder()
                    .setResolutionSelector(resolutionSelector)
                    .setCaptureMode(config.captureMode)
                    .build()

            // Initialize camera provider and bind
            initAndBind(lifecycleOwner, emulationMode, onBound)
        } else {
            // Already bound, invoke callback immediately
            onBound?.invoke()
        }

        return imageCapture
    }

    /**
     * Release ImageCapture use case.
     * Decrements reference count and unbinds if no consumers remain.
     */
    fun releaseImageCapture() {
        val count = captureRefCount.decrementAndGet()
        Log.d(TAG, "releaseImageCapture: refCount=$count")

        if (count <= 0) {
            captureRefCount.set(0) // Prevent negative counts
            imageCapture = null
            Log.d(TAG, "ImageCapture released, rebinding remaining use cases")
            rebindUseCases()
        }
    }

    /**
     * Acquire VideoCapture use case for video recording.
     * Increments reference count and binds if this is the first consumer.
     *
     * IMPORTANT: VideoCapture and ImageAnalysis are mutually exclusive.
     * When VideoCapture is active, ImageAnalysis is temporarily excluded from binding.
     * ImageAnalysis resumes when VideoCapture is released.
     *
     * @param lifecycleOwner Lifecycle owner for camera binding
     * @param videoRecordingManager Manager that builds the VideoCapture use case
     * @param emulationMode If true, uses phone camera instead of glasses
     * @return The VideoCapture use case, or null if initialization failed
     */
    fun acquireVideoCapture(
        lifecycleOwner: LifecycleOwner,
        videoRecordingManager: VideoRecordingManager,
        emulationMode: Boolean,
    ): VideoCapture<Recorder>? {
        val count = videoCaptureRefCount.incrementAndGet()
        Log.d(TAG, "acquireVideoCapture: refCount=$count")

        this.isEmulationMode = emulationMode

        if (count == 1 || videoCapture == null) {
            Log.d(TAG, "First VideoCapture consumer, creating use case")
            videoCapture = videoRecordingManager.buildVideoCapture()
            initAndBind(lifecycleOwner, emulationMode)
        }

        return videoCapture
    }

    /**
     * Release VideoCapture use case.
     * Decrements reference count and unbinds if no consumers remain.
     * When released, ImageAnalysis will be re-included in binding.
     */
    fun releaseVideoCapture() {
        val count = videoCaptureRefCount.decrementAndGet()
        Log.d(TAG, "releaseVideoCapture: refCount=$count")

        if (count <= 0) {
            videoCaptureRefCount.set(0)
            videoCapture = null
            Log.d(TAG, "VideoCapture released, rebinding remaining use cases (ImageAnalysis may resume)")
            rebindUseCases()
        }
    }

    /**
     * Get the current ImageCapture instance (if any).
     * Used by consumers that need to take pictures.
     */
    fun getImageCapture(): ImageCapture? = imageCapture

    /**
     * Check if camera is ready (provider initialized and use cases bound).
     */
    fun isCameraReady(): Boolean {
        return cameraProvider != null && (preview != null || imageAnalysis != null || imageCapture != null || videoCapture != null)
    }

    /**
     * Get the current camera source description.
     */
    fun getCameraSource(): String = cameraSource

    /**
     * Initialize ProcessCameraProvider and bind active use cases.
     *
     * @param onBound Optional callback invoked after use cases are bound to the camera.
     *                On first call this fires asynchronously (after ProcessCameraProvider resolves).
     *                On subsequent calls it fires synchronously (provider already cached).
     *
     * Coalescing: If multiple acquires call initAndBind before the ProcessCameraProvider
     * future resolves, only one listener is registered. All accumulated use cases are bound
     * in a single rebindUseCases() call, avoiding rapid unbind/rebind cycles that cause
     * CameraX surfaceList timeouts on slower camera HALs (e.g. emulated glasses camera).
     */
    private fun initAndBind(
        lifecycleOwner: LifecycleOwner,
        emulationMode: Boolean,
        onBound: (() -> Unit)? = null,
    ) {
        currentLifecycleOwner = lifecycleOwner
        this.isEmulationMode = emulationMode

        // Get the appropriate context for camera access
        val cameraContext = getCameraContext(emulationMode)
        currentCameraContext = cameraContext

        if (cameraProvider != null) {
            // Already have provider, just rebind
            rebindUseCases()
            onBound?.invoke()
            return
        }

        // Provider is still initializing — queue the callback and skip duplicate listener
        if (providerInitPending) {
            Log.d(TAG, "Provider init already pending, coalescing onBound callback")
            pendingOnBoundCallbacks.add(onBound)
            return
        }

        providerInitPending = true
        val cameraProviderFuture = ProcessCameraProvider.getInstance(cameraContext)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                providerInitPending = false
                Log.d(TAG, "ProcessCameraProvider obtained")
                // Single rebind with ALL use cases accumulated so far
                rebindUseCases()
                onBound?.invoke()
                // Invoke any coalesced callbacks
                for (cb in pendingOnBoundCallbacks) {
                    cb?.invoke()
                }
                pendingOnBoundCallbacks.clear()
            } catch (e: Exception) {
                providerInitPending = false
                pendingOnBoundCallbacks.clear()
                Log.e(TAG, "Failed to get camera provider", e)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    /**
     * Get the appropriate context for camera access.
     * In emulation mode, uses phone camera. Otherwise, tries ProjectedContext for glasses.
     */
    private fun getCameraContext(emulationMode: Boolean): Context {
        if (emulationMode) {
            cameraSource = "PHONE CAMERA (Demo Mode)"
            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> DEMO MODE: Using PHONE CAMERA")
            Log.d(TAG, "========================================")
            onCameraSourceChanged?.invoke(cameraSource)
            return context
        }

        return try {
            val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
            val createMethod =
                projectedContextClass.methods.find {
                    it.name == "createProjectedDeviceContext"
                }

            if (createMethod != null) {
                val result = createMethod.invoke(null, context)
                if (result is Context) {
                    cameraSource = "GLASSES CAMERA"
                    Log.d(TAG, ">>> CAMERA SOURCE: $cameraSource")
                    onCameraSourceChanged?.invoke(cameraSource)
                    result
                } else {
                    Log.w(TAG, "createProjectedDeviceContext returned non-Context: $result")
                    fallbackToPhone("ProjectedContext returned non-Context")
                }
            } else {
                Log.w(TAG, "createProjectedDeviceContext method not found")
                fallbackToPhone("createProjectedDeviceContext not found")
            }
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Projected device not found: ${e.message}")
            fallbackToPhone("no projected device")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get glasses context: ${e.message}", e)
            fallbackToPhone("error: ${e.message}")
        }
    }

    private fun fallbackToPhone(reason: String): Context {
        cameraSource = "PHONE CAMERA ($reason)"
        Log.d(TAG, ">>> CAMERA SOURCE: $cameraSource")
        onCameraSourceChanged?.invoke(cameraSource)
        return context
    }

    /**
     * Rebind all active use cases to the camera.
     * Called when use cases are added/removed or when provider is first obtained.
     */
    private fun rebindUseCases() {
        val provider =
            cameraProvider ?: run {
                Log.w(TAG, "rebindUseCases: no camera provider")
                return
            }

        val lifecycleOwner =
            currentLifecycleOwner ?: run {
                Log.w(TAG, "rebindUseCases: no lifecycle owner")
                return
            }

        // Collect active use cases
        // CameraX 3-use-case limit: Preview counts as one.
        // MUTUAL EXCLUSION: When VideoCapture is active, exclude ImageAnalysis
        // Typical combos:
        //   Normal:    Preview + ImageCapture + ImageAnalysis = 3
        //   Recording: Preview + ImageCapture + VideoCapture  = 3  (ImageAnalysis excluded)
        val isVideoCaptureActive = videoCapture != null
        val useCases = mutableListOf<androidx.camera.core.UseCase>()
        preview?.let { useCases.add(it) }
        if (!isVideoCaptureActive) {
            imageAnalysis?.let { useCases.add(it) }
        } else {
            Log.d(TAG, "VideoCapture active - excluding ImageAnalysis from binding")
        }
        imageCapture?.let { useCases.add(it) }
        videoCapture?.let { useCases.add(it) }

        if (useCases.isEmpty()) {
            Log.d(TAG, "No active use cases, unbinding all")
            try {
                provider.unbindAll()
            } catch (e: Exception) {
                Log.w(TAG, "Error unbinding: ${e.message}")
            }
            return
        }

        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        // Check if camera is available
        if (!provider.hasCamera(cameraSelector)) {
            Log.w(TAG, "Back camera not available")
            return
        }

        try {
            // Unbind all first for clean state
            provider.unbindAll()

            // Bind all active use cases together
            provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                *useCases.toTypedArray(),
            )

            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> CAMERA BOUND: ${useCases.size} use cases")
            Log.d(TAG, ">>>   Preview: ${preview != null}")
            Log.d(TAG, ">>>   ImageAnalysis: ${imageAnalysis != null && !isVideoCaptureActive}")
            Log.d(TAG, ">>>   ImageCapture: ${imageCapture != null}")
            Log.d(TAG, ">>>   VideoCapture: ${videoCapture != null}")
            Log.d(TAG, ">>>   Source: $cameraSource")
            Log.d(TAG, "========================================")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera use cases", e)
        }
    }

    /**
     * Release all resources and reset state.
     * Called when the singleton is being reset.
     */
    private fun releaseAll() {
        Log.d(TAG, "Releasing all camera resources")

        try {
            cameraProvider?.unbindAll()
        } catch (e: Exception) {
            Log.w(TAG, "Error unbinding camera: ${e.message}")
        }

        preview?.setSurfaceProvider(null)
        preview = null
        imageAnalysis?.clearAnalyzer()
        imageAnalysis = null
        imageCapture = null
        videoCapture = null
        cameraProvider = null
        currentLifecycleOwner = null
        currentCameraContext = null
        previewRefCount.set(0)
        analysisRefCount.set(0)
        captureRefCount.set(0)
        videoCaptureRefCount.set(0)
        providerInitPending = false
        pendingOnBoundCallbacks.clear()
        cameraSource = "unknown"
    }
}
