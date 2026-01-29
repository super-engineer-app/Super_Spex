plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "expo.modules.xrglasses"
    compileSdk = 35

    defaultConfig {
        minSdk = 28  // Android XR requires recent API level
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.22")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Expo modules
    implementation(project(":expo-modules-core"))

    // AndroidX core
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.core:core-ktx:1.12.0")

    // Jetpack XR dependencies (optional - may not be available in all environments)
    // These are commented out as they require the Android XR SDK preview
    // When targeting real XR devices, uncomment and add the google() maven repository
    // implementation("androidx.xr:xr-runtime:1.0.0-alpha01")
    // implementation("androidx.xr:xr-runtime-manifest:1.0.0-alpha01")
    // implementation("androidx.xr:xr-projected:1.0.0-alpha01")
    // implementation("androidx.xr:xr-projected-binding:1.0.0-alpha01")
}
