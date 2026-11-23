package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import java.time.Instant
import java.util.UUID

class SubjectDetailActivity : AppCompatActivity() {
    private var courseId: String? = null
    private lateinit var lessonsContainer: LinearLayout
    private lateinit var materialsContainer: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_subject_detail)
        courseId = intent.getStringExtra("course_id")
        if (courseId == null) {
            val oldName = intent.getStringExtra("subject_name")
            courseId = WorkspaceRepository.load(this).courses.firstOrNull { it.name.equals(oldName, true) }?.id
        }
        if (courseId == null) { finish(); return }
        lessonsContainer = findViewById(R.id.lessonsContainer)
        materialsContainer = findViewById(R.id.materialsContainer)
        findViewById<MaterialButton>(R.id.addLessonButton).setOnClickListener { openLessonEditor(null) }
        findViewById<MaterialButton>(R.id.addMaterialButton).setOnClickListener { startActivity(Intent(this, LessonDetailActivity::class.java).putExtra("course_id", courseId)) }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()); v.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        render()
    }
    override fun onResume() { super.onResume(); if (::lessonsContainer.isInitialized) render() }

    private fun render() {
        val data = WorkspaceRepository.load(this)
        val course = data.courses.firstOrNull { it.id == courseId } ?: return finish()
        findViewById<TextView>(R.id.detailSubjectTitle).text = course.name
        findViewById<TextView>(R.id.detailSubjectSubtitle).text = listOfNotNull(course.code.takeIf(String::isNotBlank), course.instructor.takeIf(String::isNotBlank), course.description.takeIf(String::isNotBlank)).joinToString(" · ").ifBlank { "Your course lessons and materials." }
        lessonsContainer.removeAllViews()
        val lessons = data.lessons.filter { it.courseId == course.id }
        if (lessons.isEmpty()) lessonsContainer.addView(WorkspaceUi.text(this, "No lessons yet. Add one to start tracking course progress.", 13f, WorkspaceUi.MUTED))
        lessons.forEach { lesson ->
            val content = WorkspaceUi.row(this)
            val status = ImageView(this).apply {
                setImageResource(if (lesson.completed) R.drawable.ic_check else R.drawable.ic_circle)
                imageTintList = android.content.res.ColorStateList.valueOf(if (lesson.completed) WorkspaceUi.NAVY else WorkspaceUi.MUTED)
                contentDescription = if (lesson.completed) "Completed" else "In progress"
            }
            content.addView(status, LinearLayout.LayoutParams(WorkspaceUi.dp(this, 22), WorkspaceUi.dp(this, 22)).apply { marginEnd = WorkspaceUi.dp(this@SubjectDetailActivity, 12) })
            val labels = WorkspaceUi.column(this, 0)
            labels.addView(WorkspaceUi.text(this, lesson.title, 15f, WorkspaceUi.NAVY, true))
            if (lesson.description.isNotBlank()) labels.addView(WorkspaceUi.text(this, lesson.description, 12f, WorkspaceUi.MUTED).apply { setPadding(0, 3, 0, 0) })
            content.addView(labels, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            content.addView(WorkspaceUi.subtleButton(this, "Open lesson", R.drawable.ic_chevron_right) { openLesson(lesson) })
            val card = WorkspaceUi.card(this, content).apply { setOnClickListener { openLesson(lesson) } }
            card.setOnLongClickListener { androidx.appcompat.app.AlertDialog.Builder(this).setTitle(lesson.title).setItems(arrayOf("Edit lesson", "Delete lesson")) { _, which -> if (which == 0) openLessonEditor(lesson) else deleteLesson(lesson) }.show(); true }
            lessonsContainer.addView(card)
        }
        materialsContainer.removeAllViews()
        val materials = data.materials.filter { it.courseId == course.id }
        if (materials.isEmpty()) materialsContainer.addView(WorkspaceUi.text(this, "No course materials yet. Add or import notes from the course view.", 13f, WorkspaceUi.MUTED))
        materials.forEach { material ->
            val card = WorkspaceUi.card(this, WorkspaceUi.text(this, material.title, 15f, WorkspaceUi.NAVY, true).apply { setPadding(WorkspaceUi.dp(this@SubjectDetailActivity, 16), WorkspaceUi.dp(this@SubjectDetailActivity, 16), WorkspaceUi.dp(this@SubjectDetailActivity, 16), WorkspaceUi.dp(this@SubjectDetailActivity, 16)) })
            card.setOnClickListener { startActivity(Intent(this, LessonDetailActivity::class.java).putExtra("course_id", course.id)) }
            materialsContainer.addView(card)
        }
    }

    private fun openLesson(lesson: WorkspaceLesson) { startActivity(Intent(this, LessonDetailActivity::class.java).putExtra("lesson_id", lesson.id).putExtra("course_id", lesson.courseId)) }

    private fun openLessonEditor(existing: WorkspaceLesson?) {
        val form = WorkspaceUi.column(this, 4)
        fun field(hint: String, value: String, multi: Boolean = false) = WorkspaceUi.editText(this).apply { this.hint = hint; setText(value); if (multi) { minLines = 2; maxLines = 5; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE }; form.addView(this) }
        val title = field("Lesson title", existing?.title.orEmpty()); val description = field("Description", existing?.description.orEmpty()); val content = field("Lesson content", existing?.content.orEmpty(), true)
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add lesson" else "Edit lesson").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (title.text.isBlank()) { title.error = "Add a lesson title"; return@setOnClickListener }
            val stamp = Instant.now().toString(); val lesson = (existing ?: WorkspaceLesson(UUID.randomUUID().toString(), courseId!!, "", updatedAt = stamp)).copy(title = title.text.toString().trim(), description = description.text.toString().trim(), content = content.text.toString().trim(), updatedAt = stamp)
            WorkspaceRepository.update(this) { data -> if (existing == null) data.copy(lessons = data.lessons + lesson) else data.copy(lessons = data.lessons.map { if (it.id == lesson.id) lesson else it }) }
            dialog.dismiss(); render()
        } }; dialog.show()
    }

    private fun deleteLesson(lesson: WorkspaceLesson) {
        AlertDialog.Builder(this).setTitle("Delete lesson?").setMessage("${lesson.title} will be removed from this course.").setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
            WorkspaceRepository.update(this) { d -> d.copy(lessons = d.lessons.filterNot { it.id == lesson.id }) }; render()
        }.show()
    }
}
