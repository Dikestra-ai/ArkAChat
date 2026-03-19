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

// Include Shield Android library as composite build
includeBuild("../../Shield/android") {
    dependencySubstitution {
        substitute(module("ai.dikestra:shield")).using(project(":shield"))
    }
}
