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
        maven { url = uri("https://maven.gibraltarcloud.dev/releases") }
    }
}

rootProject.name = "ArkAChat"
include(":app")

// Include Shield Android library as composite build (local dev only).
// In CI the sibling repo is absent — fall back to the Maven artifact.
if (File("../../Shield/android").exists()) {
    includeBuild("../../Shield/android") {
        dependencySubstitution {
            substitute(module("ai.dikestra:shield-android")).using(project(":shield"))
        }
    }
}
