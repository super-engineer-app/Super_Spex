package expo.modules.xrglasses

import android.content.Context
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
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
    private var imageAnalysis: ImageAnalysis? = null
    private var imageCapture: ImageCapture? = null

    // Reference counts for each use case
    private val analysisRefCount = AtomicInteger(0)
    private val captureRefCount = AtomicInteger(0)

    // Current configuration
    private var currentLifecycleOwner: LifecycleOwner? = null
    private var currentCameraContext: Context? = null
    private var isEmulationMode: Boolean = false

    // Callbacks for camera source changes
    private var onCameraSourceChanged: ((String) -> Unit)? = null

    // Track camera source for logging
    @Volatile
    private var cameraSource: String = "unknown"

    /**
     * Configuration for ImageAnalysis use case.
     */
    data class AnalysisConfig(
        val width: Int,
        val height: Int,
        val analyzer: ImageAnalysis.Analyzer
    )

    /**
     * Configuration for ImageCapture use case.
     */
    data class CaptureConfig(
        val width: Int,
        val height: Int,
        val captureMode: Int = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
    )

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
        onSourceChanged: ((String) -> Unit)? = null
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
            val resolutionStrategy = ResolutionStrategy(
                targetSize,
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER
            )
            val resolutionSelector = ResolutionSelector.Builder()
                .setResolutionStrategy(resolutionStrategy)
                .build()

            imageAnalysis = ImageAnalysis.Builder()
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
        emulationMode: Boolean
    ): ImageCapture? {
        val count = captureRefCount.incrementAndGet()
        Log.d(TAG, "acquireImageCapture: refCount=$count")

        this.isEmulationMode = emulationMode

        // If this is the first consumer, create and bind
        if (count == 1 || imageCapture == null) {
            Log.d(TAG, "First ImageCapture consumer, creating use case")

            // Build the ImageCapture use case
            val targetSize = Size(config.width, config.height)
            val resolutionStrategy = ResolutionStrategy(
                targetSize,
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER
            )
            val resolutionSelector = ResolutionSelector.Builder()
                .setResolutionStrategy(resolutionStrategy)
                .build()

            imageCapture = ImageCapture.Builder()
                .setResolutionSelector(resolutionSelector)
                .setCaptureMode(config.captureMode)
                .build()

            // Initialize camera provider and bind
            initAndBind(lifecycleOwner, emulationMode)
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
     * Get the current ImageCapture instance (if any).
     * Used by consumers that need to take pictures.
     */
    fun getImageCapture(): ImageCapture? = imageCapture

    /**
     * Check if camera is ready (provider initialized and use cases bound).
     */
    fun isCameraReady(): Boolean {
        return cameraProvider != null && (imageAnalysis != null || imageCapture != null)
    }

    /**
     * Get the current camera source description.
     */
    fun getCameraSource(): String = cameraSource

    /**
     * Initialize ProcessCameraProvider and bind active use cases.
     */
    private fun initAndBind(lifecycleOwner: LifecycleOwner, emulationMode: Boolean) {
        currentLifecycleOwner = lifecycleOwner
        this.isEmulationMode = emulationMode

        // Get the appropriate context for camera access
        val cameraContext = getCameraContext(emulationMode)
        currentCameraContext = cameraContext

        if (cameraProvider != null) {
            // Already have provider, just rebind
            rebindUseCases()
            return
        }

        val cameraProviderFuture = ProcessCameraProvider.getInstance(cameraContext)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                Log.d(TAG, "ProcessCameraProvider obtained")
                rebindUseCases()
            } catch (e: Exception) {
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
            val createMethod = projectedContextClass.methods.find {
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
        val provider = cameraProvider ?: run {
            Log.w(TAG, "rebindUseCases: no camera provider")
            return
        }

        val lifecycleOwner = currentLifecycleOwner ?: run {
            Log.w(TAG, "rebindUseCases: no lifecycle owner")
            return
        }

        // Collect active use cases
        val useCases = mutableListOf<androidx.camera.core.UseCase>()
        imageAnalysis?.let { useCases.add(it) }
        imageCapture?.let { useCases.add(it) }

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
                *useCases.toTypedArray()
            )

            Log.d(TAG, "========================================")
            Log.d(TAG, ">>> CAMERA BOUND: ${useCases.size} use cases")
            Log.d(TAG, ">>>   ImageAnalysis: ${imageAnalysis != null}")
            Log.d(TAG, ">>>   ImageCapture: ${imageCapture != null}")
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

        imageAnalysis?.clearAnalyzer()
        imageAnalysis = null
        imageCapture = null
        cameraProvider = null
        currentLifecycleOwner = null
        currentCameraContext = null
        analysisRefCount.set(0)
        captureRefCount.set(0)
        cameraSource = "unknown"
    }
}
