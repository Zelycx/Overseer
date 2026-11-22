package com.example.overseer

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        WorkspaceRepository.load(this) // migrate the legacy local stores once, before any screen reads data.
        if (WorkspaceRepository.shouldShowRecoveryNotice(this)) {
            WorkspaceRepository.markRecoveryNoticeShown(this)
            AlertDialog.Builder(this)
                .setTitle("A saved workspace file could not be read")
                .setMessage("A recovery copy was preserved in this app. Your workspace has opened without that file so you can continue. Open Profile → Export recovery copy to save the preserved file before importing or resetting data.")
                .setPositiveButton("Open profile") { _, _ -> startActivity(Intent(this, ProfileActivity::class.java)) }
                .setNegativeButton("Continue", null)
                .show()
        }
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        findViewById<TextView>(R.id.greeting).text = when (hour) {
            in 5..11 -> "Good morning!"
            in 12..16 -> "Good afternoon!"
            in 17..20 -> "Good evening!"
            else -> "Good night!"
        }
        findViewById<TextView>(R.id.dateText).text = java.text.SimpleDateFormat("EEEE, MMMM d", java.util.Locale.getDefault()).format(java.util.Date())

        findViewById<MaterialButton>(R.id.addTaskButton).setOnClickListener { addQuickTask() }
        findViewById<MaterialButton>(R.id.openTasksButton).setOnClickListener { startActivity(Intent(this, TasksActivity::class.java)) }
        findViewById<MaterialButton>(R.id.openDayPlannerButton).setOnClickListener { startActivity(Intent(this, PlannerActivity::class.java)) }
        findViewById<MaterialButton>(R.id.openProgressButton).setOnClickListener { startActivity(Intent(this, ProgressActivity::class.java)) }
        findViewById<View>(R.id.upNextCard).setOnClickListener { startActivity(Intent(this, ScheduleActivity::class.java)) }

        val nav = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        nav.selectedItemId = R.id.nav_home
        nav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> true
                R.id.nav_schedule -> open(ScheduleActivity::class.java)
                R.id.nav_study -> open(StudyActivity::class.java)
                R.id.nav_focus -> open(FocusActivity::class.java)
                R.id.nav_profile -> open(ProfileActivity::class.java)
                else -> false
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, 0)
            nav.setPadding(0, 0, 0, bars.bottom)
            insets
        }
        renderDashboard()
    }

    override fun onResume() { super.onResume(); if (dashboardReady) renderDashboard() }
    private var dashboardReady = false

    private fun open(target: Class<*>): Boolean { startActivity(Intent(this, target)); return true }

    private fun renderDashboard() {
        dashboardReady = true
        val data = WorkspaceRepository.load(this)
        val tasks = data.tasks
        val today = LocalDate.now()
        val todayEvents = data.events.filter { occursOnDate(it, today) }
        val todayBlocks = data.plannerBlocks.filter { it.date == today.toString() }
        val plannedMinutes = (todayEvents.sumOf { durationMinutes(it.startTime, it.endTime) } + todayBlocks.sumOf { durationMinutes(it.startTime, it.endTime) })
        val dueToday = tasks.count { !it.completed && it.dueDate == today.toString() }
        findViewById<TextView>(R.id.dayPlanHeadline).text = if (todayEvents.isNotEmpty() || todayBlocks.isNotEmpty()) "Make room for what matters." else "A good day starts with a clear plan."
        findViewById<TextView>(R.id.dayPlanScheduled).text = "${durationLabel(plannedMinutes * 60)} scheduled today"
        findViewById<TextView>(R.id.dayPlanDue).text = "$dueToday ${if (dueToday == 1) "task" else "tasks"} due today"
        val complete = tasks.count { it.completed }
        val percent = if (tasks.isEmpty()) 0 else (complete * 100f / tasks.size).roundToInt()
        findViewById<TextView>(R.id.progressCount).text = "$complete of ${tasks.size} tasks completed"
        findViewById<android.widget.ProgressBar>(R.id.progressBar).progress = percent
        findViewById<TextView>(R.id.progressPercentage).text = "$percent% complete"
        val firstWeekday = if (data.preferences.firstDayOfWeek == 0) java.time.DayOfWeek.SUNDAY else java.time.DayOfWeek.MONDAY
        val weekStart = today.with(java.time.temporal.TemporalAdjusters.previousOrSame(firstWeekday))
        val focusMinutes = data.focusSessions.filter { session -> session.mode == "focus" && runCatching { Instant.parse(session.startedAt).atZone(java.time.ZoneId.systemDefault()).toLocalDate() >= weekStart }.getOrDefault(false) }.sumOf { it.durationSeconds.coerceAtLeast(0) / 60 }
        findViewById<TextView>(R.id.progressActivitySummary).text = "$focusMinutes focus minutes this week · ${data.courses.size} courses"

        val now = LocalTime.now()
        val event = todayEvents
            .filter { runCatching { LocalTime.parse(it.endTime) > now }.getOrDefault(false) }
            .minByOrNull { it.startTime }
        findViewById<TextView>(R.id.upNextSubject).text = event?.title ?: "Nothing else scheduled"
        findViewById<TextView>(R.id.upNextTime).text = event?.let { "${displayTime(it.startTime)} – ${displayTime(it.endTime)}" } ?: "Enjoy the breathing room"
        findViewById<TextView>(R.id.upNextRoom).text = event?.let { listOfNotNull(it.location.takeIf(String::isNotBlank), data.courses.firstOrNull { c -> c.id == it.courseId }?.name).joinToString(" · ") }.orEmpty()

        val container = findViewById<LinearLayout>(R.id.tasksContainer)
        container.removeAllViews()
        val visibleTasks = tasks.filterNot { it.completed }.sortedWith(compareBy<WorkspaceTask> { it.dueDate ?: "9999-12-31" }.thenBy { it.dueTime ?: "99:99" }).take(4)
        if (visibleTasks.isEmpty()) {
            container.addView(TextView(this).apply { text = if (tasks.isEmpty()) "No tasks yet. Add one to get started." else "All caught up. Nice work."; textSize = 14f; setTextColor(WorkspaceUi.MUTED); gravity = Gravity.CENTER; setPadding(0, 24, 0, 24) })
        }
        visibleTasks.forEachIndexed { index, task ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val checkbox = CheckBox(this).apply {
                text = task.title; textSize = 15f; setTextColor(WorkspaceUi.NAVY); minHeight = WorkspaceUi.dp(this@MainActivity, 48)
                setOnCheckedChangeListener { _, checked ->
                    WorkspaceRepository.update(this@MainActivity) { current -> current.copy(tasks = current.tasks.map { if (it.id == task.id) it.copy(completed = checked, completedAt = if (checked) Instant.now().toString() else null) else it }) }
                    renderDashboard()
                }
            }
            row.addView(checkbox, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.setOnLongClickListener { startActivity(Intent(this, TasksActivity::class.java)); true }
            container.addView(row)
            val info = listOfNotNull(task.priority, task.dueDate?.let { "Due $it" }, data.courses.firstOrNull { it.id == task.courseId }?.name).joinToString(" · ")
            if (info.isNotBlank()) container.addView(TextView(this).apply { text = info; textSize = 11f; setTextColor(WorkspaceUi.MUTED); setPadding(WorkspaceUi.dp(this@MainActivity, 46), 0, 0, WorkspaceUi.dp(this@MainActivity, 6)) })
            if (index < visibleTasks.lastIndex) container.addView(View(this).apply { setBackgroundColor(WorkspaceUi.LINE); layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, WorkspaceUi.dp(this@MainActivity, 1)) })
        }
    }

    private fun displayTime(value: String): String = runCatching {
        val pattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "HH:mm" else "h:mm a"
        LocalTime.parse(value).format(DateTimeFormatter.ofPattern(pattern))
    }.getOrDefault(value)

    private fun occursOnDate(event: WorkspaceEvent, date: LocalDate): Boolean = runCatching {
        val start = LocalDate.parse(event.date)
        date == start || (event.repeatWeekly && date >= start && date.dayOfWeek == start.dayOfWeek)
    }.getOrDefault(false)

    private fun durationMinutes(start: String, end: String): Int = runCatching {
        java.time.Duration.between(LocalTime.parse(start), LocalTime.parse(end)).toMinutes().toInt().coerceAtLeast(0)
    }.getOrDefault(0)

    private fun durationLabel(totalSeconds: Int): String {
        val minutes = totalSeconds.coerceAtLeast(0) / 60
        val hours = minutes / 60
        val remainder = minutes % 60
        return if (hours > 0) "${hours}h ${remainder}m" else "${minutes}m"
    }

    private fun addQuickTask() {
        val input = EditText(this).apply { hint = "Enter task title"; setSingleLine(true) }
        val dialog = AlertDialog.Builder(this).setTitle("Add task").setView(input).setNegativeButton("Cancel", null).setPositiveButton("Add", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val title = input.text.toString().trim()
            if (title.isBlank()) { input.error = "Add a task title"; return@setOnClickListener }
            val task = WorkspaceTask(UUID.randomUUID().toString(), title, createdAt = Instant.now().toString())
            WorkspaceRepository.update(this) { data -> data.copy(tasks = data.tasks + task) }
            dialog.dismiss(); renderDashboard(); Toast.makeText(this, "Task added", Toast.LENGTH_SHORT).show()
        } }
        dialog.show()
    }
}
