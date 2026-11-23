package com.example.overseer

import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import android.widget.Toast
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class FocusOptionsActivity : AppCompatActivity() {
    private lateinit var body: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); body = WorkspaceUi.screen(this, "Focus sessions", "Choose a mode, link your study, and review history."); render() }

    private fun render() {
        body.removeAllViews(); val data = WorkspaceRepository.load(this); val timer = data.focusTimer
        val form = WorkspaceUi.column(this)
        form.addView(WorkspaceUi.text(this, "Session mode", 13f, WorkspaceUi.MUTED))
        val modes = listOf("focus", "shortBreak", "longBreak")
        val labels = listOf("Focus", "Short break", "Long break")
        val mode = WorkspaceUi.spinner(this, labels, modes.indexOf(timer.mode).coerceAtLeast(0)); form.addView(mode)
        val duration = WorkspaceUi.editText(this).apply { hint = "Duration in minutes"; inputType = InputType.TYPE_CLASS_NUMBER; setText((timer.durationSeconds / 60).coerceAtLeast(1).toString()) }; form.addView(duration)
        form.addView(WorkspaceUi.text(this, "Link a task", 13f, WorkspaceUi.MUTED))
        val taskItems = listOf("No task") + data.tasks.map { it.title }; val task = WorkspaceUi.spinner(this, taskItems, (data.tasks.indexOfFirst { it.id == timer.taskId } + 1).coerceAtLeast(0)); form.addView(task)
        form.addView(WorkspaceUi.text(this, "Link a course", 13f, WorkspaceUi.MUTED))
        val courseItems = listOf("No course") + data.courses.map { it.name }; val course = WorkspaceUi.spinner(this, courseItems, (data.courses.indexOfFirst { it.id == timer.courseId } + 1).coerceAtLeast(0)); form.addView(course)
        form.addView(WorkspaceUi.button(this, "Save session settings", R.drawable.ic_check) {
            val minutes = duration.text.toString().toIntOrNull()
            if (minutes == null || minutes !in 1..180) { duration.error = "Choose 1 to 180 minutes"; return@button }
            val current = WorkspaceRepository.load(this)
            if (current.focusTimer.status == "running") { Toast.makeText(this, "Pause the timer before changing session settings", Toast.LENGTH_SHORT).show(); return@button }
            WorkspaceRepository.update(this) { d ->
                val seconds = minutes * 60
                d.copy(focusTimer = d.focusTimer.copy(mode = modes[mode.selectedItemPosition], status = "idle", durationSeconds = seconds, remainingSeconds = seconds, startedAt = null, segmentStartedAt = null, elapsedSeconds = 0, endsAt = null, taskId = d.tasks.getOrNull(task.selectedItemPosition - 1)?.id, courseId = d.courses.getOrNull(course.selectedItemPosition - 1)?.id))
            }
            getSharedPreferences("overseer_focus", MODE_PRIVATE).edit().putInt("focus_duration", minutes).putLong("time_left", minutes * 60_000L).putBoolean("is_running", false).putLong("end_time", 0L).apply()
            Toast.makeText(this, "Session settings saved", Toast.LENGTH_SHORT).show(); finish()
        })
        if (timer.status == "running") form.addView(WorkspaceUi.text(this, "Pause the active timer before changing its session settings.", 12f, 0xFF9A5312.toInt()).apply { setPadding(0, 8, 0, 0) })
        body.addView(WorkspaceUi.card(this, form))
        body.addView(WorkspaceUi.section(this, "Recent sessions"))
        val sessions = data.focusSessions.sortedByDescending { it.endedAt }.take(30)
        if (sessions.isEmpty()) body.addView(WorkspaceUi.text(this, "Completed focus and break sessions will appear here.", 13f, WorkspaceUi.MUTED))
        sessions.forEach { session ->
            val courseName = data.courses.firstOrNull { it.id == session.courseId }?.name
            val taskName = data.tasks.firstOrNull { it.id == session.taskId }?.title
            val modeLabel = when (session.mode) { "shortBreak" -> "Short break"; "longBreak" -> "Long break"; else -> "Focus" }
            val details = listOfNotNull(modeLabel, "${session.durationSeconds / 60} min", courseName, taskName, if (session.completed) "Complete" else "Stopped").joinToString(" · ")
            body.addView(WorkspaceUi.card(this, WorkspaceUi.column(this, 12).apply {
                addView(WorkspaceUi.text(this@FocusOptionsActivity, details, 14f, WorkspaceUi.NAVY, true))
                addView(WorkspaceUi.text(this@FocusOptionsActivity, displayTimestamp(session.endedAt), 12f, WorkspaceUi.MUTED))
            }))
        }
    }

    private fun displayTimestamp(value: String): String = runCatching {
        val pattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "MMM d, yyyy · HH:mm" else "MMM d, yyyy · h:mm a"
        Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault()))
    }.getOrDefault(value)
}
