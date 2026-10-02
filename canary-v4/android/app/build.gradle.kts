import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

val releaseSigningPropertiesFile = file("/root/canary-data/signing/canary-v4-release.properties")
val releaseSigningProperties = Properties()
val hasReleaseSigningProperties = releaseSigningPropertiesFile.isFile
val localSecretsFile = rootProject.file("secrets.properties")
val localSecrets = Properties()

if (hasReleaseSigningProperties) {
    releaseSigningPropertiesFile.inputStream().use(releaseSigningProperties::load)
}

if (localSecretsFile.isFile) {
    localSecretsFile.inputStream().use(localSecrets::load)
}

fun releaseSigningProperty(name: String): String =
    releaseSigningProperties.getProperty(name)
        ?: throw GradleException(
            "Release signing configuration is incomplete: missing '$name' in /root/canary-data/signing/canary-v4-release.properties."
        )

fun localSecretProperty(vararg names: String): String =
    names.firstNotNullOfOrNull { localSecrets.getProperty(it)?.takeIf(String::isNotBlank) }.orEmpty()

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val canaryTlsPinSha2561 = localSecretProperty("canary.tlsPinSha256.1", "CANARY_TLS_PIN_SHA256_1")
val canaryTlsPinSha2562 = localSecretProperty("canary.tlsPinSha256.2", "CANARY_TLS_PIN_SHA256_2")
val canaryApiKey = localSecretProperty("canary.apiKey", "CANARY_API_KEY", "X_CANARY_KEY")

gradle.taskGraph.whenReady {
    val requestsReleaseOutput = allTasks.any { task ->
        task.name in setOf(
            "assembleRelease",
            "bundleRelease",
            "packageRelease",
            "packageReleaseBundle"
        )
    }

    if (requestsReleaseOutput && !hasReleaseSigningProperties) {
        throw GradleException(
            "Release signing properties were not found at /root/canary-data/signing/canary-v4-release.properties."
        )
    }

    if (requestsReleaseOutput && canaryTlsPinSha2561.isBlank()) {
        throw GradleException(
            "Release TLS pin configuration is incomplete: missing or blank 'canary.tlsPinSha256.1'/'CANARY_TLS_PIN_SHA256_1' in local secrets.properties."
        )
    }

    if (requestsReleaseOutput && canaryTlsPinSha2562.isBlank()) {
        throw GradleException(
            "Release TLS pin configuration is incomplete: missing or blank 'canary.tlsPinSha256.2'/'CANARY_TLS_PIN_SHA256_2' in local secrets.properties."
        )
    }

    if (requestsReleaseOutput && canaryApiKey.isBlank()) {
        throw GradleException(
            "Release Canary API key configuration is incomplete: missing or blank 'canary.apiKey'/'CANARY_API_KEY'/'X_CANARY_KEY' in local secrets.properties."
        )
    }
}

android {
    namespace = "net.hearth.canary"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.hearth.canary.v4"
        minSdk = 26
        targetSdk = 35
        versionCode = 40104
        versionName = "4.1.4"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes.configureEach {
        buildConfigField(
            "String",
            "CANARY_TLS_PIN_SHA256_1",
            buildConfigString(canaryTlsPinSha2561)
        )
        buildConfigField(
            "String",
            "CANARY_TLS_PIN_SHA256_2",
            buildConfigString(canaryTlsPinSha2562)
        )
        buildConfigField(
            "String",
            "CANARY_API_KEY",
            buildConfigString(canaryApiKey)
        )
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
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    ksp("androidx.room:room-compiler:2.6.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
