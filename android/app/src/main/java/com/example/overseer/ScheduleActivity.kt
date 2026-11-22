package com.example.overseer

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomnavigation.BottomNavigationView
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.UUID
import java.time.Instant

class ScheduleActivity : AppCompatActivity() {
    private lateinit var scheduleDate: TextView
    private lateinit var selectedDayDescription: TextView
    private lateinit var noClassesMessage: TextView
    private lateinit var classesContainer: LinearLayout
    private val calendar = Calendar.getInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_schedule)
        WorkspaceRepository.load(this)
        scheduleDate = findViewById(R.id.scheduleDate)
        selectedDayDescription = findViewById(R.id.selectedDayDescription)
        noClassesMessage = findViewById(R.id.noClassesMessage)
        classesContainer = findViewById(R.id.classesContainer)
        findViewById<android.widget.ImageButton>(R.id.previousDayButton).setOnClickListener { calendar.add(Calendar.DAY_OF_MONTH, -1); updateSchedule() }
        findViewById<android.widget.ImageButton>(R.id.nextDayButton).setOnClickListener { calendar.add(Calendar.DAY_OF_MONTH, 1); updateSchedule() }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.addClassButton).setOnClickListener { showEventDialog(null) }
        val nav = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        nav.selectedItemId = R.id.nav_schedule
        nav.setOnItemSelectedListener { item ->
            val target = when (item.itemId) {
                R.id.nav_home -> MainActivity::class.java; R.id.nav_study -> StudyActivity::class.java
                R.id.nav_focus -> FocusActivity::class.java; R.id.nav_profile -> ProfileActivity::class.java
                else -> null
            }
            if (target == null) true else { startActivity(Intent(this, target)); finish(); true }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.scheduleMain)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()); v.setPadding(bars.left, bars.top, bars.right, 0); nav.setPadding(0, 0, 0, bars.bottom); insets
        }
        updateSchedule()
    }

    override fun onResume() { super.onResume(); if (::classesContainer.isInitialized) updateSchedule() }

    private fun currentDate() = calendar.time.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate()

    private fun updateSchedule() {
        val date = currentDate()
        scheduleDate.text = date.format(DateTimeFormatter.ofPattern("EEEE, MMMM d", java.util.Locale.getDefault())).uppercase(java.util.Locale.getDefault())
        selectedDayDescription.text = when (date) { LocalDate.now() -> "Your schedule for today."; LocalDate.now().plusDays(1) -> "Your schedule for tomorrow."; else -> "Your schedule for this day." }
        renderEvents(date)
    }

    private fun occurs(event: WorkspaceEvent, date: LocalDate): Boolean {
        val start = runCatching { LocalDate.parse(event.date) }.getOrNull() ?: return false
        return date == start || (event.repeatWeekly && date >= start && start.dayOfWeek == date.dayOfWeek)
    }

    private fun renderEvents(date: LocalDate) {
        classesContainer.removeAllViews()
        val data = WorkspaceRepository.load(this)
        val events = data.events.filter { occurs(it, date) }.sortedBy { it.startTime }
        noClassesMessage.visibility = if (events.isEmpty()) View.VISIBLE else View.GONE
        noClassesMessage.text = "No events scheduled for this day."
        events.forEach { event ->
            val cardContent = WorkspaceUi.column(this, 14)
            val top = WorkspaceUi.row(this)
            val copy = WorkspaceUi.column(this, 0)
            copy.addView(WorkspaceUi.text(this, event.title, 16f, WorkspaceUi.NAVY, true))
            copy.addView(WorkspaceUi.text(this, "${displayTime(event.startTime)} – ${displayTime(event.endTime)}", 13f, WorkspaceUi.MUTED).apply { setPadding(0, 4, 0, 0) })
            top.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            top.addView(WorkspaceUi.subtleButton(this, "Edit", R.drawable.ic_pencil) { showEventDialog(event) })
            cardContent.addView(top)
            val meta = listOfNotNull(event.type.replaceFirstChar { it.uppercase() }, event.location.takeIf(String::isNotBlank), data.courses.firstOrNull { it.id == event.courseId }?.name, if (event.repeatWeekly) "Repeats weekly" else null).joinToString(" · ")
            if (meta.isNotBlank()) cardContent.addView(WorkspaceUi.text(this, meta, 12f, WorkspaceUi.MUTED).apply { setPadding(0, 5, 0, 0) })
            if (event.description.isNotBlank()) cardContent.addView(WorkspaceUi.text(this, event.description, 13f).apply { setPadding(0, 5, 0, 0) })
            cardContent.addView(WorkspaceUi.subtleButton(this, "Delete event", R.drawable.ic_trash) { deleteEvent(event) })
            classesContainer.addView(WorkspaceUi.card(this, cardContent))
        }
    }

    private fun displayTime(value: String) = runCatching {
        val pattern = if (WorkspaceRepository.load(this).preferences.timeFormat == "24h") "HH:mm" else "h:mm a"
        LocalTime.parse(value).format(DateTimeFormatter.ofPattern(pattern))
    }.getOrDefault(value)

    private fun showEventDialog(existing: WorkspaceEvent?) {
        val data = WorkspaceRepository.load(this)
        var eventDate = runCatching { LocalDate.parse(existing?.date ?: currentDate().toString()) }.getOrDefault(currentDate())
        var startTime = existing?.startTime ?: "09:00"
        var endTime = existing?.endTime ?: "10:00"
        val form = WorkspaceUi.column(this, 4)
        fun input(hint: String, value: String, multi: Boolean = false) = EditText(this).apply { this.hint = hint; setText(value); if (multi) { minLines = 2; maxLines = 4; inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE }; form.addView(this) }
        val title = input("Event title", existing?.title.orEmpty())
        val description = input("Description", existing?.description.orEmpty(), true)
        val location = input("Location", existing?.location.orEmpty())
        val dateButton = WorkspaceUi.subtleButton(this, "Date · $eventDate") {}
        dateButton.setOnClickListener { DatePickerDialog(this, { _, y, m, day -> eventDate = LocalDate.of(y, m + 1, day); dateButton.text = "Date · $eventDate" }, eventDate.year, eventDate.monthValue - 1, eventDate.dayOfMonth).show() }
        form.addView(dateButton)
        val timeRow = WorkspaceUi.row(this)
        val startButton = WorkspaceUi.subtleButton(this, "Start · ${displayTime(startTime)}") {}
        val endButton = WorkspaceUi.subtleButton(this, "End · ${displayTime(endTime)}") {}
        startButton.setOnClickListener { chooseTime(startTime) { startTime = it; startButton.text = "Start · ${displayTime(it)}" } }
        endButton.setOnClickListener { chooseTime(endTime) { endTime = it; endButton.text = "End · ${displayTime(it)}" } }
        timeRow.addView(startButton, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)); timeRow.addView(endButton, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)); form.addView(timeRow)
        form.addView(WorkspaceUi.text(this, "Event type", 13f, WorkspaceUi.MUTED)); val types = listOf("class", "study", "personal", "other"); val type = WorkspaceUi.spinner(this, types, types.indexOf(existing?.type).coerceAtLeast(0)); form.addView(type)
        form.addView(WorkspaceUi.text(this, "Event color", 13f, WorkspaceUi.MUTED)); val colors = listOf("navy", "lime", "blue", "amber"); val color = WorkspaceUi.spinner(this, colors, colors.indexOf(existing?.color).coerceAtLeast(0)); form.addView(color)
        form.addView(WorkspaceUi.text(this, "Course", 13f, WorkspaceUi.MUTED)); val courseOptions = listOf("No course") + data.courses.map { it.name }; val course = WorkspaceUi.spinner(this, courseOptions, (data.courses.indexOfFirst { it.id == existing?.courseId } + 1).coerceAtLeast(0)); form.addView(course)
        val repeat = CheckBox(this).apply { text = "Repeat weekly"; isChecked = existing?.repeatWeekly ?: false }; form.addView(repeat)
        val scroll = android.widget.ScrollView(this).apply { addView(form) }
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add schedule event" else "Edit schedule event").setView(scroll).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val clean = title.text.toString().trim(); val start = runCatching { LocalTime.parse(startTime) }.getOrNull(); val end = runCatching { LocalTime.parse(endTime) }.getOrNull()
            if (clean.isBlank()) { title.error = "Add a title"; return@setOnClickListener }
            if (start == null || end == null || end <= start) { Toast.makeText(this, "Choose a valid time range", Toast.LENGTH_SHORT).show(); return@setOnClickListener }
            val event = (existing ?: WorkspaceEvent(UUID.randomUUID().toString(), "", date = eventDate.toString(), startTime = startTime, endTime = endTime, createdAt = Instant.now().toString())).copy(
                title = clean, description = description.text.toString().trim(), date = eventDate.toString(), repeatWeekly = repeat.isChecked,
                startTime = startTime, endTime = endTime, type = types[type.selectedItemPosition], courseId = data.courses.getOrNull(course.selectedItemPosition - 1)?.id,
                location = location.text.toString().trim(), color = colors[color.selectedItemPosition],
            )
            val overlap = data.events.any { other -> other.id != event.id && occurs(other, eventDate) && other.startTime < event.endTime && event.startTime < other.endTime }
            val commit = { WorkspaceRepository.update(this) { current -> if (existing == null) current.copy(events = current.events + event) else current.copy(events = current.events.map { if (it.id == event.id) event else it }) }; dialog.dismiss(); updateSchedule() }
            if (overlap) AlertDialog.Builder(this).setTitle("Schedule conflict").setMessage("This event overlaps another event. Save it anyway?").setNegativeButton("Review", null).setPositiveButton("Save event") { _, _ -> commit() }.show() else commit()
        } }
        dialog.show()
    }

    private fun chooseTime(current: String, onPicked: (String) -> Unit) {
        val parsed = runCatching { LocalTime.parse(current) }.getOrDefault(LocalTime.of(9, 0))
        TimePickerDialog(this, { _, hour, minute -> onPicked(String.format(java.util.Locale.US, "%02d:%02d", hour, minute)) }, parsed.hour, parsed.minute, true).show()
    }

    private fun deleteEvent(event: WorkspaceEvent) {
        AlertDialog.Builder(this).setTitle("Delete event?").setMessage("${event.title} will be removed from your schedule.").setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
            WorkspaceRepository.update(this) { data -> data.copy(events = data.events.filterNot { it.id == event.id }) }; updateSchedule()
        }.show()
    }
}
