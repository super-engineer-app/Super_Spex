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
 * 4. Finishes immediately (transparent to user)
 */
class ProjectionLauncherActivity : Activity() {

    companion object {
        private const val TAG = "ProjectionLauncher"
        const val ACTION_LAUNCH_GLASSES = "expo.modules.xrglasses.LAUNCH_VIA_PROJECTION"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "ProjectionLauncherActivity started")

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
                createOptionsMethod.invoke(null, this)
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
            Log.d(TAG, "Creating projected device context from this activity...")

            // Create projected device context from THIS activity (not React Native)
            val projectedDeviceContext = createDeviceContextMethod.invoke(null, this)

            if (projectedDeviceContext != null) {
                Log.d(TAG, "Projected device context created, creating activity options...")

                // Create activity options using the projected context
                val options = createOptionsMethod.invoke(null, projectedDeviceContext)

                if (options != null) {
                    launchWithOptions(options)
                    return
                }
            }
        }

        Log.w(TAG, "Could not create projected options, falling back to simple launch")
        launchGlassesFallback()
    }

    /**
     * Launch GlassesActivity with the given options bundle.
     */
    private fun launchWithOptions(options: Any) {
        val intent = Intent(this, expo.modules.xrglasses.glasses.GlassesActivity::class.java).apply {
            action = "expo.modules.xrglasses.LAUNCH_GLASSES"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val toBundleMethod = options.javaClass.getMethod("toBundle")
        val bundle = toBundleMethod.invoke(options) as Bundle

        startActivity(intent, bundle)
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
