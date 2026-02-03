package expo.modules.xrglasses

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * ProjectionLauncherActivity - Lightweight intermediate activity for launching projected activities.
 *
 * This activity exists to isolate React Native's MainActivity from the projection context creation.
 * The problem: createProjectedDeviceContext() on React Native's MainActivity corrupts RN's rendering.
 *
 * Solution: This activity creates the projected device context from ITSELF, launches GlassesActivity
 * with proper options, then immediately finishes. React Native is never touched.
 *
 * Flow:
 * 1. XRGlassesService launches this activity
 * 2. This activity creates projected device context from itself
 * 3. Creates activity options and launches GlassesActivity
 * 4. Closes the projected context to prevent resource leaks
 * 5. Finishes immediately (transparent to user)
 */
class ProjectionLauncherActivity : Activity() {

    companion object {
        private const val TAG = "ProjectionLauncher"
        const val ACTION_LAUNCH_GLASSES = "expo.modules.xrglasses.LAUNCH_VIA_PROJECTION"

        // Track connection cycles for debugging
        private var connectionCount = 0
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        connectionCount++
        Log.d(TAG, "ProjectionLauncherActivity started (connection #$connectionCount)")

        try {
            launchGlassesWithProjection()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch with projection: ${e.message}", e)
            launchGlassesFallback()
        }

        // Finish immediately - this activity is just a launcher
        finish()
    }

    /**
     * Launch GlassesActivity with proper projected activity options.
     * Creates the projected device context from THIS activity (not React Native).
     */
    private fun launchGlassesWithProjection() {
        Log.d(TAG, "Creating projected device context from ProjectionLauncherActivity...")

        val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")

        // First, try the simpler approach: createProjectedActivityOptions(context) directly
        val createOptionsMethod = projectedContextClass.methods.find {
            it.name == "createProjectedActivityOptions"
        }

        if (createOptionsMethod != null) {
            Log.d(TAG, "Trying createProjectedActivityOptions with this activity...")

            // Try with this activity's context
            val options = try {
                createOptionsMethod.invoke(null, this) as? android.app.ActivityOptions
            } catch (e: Exception) {
                Log.d(TAG, "Direct options failed, trying with projected device context...")
                null
            }

            if (options != null) {
                launchWithOptions(options)
                return
            }
        }

        // Second approach: create projected device context first, then activity options
        val createDeviceContextMethod = projectedContextClass.methods.find {
            it.name == "createProjectedDeviceContext"
        }

        if (createDeviceContextMethod != null && createOptionsMethod != null) {
            Log.d(TAG, "Creating projected device context from this activity (connection #$connectionCount)...")

            // Create projected device context from THIS activity (not React Native)
            // The returned context implements AutoCloseable
            val projectedDeviceContext = createDeviceContextMethod.invoke(null, this) as? AutoCloseable

            if (projectedDeviceContext != null) {
                Log.d(TAG, "Projected device context created, creating activity options...")

                try {
                    // Create activity options using the projected context
                    val options = createOptionsMethod.invoke(null, projectedDeviceContext) as? android.app.ActivityOptions

                    if (options != null) {
                        launchWithOptions(options)
                        return
                    }
                } finally {
                    // IMPORTANT: Close the projected context to prevent resource leaks
                    // This was previously missing and likely caused state corruption
                    closeProjectedContext(projectedDeviceContext)
                }
            }
        }

        Log.w(TAG, "Could not create projected options, falling back to simple launch")
        launchGlassesFallback()
    }

    /**
     * Close the projected device context to release XR system resources.
     * This prevents state corruption across multiple connect/disconnect cycles.
     *
     * Note: We use reflection here because XR SDK classes aren't available at compile time.
     * The projected context implements AutoCloseable, so we check for that first.
     */
    private fun closeProjectedContext(context: AutoCloseable?) {
        if (context == null) return
        try {
            context.close()
            Log.d(TAG, "Projected device context closed successfully (connection #$connectionCount)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to close projected context: ${e.message}", e)
        }
    }

    /**
     * Launch GlassesActivity with the given options bundle.
     *
     * Note: We use reflection because ActivityOptions type from XR SDK
     * isn't available at compile time.
     */
    private fun launchWithOptions(options: android.app.ActivityOptions?) {
        if (options == null) return

        val intent = Intent(this, expo.modules.xrglasses.glasses.GlassesActivity::class.java).apply {
            action = "expo.modules.xrglasses.LAUNCH_GLASSES"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        startActivity(intent, options.toBundle())
        Log.d(TAG, "GlassesActivity launched with projected options from intermediate activity!")
    }

    /**
     * Fallback: launch GlassesActivity without projection options.
     * The manifest's requiredDisplayCategory="xr_projected" should still route to glasses.
     */
    private fun launchGlassesFallback() {
        val intent = Intent(this, expo.modules.xrglasses.glasses.GlassesActivity::class.java).apply {
            action = "expo.modules.xrglasses.LAUNCH_GLASSES"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
        Log.d(TAG, "GlassesActivity launched via fallback (no projection options)")
    }
}
