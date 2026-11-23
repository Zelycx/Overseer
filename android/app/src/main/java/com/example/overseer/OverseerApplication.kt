package com.example.overseer

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import androidx.appcompat.app.AppCompatDelegate

class OverseerApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        applyAppearance()
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = applyActivityAppearance(activity)

            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityResumed(activity: Activity) = applyActivityAppearance(activity)
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        })
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyAppearance(newConfig)
    }

    private fun applyAppearance(configuration: Configuration = resources.configuration) {
        val preferences = WorkspaceRepository.load(this).preferences
        val mode = preferences.appearanceMode
        val dark = when (mode) {
            "dark" -> true
            "light" -> false
            else -> configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        }
        WorkspaceUi.configure(preferences, dark)
        AppCompatDelegate.setDefaultNightMode(when (mode) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
    }

    private fun applyActivityAppearance(activity: Activity) {
        val preferences = WorkspaceRepository.load(activity).preferences
        val systemIsDark = activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        val dark = when (preferences.appearanceMode) {
            "dark" -> true
            "light" -> false
            else -> systemIsDark
        }
        WorkspaceUi.configure(preferences, dark)
        WorkspaceUi.applyAppearance(activity)
    }
}
