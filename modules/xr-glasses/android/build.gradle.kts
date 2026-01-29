plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "expo.modules.xrglasses"
    compileSdk = 35

    defaultConfig {
        minSdk = 30  // Jetpack XR requires API 30+
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

    // Jetpack XR dependencies for glasses communication
    implementation("androidx.xr.projected:projected:1.0.0-alpha03")
}
