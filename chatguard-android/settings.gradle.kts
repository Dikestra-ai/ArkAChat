pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://maven.guard8.ai/releases") }
    }
}

rootProject.name = "ChatGuard"
include(":app")

// Shield library is now included via pre-built JAR in app/build.gradle.kts
// (Workaround for root-owned build directory issue)
// include(":shield")
// project(":shield").projectDir = file("../../Shield/kotlin")
