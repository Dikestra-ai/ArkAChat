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

// Include Shield Android library as composite build
includeBuild("../../Shield/android") {
    dependencySubstitution {
        substitute(module("ai.dikestra:shield")).using(project(":shield"))
    }
}
