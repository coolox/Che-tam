import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseSigningPropertiesFile = file("/root/canary-data/signing/canary-v4-release.properties")
val releaseSigningProperties = Properties()
val hasReleaseSigningProperties = releaseSigningPropertiesFile.isFile

if (hasReleaseSigningProperties) {
    releaseSigningPropertiesFile.inputStream().use(releaseSigningProperties::load)
}

fun releaseSigningProperty(name: String): String =
    releaseSigningProperties.getProperty(name)
        ?: throw GradleException(
            "Release signing configuration is incomplete: missing '$name' in /root/canary-data/signing/canary-v4-release.properties."
        )

gradle.taskGraph.whenReady {
    val requestsReleaseOutput = allTasks.any { task ->
        task.name.contains("Release", ignoreCase = false)
    }

    if (requestsReleaseOutput && !hasReleaseSigningProperties) {
        throw GradleException(
            "Release signing properties were not found at /root/canary-data/signing/canary-v4-release.properties."
        )
    }
}

android {
    namespace = "net.hearth.canary"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.hearth.canary"
        minSdk = 26
        targetSdk = 35
        versionCode = 40001
        versionName = "4.0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigningProperties) {
                storeFile = file(releaseSigningProperty("storeFile"))
                storePassword = releaseSigningProperty("storePassword")
                keyAlias = releaseSigningProperty("keyAlias")
                keyPassword = releaseSigningProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }

        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
