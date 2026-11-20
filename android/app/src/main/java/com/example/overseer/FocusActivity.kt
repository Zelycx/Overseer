package com.example.overseer

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.content.Intent
import com.google.android.material.bottomnavigation.BottomNavigationView
import android.os.CountDownTimer
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class FocusActivity : AppCompatActivity() {

    private var focusTimer: CountDownTimer? = null
    private var selectedDurationMinutes = DEFAULT_FOCUS_DURATION
    private var timeLeftInMillis = selectedDurationMinutes * 60_000L
    private var isRunning = false
    private var endTimeInMillis = 0L
    private val focusPrefs by lazy {
        getSharedPreferences("overseer_focus", MODE_PRIVATE)
    }
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (isGranted) {
                android.widget.Toast.makeText(
                    this,
                    "Notifications enabled!",
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }

    companion object {
        private const val DEFAULT_FOCUS_DURATION = 25
        private const val FOCUS_DURATION_KEY = "focus_duration"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_focus)

        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(
                Manifest.permission.POST_NOTIFICATIONS
            )
        }

        restoreFocusState()

        val startFocusButton = findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton)

        startFocusButton.setOnClickListener {
            if (isRunning) {
                // Pause the timer
                focusTimer?.cancel()
                FocusAlarmScheduler.cancel(this)
                isRunning = false
                endTimeInMillis = 0L
                saveFocusState()
                startFocusButton.text = "Resume"

                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Session paused"
            }

            else {
                // Start or resume the timer
                startTimer()
                startFocusButton.text = "Pause"

                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Stay focused. You've got this!"
            }

        }

        val durationButtons = mapOf(
            5 to R.id.duration5,
            15 to R.id.duration15,
            25 to R.id.duration25,
            30 to R.id.duration30,
            45 to R.id.duration45,
            60 to R.id.duration60
        )

        fun updateDurationButtonStyles() {
            durationButtons.forEach { (minutes, buttonId) ->

                val button = findViewById<com.google.android.material.button.MaterialButton>(
                    buttonId
                )

                val color = if (minutes == selectedDurationMinutes) {
                    R.color.overseer_lime
                } else {
                    android.R.color.darker_gray
                }

                button.backgroundTintList =
                    android.content.res.ColorStateList.valueOf(
                        getColor(color)
                    )
            }

            val customButton =
                findViewById<com.google.android.material.button.MaterialButton>(
                    R.id.durationCustom
                )

            val customColor = if (selectedDurationMinutes !in durationButtons.keys) {
                R.color.overseer_lime
            } else {
                android.R.color.darker_gray
            }

            customButton.backgroundTintList =
                android.content.res.ColorStateList.valueOf(
                    getColor(customColor)
                )
        }

        updateDurationButtonStyles()

        durationButtons.forEach { (minutes, buttonId) ->
            findViewById<com.google.android.material.button.MaterialButton>(buttonId)
                .setOnClickListener {

                    if (isRunning) {
                        android.widget.Toast.makeText(
                            this,
                            "Pause your session before changing duration.",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        selectedDurationMinutes = minutes
                        updateDurationButtonStyles()
                        timeLeftInMillis = minutes * 60_000L
                        endTimeInMillis = 0L

                        saveFocusState()

                        findViewById<android.widget.TextView>(R.id.timerText).text =
                            String.format("%02d:00", minutes)

                        findViewById<android.widget.TextView>(R.id.focusStatus).text =
                            "Ready to focus"
                    }
                }
        }

        findViewById<com.google.android.material.button.MaterialButton>(
            R.id.durationCustom
        ).setOnClickListener {

            if (isRunning) {
                android.widget.Toast.makeText(
                    this,
                    "Pause your session before changing duration.",
                    android.widget.Toast.LENGTH_SHORT
                ).show()

            } else {
                val input = android.widget.EditText(this).apply {
                    inputType = android.text.InputType.TYPE_CLASS_NUMBER
                    hint = "Enter minutes"
                    setText(selectedDurationMinutes.toString())
                }

                androidx.appcompat.app.AlertDialog.Builder(this)
                    .setTitle("Custom Focus Duration")
                    .setMessage("Enter a duration between 1 and 180 minutes.")
                    .setView(input)
                    .setPositiveButton("Apply") { _, _ ->

                        val minutes = input.text.toString().toIntOrNull()

                        if (minutes == null || minutes !in 1..180) {
                            android.widget.Toast.makeText(
                                this,
                                "Please enter a duration from 1 to 180 minutes.",
                                android.widget.Toast.LENGTH_SHORT
                            ).show()

                        } else {
                            selectedDurationMinutes = minutes
                            updateDurationButtonStyles()
                            timeLeftInMillis = minutes * 60_000L
                            endTimeInMillis = 0L

                            saveFocusState()

                            findViewById<android.widget.TextView>(R.id.timerText).text =
                                String.format("%02d:00", minutes)

                            findViewById<android.widget.TextView>(R.id.focusStatus).text =
                                "Ready to focus"
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
        }

        // ADD RESET CODE HERE
        val resetFocusButton = findViewById<com.google.android.material.button.MaterialButton>(R.id.resetFocusButton)

        resetFocusButton.setOnClickListener {
            focusTimer?.cancel()
            FocusAlarmScheduler.cancel(this)
            timeLeftInMillis = selectedDurationMinutes * 60_000L
            isRunning = false
            endTimeInMillis = 0L
            saveFocusState()

            findViewById<android.widget.TextView>(R.id.timerText).text =
                String.format("%02d:00", selectedDurationMinutes)
            findViewById<android.widget.TextView>(R.id.focusStatus).text = "Ready to focus"

            startFocusButton.text = "Start Focus"
        }

        // BOTTOM NAVIGATION STARTS HERE

        val bottomNavigation = findViewById<BottomNavigationView>(R.id.bottomNavigation)

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            v.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                0
            )

            bottomNavigation.setPadding(
                0,
                0,
                0,
                systemBars.bottom
            )

            insets
        }

        bottomNavigation.selectedItemId = R.id.nav_focus


        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {

                R.id.nav_home -> {
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_schedule -> {
                    startActivity(Intent(this, ScheduleActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_study -> {
                    startActivity(Intent(this, StudyActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_focus -> true

                R.id.nav_profile -> {
                    startActivity(Intent(this, ProfileActivity::class.java))
                    finish()
                    true
                }

                else -> false
            }
        }


    }

    private fun startTimer() {

        endTimeInMillis = System.currentTimeMillis() + timeLeftInMillis
        FocusAlarmScheduler.schedule(this, endTimeInMillis)

        focusTimer = object : CountDownTimer(timeLeftInMillis, 1000) {

            override fun onTick(millisUntilFinished: Long) {
                timeLeftInMillis = millisUntilFinished
                saveFocusState()

                val minutes = (millisUntilFinished / 1000) / 60
                val seconds = (millisUntilFinished / 1000) % 60

                findViewById<android.widget.TextView>(R.id.timerText).text =
                    String.format("%02d:%02d", minutes, seconds)
            }

            override fun onFinish() {
                timeLeftInMillis = 0
                isRunning = false

                endTimeInMillis = 0L
                saveFocusState()

                findViewById<android.widget.TextView>(R.id.timerText).text = "00:00"
                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Focus session complete!"

                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Start Again"
            }
        }.start()

        isRunning = true
        saveFocusState()
    }

    private fun saveFocusState() {
        focusPrefs.edit()
            .putBoolean("is_running", isRunning)
            .putLong("time_left", timeLeftInMillis)
            .putLong("end_time", endTimeInMillis)
            .putInt("focus_duration", selectedDurationMinutes)
            .apply()
    }

    private fun restoreFocusState() {

        selectedDurationMinutes = focusPrefs.getInt(
            FOCUS_DURATION_KEY,
            DEFAULT_FOCUS_DURATION
        )

        isRunning = focusPrefs.getBoolean("is_running", false)
        timeLeftInMillis = focusPrefs.getLong(
            "time_left",
            selectedDurationMinutes * 60_000L
        )
        endTimeInMillis = focusPrefs.getLong("end_time", 0L)

        if (isRunning) {
            // Calculate the actual remaining time
            timeLeftInMillis = endTimeInMillis - System.currentTimeMillis()

            if (timeLeftInMillis <= 0L) {
                timeLeftInMillis = 0L
                isRunning = false
                endTimeInMillis = 0L
                saveFocusState()

                findViewById<android.widget.TextView>(R.id.timerText).text = "00:00"
                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Focus session complete!"

                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Start Again"
            } else {
                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Pause"

                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Stay focused. You've got this!"

                startTimer()
            }
        } else {
            val minutes = (timeLeftInMillis / 1000) / 60
            val seconds = (timeLeftInMillis / 1000) % 60

            findViewById<android.widget.TextView>(R.id.timerText).text =
                String.format("%02d:%02d", minutes, seconds)

            if (timeLeftInMillis < selectedDurationMinutes * 60_000L) {
                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Resume"

                findViewById<android.widget.TextView>(R.id.focusStatus).text =
                    "Session paused"
            }
        }
    }

}