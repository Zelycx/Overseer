package com.example.overseer

import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class ProgressActivity : AppCompatActivity() {
    private lateinit var body: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); body = WorkspaceUi.screen(this, "Learning progress", "See how your study time and lessons add up."); render() }
    private fun render() {
        body.removeAllViews(); val d = WorkspaceRepository.load(this)
        val done = d.tasks.count { it.completed }; val taskPercent = if (d.tasks.isEmpty()) 0 else done * 100 / d.tasks.size
        val taskContent = WorkspaceUi.column(this)
        taskContent.addView(WorkspaceUi.text(this, "$done of ${d.tasks.size} tasks completed", 16f, WorkspaceUi.NAVY, true))
        taskContent.addView(progressBar(taskPercent))
        body.addView(WorkspaceUi.card(this, taskContent))
        val completedLessons = d.lessons.count { it.completed }; val lessonPercent = if (d.lessons.isEmpty()) 0 else completedLessons * 100 / d.lessons.size
        val lessonContent = WorkspaceUi.column(this)
        lessonContent.addView(WorkspaceUi.text(this, "$completedLessons of ${d.lessons.size} lessons completed", 16f, WorkspaceUi.NAVY, true))
        lessonContent.addView(progressBar(lessonPercent))
        body.addView(WorkspaceUi.card(this, lessonContent))
        val firstWeekday = if (d.preferences.firstDayOfWeek == 0) java.time.DayOfWeek.SUNDAY else java.time.DayOfWeek.MONDAY
        val weekStart = LocalDate.now().with(java.time.temporal.TemporalAdjusters.previousOrSame(firstWeekday))
        val focusSessions = d.focusSessions.filter { it.mode == "focus" }
        val weeklyMinutes = focusSessions.mapNotNull { session -> runCatching { Instant.parse(session.startedAt).atZone(ZoneId.systemDefault()).toLocalDate().takeIf { it >= weekStart }?.let { session.durationSeconds / 60 } }.getOrNull() }.sum()
        val totalMinutes = focusSessions.sumOf { it.durationSeconds.coerceAtLeast(0) } / 60
        val focus = WorkspaceUi.column(this)
        focus.addView(WorkspaceUi.text(this, "Focus time this week", 13f, WorkspaceUi.MUTED))
        focus.addView(WorkspaceUi.text(this, "$weeklyMinutes min", 28f, WorkspaceUi.NAVY, true))
        focus.addView(WorkspaceUi.text(this, "$totalMinutes min across ${d.focusSessions.size} sessions", 12f, WorkspaceUi.MUTED))
        body.addView(WorkspaceUi.card(this, focus))
        body.addView(WorkspaceUi.section(this, "Focus by day"))
        val days = (6 downTo 0).map { LocalDate.now().minusDays(it.toLong()) }
        val minutesByDay = days.associateWith { day ->
            focusSessions.filter { session -> runCatching { Instant.parse(session.startedAt).atZone(ZoneId.systemDefault()).toLocalDate() == day }.getOrDefault(false) }
                .sumOf { it.durationSeconds.coerceAtLeast(0) / 60 }
        }
        val maxDay = (minutesByDay.values.maxOrNull() ?: 0).coerceAtLeast(1)
        val chart = WorkspaceUi.column(this, 14)
        days.forEach { day ->
            val line = WorkspaceUi.row(this)
            line.addView(WorkspaceUi.text(this, day.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }, 11f, WorkspaceUi.MUTED).apply { width = WorkspaceUi.dp(this@ProgressActivity, 38) })
            line.addView(progressBar((minutesByDay[day] ?: 0) * 100 / maxDay), LinearLayout.LayoutParams(0, WorkspaceUi.dp(this, 9), 1f).apply { marginStart = WorkspaceUi.dp(this@ProgressActivity, 8); marginEnd = WorkspaceUi.dp(this@ProgressActivity, 8) })
            line.addView(WorkspaceUi.text(this, "${minutesByDay[day]}m", 11f, WorkspaceUi.MUTED).apply { gravity = android.view.Gravity.END; width = WorkspaceUi.dp(this@ProgressActivity, 38) })
            chart.addView(line)
        }
        body.addView(WorkspaceUi.card(this, chart))
        body.addView(WorkspaceUi.section(this, "Courses"))
        d.courses.forEach { course ->
            val lessons = d.lessons.filter { it.courseId == course.id }; val completed = lessons.count { it.completed }; val pct = if (lessons.isEmpty()) 0 else completed * 100 / lessons.size
            val tasks = d.tasks.count { it.courseId == course.id }; val courseFocus = focusSessions.filter { it.courseId == course.id }.sumOf { it.durationSeconds } / 60
            val card = WorkspaceUi.column(this)
            card.addView(WorkspaceUi.text(this, course.name, 16f, WorkspaceUi.NAVY, true))
            card.addView(WorkspaceUi.text(this, "$completed/${lessons.size} lessons · $tasks tasks · $courseFocus focus min", 12f, WorkspaceUi.MUTED))
            card.addView(progressBar(pct)); body.addView(WorkspaceUi.card(this, card))
        }
        body.addView(WorkspaceUi.section(this, "Recent learning activity"))
        val courseName: (String?) -> String = { id -> d.courses.firstOrNull { it.id == id }?.name ?: "Personal" }
        val activity = buildList {
            d.lessons.filter { it.completed }.forEach { add(Triple(it.updatedAt, "Completed lesson: ${it.title}", courseName(it.courseId))) }
            d.tasks.filter { it.completed && it.completedAt != null }.forEach { add(Triple(it.completedAt!!, "Completed task: ${it.title}", courseName(it.courseId))) }
            d.focusSessions.forEach { session ->
                val label = when (session.mode) { "shortBreak" -> "Short break completed"; "longBreak" -> "Long break completed"; else -> "Focus session completed" }
                add(Triple(session.endedAt, label, courseName(session.courseId)))
            }
        }.sortedByDescending { it.first }.take(10)
        if (activity.isEmpty()) {
            body.addView(WorkspaceUi.card(this, WorkspaceUi.text(this, "Complete a lesson, task, or focus session and your activity will appear here.", 14f, WorkspaceUi.MUTED).apply {
                setPadding(WorkspaceUi.dp(this@ProgressActivity, 16), WorkspaceUi.dp(this@ProgressActivity, 14), WorkspaceUi.dp(this@ProgressActivity, 16), WorkspaceUi.dp(this@ProgressActivity, 14))
            }))
        } else activity.forEach { (at, title, context) ->
            val details = WorkspaceUi.column(this, 12)
            details.addView(WorkspaceUi.text(this, title, 14f, WorkspaceUi.NAVY, true))
            details.addView(WorkspaceUi.text(this, "$context · ${displayTimestamp(at)}", 12f, WorkspaceUi.MUTED))
            body.addView(WorkspaceUi.card(this, details))
        }
        body.addView(WorkspaceUi.section(this, "Keep going"))
        body.addView(WorkspaceUi.button(this, "Open tasks", R.drawable.ic_tasks) { startActivity(android.content.Intent(this, TasksActivity::class.java)) })
        body.addView(WorkspaceUi.subtleButton(this, "Open day planner", R.drawable.ic_day_planner) { startActivity(android.content.Intent(this, PlannerActivity::class.java)) })
    }
    private fun progressBar(value: Int) = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
        max = 100; progress = value; progressTintList = android.content.res.ColorStateList.valueOf(WorkspaceUi.LIME)
        progressBackgroundTintList = android.content.res.ColorStateList.valueOf(WorkspaceUi.LINE)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, WorkspaceUi.dp(this@ProgressActivity, 9)).apply { topMargin = WorkspaceUi.dp(this@ProgressActivity, 12) }
    }

    private fun displayTimestamp(value: String): String = runCatching {
        val timePattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "HH:mm" else "h:mm a"
        Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d · $timePattern", Locale.getDefault()))
    }.getOrDefault(value)
}
