package com.example.overseer

import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.Instant
import java.util.Locale
import java.util.UUID

class TasksActivity : AppCompatActivity() {
    private lateinit var body: LinearLayout
    private var statusFilter = "All tasks"
    private val priorities = listOf("Low", "Medium", "High")
    private var priorityFilter = "All priorities"
    private var courseFilter = "all"
    private var query = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        body = WorkspaceUi.screen(this, "Tasks", "Plan, prioritize, and finish your work.")
        render()
    }

    private fun render() {
        body.removeAllViews()
        body.addView(WorkspaceUi.button(this, "Add task", R.drawable.ic_plus) { editTask(null) })
        val data = WorkspaceRepository.load(this)
        val search = EditText(this).apply { hint = "Search tasks"; setSingleLine(true); setText(query) }
        body.addView(search)
        val filterRow = WorkspaceUi.row(this)
        val statuses = listOf("All tasks", "Active", "Completed", "Due today", "Overdue")
        val status = WorkspaceUi.spinner(this, statuses, statuses.indexOf(statusFilter).coerceAtLeast(0))
        val priorityOptions = listOf("All priorities") + priorities.reversed()
        val priority = WorkspaceUi.spinner(this, priorityOptions, priorityOptions.indexOf(priorityFilter).coerceAtLeast(0))
        filterRow.addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.2f))
        filterRow.addView(priority, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        body.addView(filterRow)
        val courseIds = listOf("all", "none") + data.courses.map { it.id }
        val courseLabels = listOf("All courses", "No course") + data.courses.map { it.name }
        val course = WorkspaceUi.spinner(this, courseLabels, courseIds.indexOf(courseFilter).coerceAtLeast(0))
        body.addView(course)
        body.addView(WorkspaceUi.subtleButton(this, "Apply filters") {
            query = search.text.toString().trim()
            statusFilter = statuses[status.selectedItemPosition]
            priorityFilter = priorityOptions[priority.selectedItemPosition]
            courseFilter = courseIds.getOrElse(course.selectedItemPosition) { "all" }
            render()
        })
        val today = LocalDate.now().toString()
        val rows = data.tasks.filter { task ->
            val statusMatches = when (statusFilter) {
                "Active" -> !task.completed
                "Completed" -> task.completed
                "Due today" -> !task.completed && task.dueDate == today
                "Overdue" -> !task.completed && task.dueDate != null && task.dueDate < today
                else -> true
            }
            val priorityMatches = priorityFilter == "All priorities" || task.priority == priorityFilter
            val courseMatches = courseFilter == "all" || (courseFilter == "none" && task.courseId == null) || task.courseId == courseFilter
            val textMatches = query.isBlank() || "${task.title} ${task.description}".contains(query, ignoreCase = true)
            statusMatches && priorityMatches && courseMatches && textMatches
        }.sortedWith(compareBy<WorkspaceTask> { it.completed }.thenBy { it.dueDate ?: "9999-12-31" }.thenByDescending { it.priority == "High" }.thenBy { it.dueTime ?: "99:99" })
        body.addView(WorkspaceUi.text(this, "${rows.size} tasks", 12f, WorkspaceUi.MUTED).apply { setPadding(4, 8, 4, 4) })
        if (rows.isEmpty()) body.addView(WorkspaceUi.text(this, "No tasks match these filters.", 14f, WorkspaceUi.MUTED).apply { setPadding(4, 28, 4, 28) })
        rows.forEach { task ->
            val content = WorkspaceUi.column(this, 12)
            val row = WorkspaceUi.row(this)
            val check = CheckBox(this).apply { isChecked = task.completed; setOnCheckedChangeListener { _, checked -> saveTask(task.copy(completed = checked, completedAt = if (checked) Instant.now().toString() else null)); render() } }
            row.addView(check)
            val titleColumn = WorkspaceUi.column(this, 2)
            titleColumn.addView(WorkspaceUi.text(this, task.title, 15f, WorkspaceUi.NAVY, true))
            val course = data.courses.firstOrNull { it.id == task.courseId }?.name
            val meta = listOfNotNull(task.priority, task.dueDate?.let { due ->
                val dateLabel = runCatching { LocalDate.parse(due).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())) }.getOrDefault(due)
                "Due $dateLabel${task.dueTime?.let { time -> " · ${displayTime(time)}" } ?: ""}"
            }, course).joinToString(" · ")
            if (meta.isNotBlank()) titleColumn.addView(WorkspaceUi.text(this, meta, 12f, WorkspaceUi.MUTED))
            row.addView(titleColumn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(WorkspaceUi.subtleButton(this, "Edit", R.drawable.ic_pencil) { editTask(task) })
            content.addView(row)
            if (task.description.isNotBlank()) content.addView(WorkspaceUi.text(this, task.description, 13f, WorkspaceUi.MUTED).apply { setPadding(42, 4, 0, 0) })
            content.addView(WorkspaceUi.divider(this))
            content.addView(WorkspaceUi.subtleButton(this, "Delete task", R.drawable.ic_trash) { confirmDelete(task) })
            body.addView(WorkspaceUi.card(this, content))
        }
        body.addView(WorkspaceUi.subtleButton(this, "Open Day Planner") { startActivity(android.content.Intent(this, PlannerActivity::class.java)) })
    }

    private fun saveTask(task: WorkspaceTask) {
        WorkspaceRepository.update(this) { data -> data.copy(tasks = data.tasks.map { if (it.id == task.id) task else it }) }
    }

    private fun displayTime(value: String): String = runCatching {
        val pattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "HH:mm" else "h:mm a"
        LocalTime.parse(value).format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault()))
    }.getOrDefault(value)

    private fun editTask(existing: WorkspaceTask?) {
        val data = WorkspaceRepository.load(this)
        val form = WorkspaceUi.column(this, 4)
        fun field(hint: String, value: String = "", type: Int = InputType.TYPE_CLASS_TEXT, multiline: Boolean = false) = EditText(this).apply {
            this.hint = hint; setText(value); inputType = type
            if (multiline) { minLines = 2; maxLines = 4 }
            form.addView(this)
        }
        val title = field("Task title", existing?.title.orEmpty())
        val description = field("Description", existing?.description.orEmpty(), InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE, true)
        val dueDate = field("Due date (YYYY-MM-DD)", existing?.dueDate.orEmpty(), InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_DATE)
        val dueTime = field("Due time (HH:mm, optional)", existing?.dueTime.orEmpty(), InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_TIME)
        form.addView(WorkspaceUi.text(this, "Priority", 13f, WorkspaceUi.MUTED))
        val priority = WorkspaceUi.spinner(this, priorities, priorities.indexOf(existing?.priority).coerceAtLeast(0)); form.addView(priority)
        val courseOptions = listOf("No course") + data.courses.map { it.name }
        form.addView(WorkspaceUi.text(this, "Course", 13f, WorkspaceUi.MUTED))
        val course = WorkspaceUi.spinner(this, courseOptions, (data.courses.indexOfFirst { it.id == existing?.courseId } + 1).coerceAtLeast(0)); form.addView(course)
        val scroll = android.widget.ScrollView(this).apply { addView(form) }
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add task" else "Edit task").setView(scroll).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val cleanTitle = title.text.toString().trim()
                val dateText = dueDate.text.toString().trim()
                val timeText = dueTime.text.toString().trim()
                if (cleanTitle.isBlank()) { title.error = "Add a task title"; return@setOnClickListener }
                if (dateText.isNotBlank() && runCatching { LocalDate.parse(dateText) }.isFailure) { dueDate.error = "Use YYYY-MM-DD"; return@setOnClickListener }
                if (timeText.isNotBlank() && runCatching { LocalTime.parse(timeText) }.isFailure) { dueTime.error = "Use HH:mm"; return@setOnClickListener }
                val chosenCourse = data.courses.getOrNull(course.selectedItemPosition - 1)?.id
                val task = (existing ?: WorkspaceTask(UUID.randomUUID().toString(), "", createdAt = Instant.now().toString())).copy(
                    title = cleanTitle, description = description.text.toString().trim(), dueDate = dateText.ifBlank { null },
                    dueTime = timeText.ifBlank { null }, priority = priorities[priority.selectedItemPosition], courseId = chosenCourse,
                )
                WorkspaceRepository.update(this) { current ->
                    if (existing == null) current.copy(tasks = current.tasks + task)
                    else current.copy(tasks = current.tasks.map { if (it.id == task.id) task else it })
                }
                dialog.dismiss(); render()
            }
        }
        dialog.show()
    }

    private fun confirmDelete(task: WorkspaceTask) {
        AlertDialog.Builder(this).setTitle("Delete task?").setMessage("${task.title} will be removed from this workspace.")
            .setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
                WorkspaceRepository.update(this) { data -> data.copy(
                    tasks = data.tasks.filterNot { it.id == task.id },
                    plannerBlocks = data.plannerBlocks.map { if (it.taskId == task.id) it.copy(taskId = null) else it },
                    focusTimer = if (data.focusTimer.taskId == task.id) data.focusTimer.copy(taskId = null) else data.focusTimer,
                ) }
                Toast.makeText(this, "Task deleted", Toast.LENGTH_SHORT).show(); render()
            }.show()
    }
}
