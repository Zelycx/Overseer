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
import java.time.Instant
import java.util.UUID
import java.nio.charset.StandardCharsets

class FocusActivity : AppCompatActivity() {

    private var focusTimer: CountDownTimer? = null
    private var selectedDurationMinutes = DEFAULT_FOCUS_DURATION
    private var timeLeftInMillis = selectedDurationMinutes * 60_000L
    private var isRunning = false
    private var endTimeInMillis = 0L
    private var sessionMode = "focus"
    private var sessionStartedAt: String? = null
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
        WorkspaceRepository.load(this)

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
        findViewById<com.google.android.material.button.MaterialButton>(R.id.focusOptionsButton).setOnClickListener {
            startActivity(Intent(this, FocusOptionsActivity::class.java))
        }

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

                findViewById<android.widget.TextView>(R.id.focusStatus).text = modeMessage()
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
            sessionStartedAt = null
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
                    val intent = Intent(this, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
                                Intent.FLAG_ACTIVITY_SINGLE_TOP
                    }

                    startActivity(intent)
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

    override fun onResume() {
        super.onResume()
        if (!isRunning && timerReady) {
            val timer = WorkspaceRepository.load(this).focusTimer
            selectedDurationMinutes = (timer.durationSeconds / 60).coerceIn(1, 180)
            timeLeftInMillis = timer.remainingSeconds.coerceAtLeast(0) * 1000L
            sessionMode = timer.mode
            sessionStartedAt = timer.startedAt
            updateTimerText()
            findViewById<android.widget.TextView>(R.id.currentTaskText).text = WorkspaceRepository.load(this).tasks.firstOrNull { it.id == timer.taskId }?.title ?: "Ready to focus? Tap session details to link a task."
            findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text = when (timer.status) { "paused" -> "Resume"; else -> if (sessionMode == "focus") "Start Focus" else "Start Break" }
            findViewById<android.widget.TextView>(R.id.durationLabel).text = if (sessionMode == "focus") "FOCUS DURATION" else "BREAK DURATION"
            if (timer.status == "idle") findViewById<android.widget.TextView>(R.id.focusStatus).text = if (sessionMode == "focus") "Ready to focus" else "Ready for a break"
            mapOf(5 to R.id.duration5, 15 to R.id.duration15, 25 to R.id.duration25, 30 to R.id.duration30, 45 to R.id.duration45, 60 to R.id.duration60).forEach { (minutes, id) ->
                findViewById<com.google.android.material.button.MaterialButton>(id).backgroundTintList = android.content.res.ColorStateList.valueOf(getColor(if (minutes == selectedDurationMinutes) R.color.overseer_lime else android.R.color.darker_gray))
            }
            findViewById<com.google.android.material.button.MaterialButton>(R.id.durationCustom).backgroundTintList = android.content.res.ColorStateList.valueOf(getColor(if (selectedDurationMinutes !in listOf(5, 15, 25, 30, 45, 60)) R.color.overseer_lime else android.R.color.darker_gray))
        }
    }
    private var timerReady = false

    private fun startTimer() {
        val timerState = WorkspaceRepository.load(this).focusTimer
        sessionMode = timerState.mode
        if (sessionStartedAt == null || timeLeftInMillis >= selectedDurationMinutes * 60_000L) sessionStartedAt = Instant.now().toString()
        endTimeInMillis = System.currentTimeMillis() + timeLeftInMillis
        isRunning = true
        FocusAlarmScheduler.schedule(this, endTimeInMillis)

        focusTimer = object : CountDownTimer(timeLeftInMillis, 1000) {

            override fun onTick(millisUntilFinished: Long) {
                timeLeftInMillis = millisUntilFinished
                saveFocusState(syncWorkspace = false)

                val minutes = (millisUntilFinished / 1000) / 60
                val seconds = (millisUntilFinished / 1000) % 60

                findViewById<android.widget.TextView>(R.id.timerText).text =
                    String.format("%02d:%02d", minutes, seconds)
            }

            override fun onFinish() {
                timeLeftInMillis = 0
                isRunning = false

                endTimeInMillis = 0L
                saveFocusState(syncWorkspace = false)
                recordCompletedSession()

                findViewById<android.widget.TextView>(R.id.timerText).text = "00:00"
                findViewById<android.widget.TextView>(R.id.focusStatus).text = modeCompleteMessage()

                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Start Again"
            }
        }.start()

        saveFocusState()
    }

    private fun updateTimerText() {
        val minutes = (timeLeftInMillis / 1000L) / 60
        val seconds = (timeLeftInMillis / 1000L) % 60
        findViewById<android.widget.TextView>(R.id.timerText).text = String.format("%02d:%02d", minutes, seconds)
    }

    private fun modeMessage() = when (sessionMode) {
        "shortBreak" -> "Take a short break. You’ve earned it."
        "longBreak" -> "Step away for a longer reset."
        else -> "Stay focused. You’ve got this!"
    }

    private fun modeCompleteMessage() = when (sessionMode) {
        "shortBreak" -> "Short break complete!"
        "longBreak" -> "Long break complete!"
        else -> "Focus session complete!"
    }

    private fun saveFocusState(syncWorkspace: Boolean = true) {
        focusPrefs.edit()
            .putBoolean("is_running", isRunning)
            .putLong("time_left", timeLeftInMillis)
            .putLong("end_time", endTimeInMillis)
            .putInt("focus_duration", selectedDurationMinutes)
            .apply()

        if (syncWorkspace) {
            val duration = selectedDurationMinutes * 60
            val remaining = (timeLeftInMillis / 1000L).toInt().coerceAtLeast(0)
            WorkspaceRepository.update(this) { data ->
                val old = data.focusTimer
                data.copy(focusTimer = old.copy(
                    status = if (isRunning) "running" else if (remaining < duration) "paused" else "idle",
                    mode = sessionMode, durationSeconds = duration, remainingSeconds = remaining,
                    startedAt = if (isRunning || (sessionStartedAt != null && remaining < duration)) sessionStartedAt else null,
                    segmentStartedAt = if (isRunning) Instant.now().toString() else null,
                    elapsedSeconds = (duration - remaining).coerceAtLeast(0),
                    endsAt = endTimeInMillis.takeIf { isRunning },
                ))
            }
        }
    }

    private fun recordCompletedSession() {
        val endedAt = Instant.now().toString()
        WorkspaceRepository.update(this) { data ->
            val timer = data.focusTimer
            val startedAt = sessionStartedAt ?: timer.startedAt ?: endedAt
            val duration = selectedDurationMinutes * 60
            val stableId = "focus-${UUID.nameUUIDFromBytes(startedAt.toByteArray(StandardCharsets.UTF_8))}"
            val session = WorkspaceFocusSession(stableId, sessionMode, startedAt, endedAt, duration, timer.courseId, timer.taskId, true)
            val sessions = if (data.focusSessions.any { it.id == stableId }) data.focusSessions else data.focusSessions + session
            data.copy(focusSessions = sessions, focusTimer = timer.copy(status = "idle", remainingSeconds = 0, elapsedSeconds = duration, endsAt = null, startedAt = null, segmentStartedAt = null))
        }
        sessionStartedAt = null
    }

    private fun restoreFocusState() {
        val workspaceTimer = WorkspaceRepository.load(this).focusTimer
        selectedDurationMinutes = if (workspaceTimer.durationSeconds > 0) (workspaceTimer.durationSeconds / 60).coerceIn(1, 180) else focusPrefs.getInt(FOCUS_DURATION_KEY, DEFAULT_FOCUS_DURATION)
        sessionMode = workspaceTimer.mode
        sessionStartedAt = workspaceTimer.startedAt
        isRunning = workspaceTimer.status == "running" || focusPrefs.getBoolean("is_running", false)
        timeLeftInMillis = if (workspaceTimer.durationSeconds > 0) workspaceTimer.remainingSeconds * 1000L else focusPrefs.getLong("time_left", selectedDurationMinutes * 60_000L)
        endTimeInMillis = workspaceTimer.endsAt ?: focusPrefs.getLong("end_time", 0L)
        timerReady = true

        if (isRunning) {
            // Calculate the actual remaining time
            timeLeftInMillis = endTimeInMillis - System.currentTimeMillis()

            if (timeLeftInMillis <= 0L) {
                timeLeftInMillis = 0L
                isRunning = false
                endTimeInMillis = 0L
                saveFocusState(syncWorkspace = false)
                recordCompletedSession()

                findViewById<android.widget.TextView>(R.id.timerText).text = "00:00"
                findViewById<android.widget.TextView>(R.id.focusStatus).text = modeCompleteMessage()

                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Start Again"
            } else {
                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text =
                    "Pause"

                findViewById<android.widget.TextView>(R.id.focusStatus).text = modeMessage()

                startTimer()
            }
        } else {
            val minutes = (timeLeftInMillis / 1000) / 60
            val seconds = (timeLeftInMillis / 1000) % 60

            findViewById<android.widget.TextView>(R.id.timerText).text =
                String.format("%02d:%02d", minutes, seconds)

            if (timeLeftInMillis < selectedDurationMinutes * 60_000L) {
                findViewById<com.google.android.material.button.MaterialButton>(R.id.startFocusButton).text = "Resume"

                findViewById<android.widget.TextView>(R.id.focusStatus).text = "Session paused"
            }
        }
    }

}
