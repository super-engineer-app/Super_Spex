package expo.modules.xrglasses

import android.content.Context
import android.net.Uri
import android.util.Log
import android.view.View
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
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            visibility = View.GONE
        }

    private var isActive = false
    private var playbackUri: String? = null
    private var previewAcquired = false

    init {
        addView(previewView)
        addView(videoView)
    }

    fun setActive(active: Boolean) {
        if (isActive == active) return
        isActive = active
        Log.d(TAG, "setActive: $active")
        updateState()
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
        videoView.visibility = View.VISIBLE

        val videoUri =
            if (uri.startsWith("/")) {
                Uri.fromFile(java.io.File(uri))
            } else {
                Uri.parse(uri)
            }

        videoView.setVideoURI(videoUri)
        videoView.setOnPreparedListener { mp ->
            mp.isLooping = true
            mp.start()
        }
        videoView.start()
        Log.d(TAG, "Showing playback: $videoUri")
    }

    private fun showLivePreview() {
        videoView.visibility = View.GONE
        videoView.stopPlayback()
        previewView.visibility = View.VISIBLE
        acquirePreview()
    }

    private fun showNothing() {
        releasePreview()
        videoView.stopPlayback()
        previewView.visibility = View.GONE
        videoView.visibility = View.GONE
    }

    private fun acquirePreview() {
        if (previewAcquired) return

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
        Log.d(TAG, "Preview acquired")
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
