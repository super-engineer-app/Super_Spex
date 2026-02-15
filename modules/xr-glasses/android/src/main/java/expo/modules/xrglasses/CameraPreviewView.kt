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
    private var isPaused = true
    private var mediaPlayer: android.media.MediaPlayer? = null
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

    fun setPaused(paused: Boolean) {
        if (isPaused == paused) return
        isPaused = paused
        Log.d(TAG, "setPaused: $paused")
        val mp = mediaPlayer ?: return
        try {
            if (paused) {
                mp.pause()
            } else {
                mp.start()
            }
        } catch (e: IllegalStateException) {
            Log.w(TAG, "MediaPlayer state error in setPaused($paused): ${e.message}")
        }
    }

    private fun updateState() {
        // When not active (e.g. mode switched away, view is display:none with zero dimensions),
        // always stop playback and live preview. VideoView can't play inside a zero-size container
        // and will show a "Can't play this video" system dialog.
        if (!isActive) {
            showNothing()
            return
        }
        val uri = playbackUri
        if (!uri.isNullOrBlank()) {
            showPlayback(uri)
        } else {
            showLivePreview()
        }
    }

    private fun showPlayback(uri: String) {
        releasePreview()
        pendingPreviewAcquire = false // Cancel any deferred live preview from prop-setting race
        previewView.visibility = View.GONE
        videoContainer.visibility = View.VISIBLE

        val videoUri =
            if (uri.startsWith("/")) {
                Uri.fromFile(java.io.File(uri))
            } else {
                Uri.parse(uri)
            }

        videoView.setVideoURI(videoUri)
        videoView.setOnErrorListener { _, what, extra ->
            Log.e(TAG, "VideoView playback error: what=$what, extra=$extra")
            true // consume error to suppress system "Can't play this video" dialog
        }
        videoView.setOnPreparedListener { mp ->
            mediaPlayer = mp
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

            // Always start playback first to decode frames. seekTo(0)+pause() on a
            // freshly prepared MediaPlayer can leave it in a broken state (Samsung).
            // Post the pause to the next frame so the decoder outputs at least one frame.
            mp.start()
            if (isPaused) {
                videoView.post {
                    if (isPaused && mediaPlayer === mp) {
                        try {
                            mp.pause()
                        } catch (e: IllegalStateException) {
                            Log.w(TAG, "MediaPlayer.pause() failed (player already released): ${e.message}")
                        }
                    }
                }
            }
        }
        // Don't call videoView.start() — we call mp.start() explicitly in onPreparedListener.
        // videoView.start() sets mTargetState=PLAYING which causes VideoView's internal listener
        // to call start() AGAIN after ours, conflicting with our pause logic.
        Log.d(TAG, "Showing playback: $videoUri (paused=$isPaused)")
    }

    private fun showLivePreview() {
        videoContainer.visibility = View.GONE
        videoView.stopPlayback()
        mediaPlayer = null
        previewView.visibility = View.VISIBLE
        acquirePreview()
    }

    private fun showNothing() {
        releasePreview()
        pendingPreviewAcquire = false
        videoView.stopPlayback()
        mediaPlayer = null
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
