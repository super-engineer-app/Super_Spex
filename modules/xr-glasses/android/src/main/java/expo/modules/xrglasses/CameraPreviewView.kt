package expo.modules.xrglasses

import android.content.Context
import android.net.Uri
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.VideoView
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * CameraPreviewView - Native Expo view wrapping CameraX PreviewView and Android VideoView.
 *
 * Shows a live camera feed via CameraX Preview use case, or plays back a recorded video file.
 * Uses SharedCameraProvider to integrate with the existing camera use case management.
 *
 * Props (set from JS):
 * - active: Boolean — when true (and no playbackUri), shows live camera feed
 * - playbackUri: String? — when set, shows recorded video playback instead of live camera
 */
class CameraPreviewView(
    context: Context,
    appContext: AppContext,
) : ExpoView(context, appContext) {
    companion object {
        private const val TAG = "CameraPreviewView"
    }

    // Android layout required for CameraX PreviewView to render correctly
    override val shouldUseAndroidLayout = true

    private val previewView =
        PreviewView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }

    private val videoView =
        VideoView(context).apply {
            layoutParams =
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.CENTER,
                )
        }

    // FrameLayout wrapper centers VideoView (which auto-sizes to video aspect ratio)
    private val videoContainer =
        FrameLayout(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            visibility = View.GONE
            addView(videoView)
        }

    private var isActive = false
    private var playbackUri: String? = null
    private var previewAcquired = false
    private var pendingPreviewAcquire = false

    init {
        addView(previewView)
        addView(videoContainer)
    }

    fun setActive(active: Boolean) {
        if (isActive == active) return
        isActive = active
        Log.d(TAG, "setActive: $active (width=$width, height=$height, attachedToWindow=$isAttachedToWindow)")
        updateState()
    }

    override fun onLayout(
        changed: Boolean,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
    ) {
        super.onLayout(changed, left, top, right, bottom)
        val w = right - left
        val h = bottom - top
        Log.d(TAG, "onLayout: ${w}x$h (pendingPreview=$pendingPreviewAcquire)")
        if (pendingPreviewAcquire && w > 0 && h > 0) {
            pendingPreviewAcquire = false
            Log.d(TAG, "Deferred acquirePreview now executing (view has valid dimensions)")
            acquirePreview()
        }
    }

    fun setPlaybackUri(uri: String?) {
        if (playbackUri == uri) return
        playbackUri = uri
        Log.d(TAG, "setPlaybackUri: $uri")
        updateState()
    }

    private fun updateState() {
        val uri = playbackUri
        if (!uri.isNullOrBlank()) {
            showPlayback(uri)
        } else if (isActive) {
            showLivePreview()
        } else {
            showNothing()
        }
    }

    private fun showPlayback(uri: String) {
        releasePreview()
        previewView.visibility = View.GONE
        videoContainer.visibility = View.VISIBLE

        val videoUri =
            if (uri.startsWith("/")) {
                Uri.fromFile(java.io.File(uri))
            } else {
                Uri.parse(uri)
            }

        videoView.setVideoURI(videoUri)
        videoView.setOnPreparedListener { mp ->
            mp.isLooping = true

            // Scale video to fill container (cover behavior) instead of fit (contain).
            // VideoView.onMeasure() sizes itself to the video's aspect ratio within
            // MATCH_PARENT bounds, so it may be smaller than the container.
            // The FrameLayout wrapper centers it, and this scale fills the rest.
            val vw = mp.videoWidth.toFloat()
            val vh = mp.videoHeight.toFloat()
            val cw = this@CameraPreviewView.width.toFloat()
            val ch = this@CameraPreviewView.height.toFloat()

            if (vw > 0 && vh > 0 && cw > 0 && ch > 0) {
                val fitScale = minOf(cw / vw, ch / vh)
                val coverScale = maxOf(cw / vw, ch / vh)
                val extraScale = coverScale / fitScale
                videoView.scaleX = extraScale
                videoView.scaleY = extraScale
                Log.d(TAG, "Video cover scale: ${extraScale}x (video: ${vw}x$vh, container: ${cw}x$ch)")
            }

            mp.start()
        }
        videoView.start()
        Log.d(TAG, "Showing playback: $videoUri")
    }

    private fun showLivePreview() {
        videoContainer.visibility = View.GONE
        videoView.stopPlayback()
        previewView.visibility = View.VISIBLE
        acquirePreview()
    }

    private fun showNothing() {
        releasePreview()
        pendingPreviewAcquire = false
        videoView.stopPlayback()
        previewView.visibility = View.GONE
        videoContainer.visibility = View.GONE
    }

    private fun acquirePreview() {
        if (previewAcquired) return

        // Defer acquisition if view has zero dimensions (e.g. parent has display:none).
        // A zero-size PreviewView can't provide a valid surface, which blocks the
        // entire CameraX session and prevents ImageCapture from working.
        if (width == 0 || height == 0) {
            Log.w(TAG, "acquirePreview DEFERRED: view has zero dimensions (${width}x$height) — will retry on layout")
            pendingPreviewAcquire = true
            return
        }

        val activity = appContext.currentActivity
        if (activity !is LifecycleOwner) {
            Log.w(TAG, "Activity is not a LifecycleOwner, cannot acquire preview")
            return
        }

        val sharedCamera = SharedCameraProvider.getInstance(context)
        // Always use phone camera (emulationMode=true) for the phone-side preview.
        // When glasses are connected, their camera feed is handled separately.
        sharedCamera.acquirePreview(activity, previewView.surfaceProvider, true)
        previewAcquired = true
        Log.d(TAG, "Preview acquired (${width}x$height)")
    }

    private fun releasePreview() {
        if (!previewAcquired) return
        SharedCameraProvider.getInstance(context).releasePreview()
        previewAcquired = false
        Log.d(TAG, "Preview released")
    }

    fun onViewDestroy() {
        releasePreview()
        videoView.stopPlayback()
        Log.d(TAG, "View destroyed, resources released")
    }
}
