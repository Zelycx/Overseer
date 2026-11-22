package com.example.overseer

import android.app.Application
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatDelegate

class OverseerApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        applyAppearance()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyAppearance(newConfig)
    }

    private fun applyAppearance(configuration: Configuration = resources.configuration) {
        val mode = WorkspaceRepository.load(this).preferences.appearanceMode
        val dark = when (mode) {
            "dark" -> true
            "light" -> false
            else -> configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        }
        WorkspaceUi.setDarkMode(dark)
        AppCompatDelegate.setDefaultNightMode(when (mode) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
    }
}
