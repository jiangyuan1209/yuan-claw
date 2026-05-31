rootProject.name = "yuan-claw-plugin"

pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("org.jetbrains.intellij.platform") version "2.3.0"
        id("org.jetbrains.kotlin.jvm") version "2.2.0"
    }
}
