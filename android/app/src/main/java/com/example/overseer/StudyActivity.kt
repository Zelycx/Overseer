package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
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
import java.time.Instant
import java.util.UUID

class StudyActivity : AppCompatActivity() {
    private lateinit var addedSubjectsContainer: LinearLayout
    private lateinit var studyToolsContainer: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_study)
        WorkspaceRepository.load(this)
        addedSubjectsContainer = findViewById(R.id.addedSubjectsContainer)
        studyToolsContainer = findViewById(R.id.studyToolsContainer)
        findViewById<com.google.android.material.button.MaterialButton>(R.id.addSubjectButton).setOnClickListener { editCourse(null) }
        val nav = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        nav.selectedItemId = R.id.nav_study
        nav.setOnItemSelectedListener { item ->
            val target = when (item.itemId) {
                R.id.nav_home -> MainActivity::class.java; R.id.nav_schedule -> ScheduleActivity::class.java
                R.id.nav_focus -> FocusActivity::class.java; R.id.nav_profile -> ProfileActivity::class.java
                else -> null
            }
            if (target == null) true else { startActivity(Intent(this, target)); finish(); true }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()); v.setPadding(bars.left, bars.top, bars.right, 0); nav.setPadding(0, 0, 0, bars.bottom); insets
        }
        renderStudyTools()
        renderCourses()
    }
    override fun onResume() { super.onResume(); if (::addedSubjectsContainer.isInitialized) renderCourses() }

    private fun renderCourses() {
        addedSubjectsContainer.removeAllViews()
        val data = WorkspaceRepository.load(this)
        if (data.courses.isEmpty()) addedSubjectsContainer.addView(WorkspaceUi.text(this, "Add a course to organize lessons, notes, and study materials.", 14f, WorkspaceUi.MUTED))
        data.courses.forEach { course ->
            val lessons = data.lessons.filter { it.courseId == course.id }
            val completed = lessons.count { it.completed }
            val materials = data.materials.count { it.courseId == course.id }
            val content = WorkspaceUi.column(this)
            val top = WorkspaceUi.row(this)
            val titleColumn = WorkspaceUi.column(this, 0)
            titleColumn.addView(WorkspaceUi.text(this, course.name, 17f, WorkspaceUi.NAVY, true))
            val subtitle = listOfNotNull(course.code.takeIf(String::isNotBlank), course.instructor.takeIf(String::isNotBlank)).joinToString(" · ")
            if (subtitle.isNotBlank()) titleColumn.addView(WorkspaceUi.text(this, subtitle, 12f, WorkspaceUi.MUTED).apply { setPadding(0, 4, 0, 0) })
            top.addView(titleColumn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            top.addView(WorkspaceUi.subtleButton(this, "Open course", R.drawable.ic_chevron_right) { openCourse(course.id) })
            content.addView(top)
            if (course.description.isNotBlank()) content.addView(WorkspaceUi.text(this, course.description, 13f, WorkspaceUi.MUTED).apply { setPadding(0, 8, 0, 0) })
            content.addView(WorkspaceUi.text(this, "$completed/${lessons.size} lessons complete · $materials materials", 12f, WorkspaceUi.MUTED).apply { setPadding(0, 8, 0, 0) })
            val card = WorkspaceUi.card(this, content).apply { isClickable = true; isFocusable = true; setOnClickListener { openCourse(course.id) } }
            card.setOnLongClickListener { showCourseOptions(course); true }
            addedSubjectsContainer.addView(card)
        }
    }

    private fun renderStudyTools() {
        val tools = listOf(
            "Tasks" to R.drawable.ic_tasks,
            "Day planner" to R.drawable.ic_day_planner,
            "Focus" to R.drawable.ic_focus,
            "Progress" to R.drawable.ic_progress,
            "Study materials" to R.drawable.ic_book_open,
            "Study assistant" to R.drawable.ic_help,
        )
        val destinations = listOf(
            TasksActivity::class.java, PlannerActivity::class.java, FocusActivity::class.java,
            ProgressActivity::class.java, LessonDetailActivity::class.java, AssistantActivity::class.java,
        )
        studyToolsContainer.removeAllViews()
        tools.chunked(2).forEachIndexed { rowIndex, rowTools ->
            val row = WorkspaceUi.row(this).apply { gravity = android.view.Gravity.TOP }
            rowTools.forEachIndexed { columnIndex, (label, icon) ->
                val index = rowIndex * 2 + columnIndex
                val card = WorkspaceUi.toolCard(this, label, icon) {
                    startActivity(Intent(this, destinations[index]))
                }
                val params = LinearLayout.LayoutParams(0, WorkspaceUi.dp(this, 78), 1f).apply {
                    if (columnIndex == 0) marginEnd = WorkspaceUi.dp(this@StudyActivity, 8)
                    if (columnIndex == 1) marginStart = WorkspaceUi.dp(this@StudyActivity, 8)
                    bottomMargin = WorkspaceUi.dp(this@StudyActivity, 2)
                }
                row.addView(card, params)
            }
            studyToolsContainer.addView(row)
        }
    }

    private fun openCourse(id: String) { startActivity(Intent(this, SubjectDetailActivity::class.java).putExtra("course_id", id)) }

    private fun editCourse(existing: WorkspaceCourse?) {
        val form = WorkspaceUi.column(this, 4)
        fun field(hint: String, value: String, multi: Boolean = false) = EditText(this).apply { this.hint = hint; setText(value); if (multi) { minLines = 2; maxLines = 4; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE }; form.addView(this) }
        val name = field("Course name", existing?.name.orEmpty()); val code = field("Course code", existing?.code.orEmpty()); val instructor = field("Instructor", existing?.instructor.orEmpty()); val description = field("Description", existing?.description.orEmpty(), true)
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add course" else "Edit course").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val clean = name.text.toString().trim()
            if (clean.isBlank()) { name.error = "Add a course name"; return@setOnClickListener }
            val stamp = Instant.now().toString(); val course = (existing ?: WorkspaceCourse(UUID.randomUUID().toString(), "", createdAt = stamp)).copy(name = clean, code = code.text.toString().trim(), instructor = instructor.text.toString().trim(), description = description.text.toString().trim())
            WorkspaceRepository.update(this) { data -> if (existing == null) data.copy(courses = data.courses + course) else data.copy(courses = data.courses.map { if (it.id == course.id) course else it }) }
            dialog.dismiss(); renderCourses()
        } }; dialog.show()
    }

    private fun showCourseOptions(course: WorkspaceCourse) {
        AlertDialog.Builder(this).setTitle(course.name).setItems(arrayOf("Edit course", "Delete course")) { _, which ->
            if (which == 0) editCourse(course) else AlertDialog.Builder(this).setTitle("Delete course?").setMessage("This removes the course and its lessons and materials. Tasks, events, and study sessions will remain with no course link.").setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
                WorkspaceRepository.update(this) { d -> d.copy(
                    courses = d.courses.filterNot { it.id == course.id },
                    lessons = d.lessons.filterNot { it.courseId == course.id },
                    materials = d.materials.filterNot { it.courseId == course.id },
                    tasks = d.tasks.map { if (it.courseId == course.id) it.copy(courseId = null) else it },
                    events = d.events.map { if (it.courseId == course.id) it.copy(courseId = null) else it },
                    plannerBlocks = d.plannerBlocks.map { if (it.courseId == course.id) it.copy(courseId = null) else it },
                    focusSessions = d.focusSessions.map { if (it.courseId == course.id) it.copy(courseId = null) else it },
                    focusTimer = if (d.focusTimer.courseId == course.id) d.focusTimer.copy(courseId = null) else d.focusTimer,
                ) }
                Toast.makeText(this, "Course deleted", Toast.LENGTH_SHORT).show(); renderCourses()
            }.show()
        }.show()
    }
}
