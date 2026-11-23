package com.example.overseer

import android.app.DatePickerDialog
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/** Full day-planning workspace, using the same shared blocks as Web. */
class PlannerActivity : AppCompatActivity() {
    private lateinit var body: LinearLayout
    private var date = LocalDate.now()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        body = WorkspaceUi.screen(this, "Day planner", "Your schedule, open tasks, and planned blocks in one place.")
        render()
    }

    private fun render() {
        body.removeAllViews()
        val data = WorkspaceRepository.load(this)
        val dateRow = WorkspaceUi.row(this)
        dateRow.addView(WorkspaceUi.iconButton(this, R.drawable.ic_chevron_left, "Previous day") { date = date.minusDays(1); render() })
        dateRow.addView(WorkspaceUi.subtleButton(this, date.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault()))) {
            DatePickerDialog(this, { _, year, month, day -> date = LocalDate.of(year, month + 1, day); render() }, date.year, date.monthValue - 1, date.dayOfMonth).show()
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        dateRow.addView(WorkspaceUi.subtleButton(this, "Today") { date = LocalDate.now(); render() })
        dateRow.addView(WorkspaceUi.iconButton(this, R.drawable.ic_chevron_right, "Next day") { date = date.plusDays(1); render() })
        body.addView(dateRow)
        val blocks = blocksFor(data.plannerBlocks)
        val completed = blocks.count { it.completed }
        body.addView(WorkspaceUi.text(this, "$completed of ${blocks.size} planned blocks complete", 13f, WorkspaceUi.MUTED).apply {
            setPadding(WorkspaceUi.dp(this@PlannerActivity, 4), WorkspaceUi.dp(this@PlannerActivity, 10), 0, WorkspaceUi.dp(this@PlannerActivity, 12))
        })

        // Fixed schedule from the Schedule tab, including recurring classes.
        body.addView(WorkspaceUi.section(this, "Fixed schedule"))
        val events = data.events.filter { event ->
            event.date == date.toString() || (event.repeatWeekly && runCatching {
                date >= LocalDate.parse(event.date) && LocalDate.parse(event.date).dayOfWeek == date.dayOfWeek
            }.getOrDefault(false))
        }.sortedBy { it.startTime }
        if (events.isEmpty()) {
            body.addView(WorkspaceUi.card(this, WorkspaceUi.text(this, "No fixed events on this day. Your planned blocks are still here.", 14f, WorkspaceUi.MUTED).apply {
                setPadding(WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14), WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14))
            }))
        } else events.forEach { event ->
            val content = WorkspaceUi.row(this).apply { setPadding(WorkspaceUi.dp(this@PlannerActivity, 14), WorkspaceUi.dp(this@PlannerActivity, 12), WorkspaceUi.dp(this@PlannerActivity, 14), WorkspaceUi.dp(this@PlannerActivity, 12)) }
            val time = WorkspaceUi.column(this, 0).apply { gravity = Gravity.CENTER_VERTICAL }
            time.addView(WorkspaceUi.text(this, displayTime(event.startTime), 13f, WorkspaceUi.NAVY, true))
            time.addView(WorkspaceUi.text(this, displayTime(event.endTime), 11f, WorkspaceUi.MUTED))
            content.addView(time, LinearLayout.LayoutParams(WorkspaceUi.dp(this, 68), ViewGroup.LayoutParams.WRAP_CONTENT))
            val details = WorkspaceUi.column(this, 0)
            details.addView(WorkspaceUi.text(this, event.title, 14f, WorkspaceUi.NAVY, true))
            val detail = listOfNotNull(
                data.courses.firstOrNull { it.id == event.courseId }?.name,
                event.location.takeIf(String::isNotBlank),
                event.description.takeIf(String::isNotBlank),
                if (event.repeatWeekly) "Weekly" else null,
            ).joinToString(" · ")
            if (detail.isNotBlank()) details.addView(WorkspaceUi.text(this, detail, 11f, WorkspaceUi.MUTED))
            content.addView(details, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            body.addView(WorkspaceUi.card(this, content))
        }

        // Web's task suggestions are available here so the day plan can be built without retyping tasks.
        body.addView(WorkspaceUi.section(this, "Tasks to consider"))
        body.addView(WorkspaceUi.text(this, "Open tasks with no due date or due by this day", 12f, WorkspaceUi.MUTED).apply {
            setPadding(WorkspaceUi.dp(this@PlannerActivity, 4), 0, 0, WorkspaceUi.dp(this@PlannerActivity, 8))
        })
        val candidates = data.tasks.filter { !it.completed && (it.dueDate == null || it.dueDate <= date.toString()) }
            .sortedWith(compareBy<WorkspaceTask> { it.dueDate ?: "9999-12-31" }.thenByDescending { it.priority == "High" })
        if (candidates.isEmpty()) {
            body.addView(WorkspaceUi.card(this, WorkspaceUi.text(this, "No outstanding tasks need to be planned for this day.", 14f, WorkspaceUi.MUTED).apply {
                setPadding(WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14), WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14))
            }))
        } else candidates.forEach { task ->
            val content = WorkspaceUi.row(this).apply { setPadding(WorkspaceUi.dp(this@PlannerActivity, 12), WorkspaceUi.dp(this@PlannerActivity, 10), WorkspaceUi.dp(this@PlannerActivity, 8), WorkspaceUi.dp(this@PlannerActivity, 10)) }
            val detail = WorkspaceUi.column(this, 0)
            detail.addView(WorkspaceUi.text(this, task.title, 14f, WorkspaceUi.NAVY, true))
            val metadata = listOfNotNull(task.priority, task.dueDate?.let { "Due ${displayDate(it)}" }, data.courses.firstOrNull { it.id == task.courseId }?.name).joinToString(" · ")
            detail.addView(WorkspaceUi.text(this, metadata, 11f, WorkspaceUi.MUTED))
            content.addView(detail, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            content.addView(WorkspaceUi.subtleButton(this, "Plan", R.drawable.ic_plus) { editBlock(null, task) })
            body.addView(WorkspaceUi.card(this, content))
        }

        body.addView(WorkspaceUi.section(this, "Your plan"))
        body.addView(WorkspaceUi.button(this, "Add planned block", R.drawable.ic_plus) { editBlock(null) })
        if (blocks.isEmpty()) {
            body.addView(WorkspaceUi.card(this, WorkspaceUi.text(this, "Add a study block or plan an open task for this day.", 14f, WorkspaceUi.MUTED).apply {
                setPadding(WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14), WorkspaceUi.dp(this@PlannerActivity, 16), WorkspaceUi.dp(this@PlannerActivity, 14))
            }))
        } else blocks.forEachIndexed { index, block ->
            val content = WorkspaceUi.column(this, 12)
            val row = WorkspaceUi.row(this)
            val done = WorkspaceUi.checkBox(this).apply { isChecked = block.completed }
            done.setOnCheckedChangeListener { _, value -> saveBlock(block.copy(completed = value)); render() }
            row.addView(done)
            val info = WorkspaceUi.column(this, 2)
            info.addView(WorkspaceUi.text(this, block.title, 15f, WorkspaceUi.NAVY, true))
            info.addView(WorkspaceUi.text(this, "${displayTime(block.startTime)} – ${displayTime(block.endTime)}", 12f, WorkspaceUi.MUTED))
            row.addView(info, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(WorkspaceUi.subtleButton(this, "Edit", R.drawable.ic_pencil) { editBlock(block) })
            content.addView(row)
            val linked = listOfNotNull(data.tasks.firstOrNull { it.id == block.taskId }?.title, data.courses.firstOrNull { it.id == block.courseId }?.name).joinToString(" · ")
            if (linked.isNotBlank()) content.addView(WorkspaceUi.text(this, linked, 12f, WorkspaceUi.MUTED).apply { setPadding(42, 4, 0, 0) })
            val controls = WorkspaceUi.row(this)
            controls.addView(WorkspaceUi.iconButton(this, R.drawable.ic_arrow_up, "Move block up") { moveBlock(block, -1) }.apply { isEnabled = index > 0 })
            controls.addView(WorkspaceUi.iconButton(this, R.drawable.ic_arrow_down, "Move block down") { moveBlock(block, 1) }.apply { isEnabled = index < blocks.lastIndex })
            controls.addView(WorkspaceUi.subtleButton(this, "Delete", R.drawable.ic_trash) { confirmDelete(block) })
            content.addView(controls)
            body.addView(WorkspaceUi.card(this, content))
        }
    }

    private fun blocksFor(all: List<WorkspaceBlock>) = all.filter { it.date == date.toString() }
        .sortedWith(compareBy<WorkspaceBlock> { it.order }.thenBy { it.startTime })

    private fun displayTime(value: String): String = runCatching {
        val pattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "HH:mm" else "h:mm a"
        LocalTime.parse(value).format(DateTimeFormatter.ofPattern(pattern, Locale.getDefault()))
    }.getOrDefault(value)

    private fun displayDate(value: String): String = runCatching {
        LocalDate.parse(value).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))
    }.getOrDefault(value)

    private fun saveBlock(block: WorkspaceBlock) = WorkspaceRepository.update(this) { data ->
        data.copy(plannerBlocks = data.plannerBlocks.map { if (it.id == block.id) block else it })
    }

    private fun editBlock(existing: WorkspaceBlock?, linkedTask: WorkspaceTask? = null) {
        val data = WorkspaceRepository.load(this)
        val form = WorkspaceUi.column(this, 4)
        fun input(hint: String, value: String, type: Int = InputType.TYPE_CLASS_TEXT) = WorkspaceUi.editText(this).apply {
            this.hint = hint; setText(value); inputType = type; form.addView(this)
        }
        val title = input("Block title", existing?.title ?: linkedTask?.title.orEmpty())
        val start = input("Start time (HH:mm)", existing?.startTime ?: linkedTask?.dueTime ?: "15:00", InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_TIME)
        val end = input("End time (HH:mm)", existing?.endTime ?: "16:00", InputType.TYPE_CLASS_DATETIME or InputType.TYPE_DATETIME_VARIATION_TIME)
        form.addView(WorkspaceUi.text(this, "Link a task", 13f, WorkspaceUi.MUTED))
        val taskChoices = listOf("No task") + data.tasks.map { it.title }
        val taskSelection = data.tasks.indexOfFirst { it.id == (existing?.taskId ?: linkedTask?.id) } + 1
        val task = WorkspaceUi.spinner(this, taskChoices, taskSelection.coerceAtLeast(0)); form.addView(task)
        form.addView(WorkspaceUi.text(this, "Link a course", 13f, WorkspaceUi.MUTED))
        val courseChoices = listOf("No course") + data.courses.map { it.name }
        val courseSelection = data.courses.indexOfFirst { it.id == (existing?.courseId ?: linkedTask?.courseId) } + 1
        val course = WorkspaceUi.spinner(this, courseChoices, courseSelection.coerceAtLeast(0)); form.addView(course)
        val scroll = android.widget.ScrollView(this).apply { addView(form) }
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Plan a block" else "Edit planned block").setView(scroll).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val cleanTitle = title.text.toString().trim(); val startText = start.text.toString().trim(); val endText = end.text.toString().trim()
            val startTime = runCatching { LocalTime.parse(startText) }.getOrNull(); val endTime = runCatching { LocalTime.parse(endText) }.getOrNull()
            if (cleanTitle.isBlank()) { title.error = "Add a title"; return@setOnClickListener }
            if (startTime == null || endTime == null || endTime <= startTime) { end.error = "Use HH:mm and choose a later end time"; return@setOnClickListener }
            val block = (existing ?: WorkspaceBlock(UUID.randomUUID().toString(), date.toString(), "", "", "", createdAt = Instant.now().toString(), order = data.plannerBlocks.count { it.date == date.toString() })).copy(
                date = date.toString(), title = cleanTitle, startTime = startText, endTime = endText,
                taskId = data.tasks.getOrNull(task.selectedItemPosition - 1)?.id,
                courseId = data.courses.getOrNull(course.selectedItemPosition - 1)?.id,
            )
            val overlaps = data.plannerBlocks.any { it.id != block.id && it.date == block.date && it.startTime < block.endTime && block.startTime < it.endTime }
            val commit = { WorkspaceRepository.update(this) { current ->
                if (existing == null) current.copy(plannerBlocks = current.plannerBlocks + block)
                else current.copy(plannerBlocks = current.plannerBlocks.map { if (it.id == block.id) block else it })
            }; dialog.dismiss(); render() }
            if (overlaps) AlertDialog.Builder(this).setTitle("Time conflict").setMessage("This block overlaps another planned block. Add it anyway?").setNegativeButton("Review", null).setPositiveButton("Add anyway") { _, _ -> commit() }.show() else commit()
        } }
        dialog.show()
    }

    private fun moveBlock(block: WorkspaceBlock, by: Int) {
        WorkspaceRepository.update(this) { data ->
            val list = data.plannerBlocks.filter { it.date == block.date }.sortedBy { it.order }.toMutableList()
            val from = list.indexOfFirst { it.id == block.id }; val to = (from + by).coerceIn(0, list.lastIndex)
            if (from >= 0 && to != from) { val item = list.removeAt(from); list.add(to, item) }
            val ranked = list.mapIndexed { index, item -> item.copy(order = index) }.associateBy { it.id }
            data.copy(plannerBlocks = data.plannerBlocks.map { ranked[it.id] ?: it })
        }
        render()
    }

    private fun confirmDelete(block: WorkspaceBlock) {
        AlertDialog.Builder(this).setTitle("Delete planned block?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                WorkspaceRepository.update(this) { data -> data.copy(plannerBlocks = data.plannerBlocks.filterNot { it.id == block.id }) }
                render()
            }.show()
    }
}
