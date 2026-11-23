package com.example.overseer

import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.text.TextWatcher
import android.text.Editable
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.time.Instant
import java.util.UUID

class LessonDetailActivity : AppCompatActivity() {
    private var lessonId: String? = null
    private var courseId: String? = null
    private lateinit var body: LinearLayout
    private lateinit var materialsContainer: LinearLayout
    private var materialQuery = ""
    private val openTextFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? -> uri?.let(::importMaterial) }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lessonId = intent.getStringExtra("lesson_id")
        courseId = intent.getStringExtra("course_id")
        body = WorkspaceUi.screen(this, if (lessonId == null && courseId == null) "Study materials" else "Lesson", "Read lessons, manage notes, and import study materials.")
        render()
    }
    private fun render() {
        body.removeAllViews(); val d = WorkspaceRepository.load(this); val lesson = d.lessons.firstOrNull { it.id == lessonId }
        val course = d.courses.firstOrNull { it.id == (lesson?.courseId ?: courseId) }
        body.addView(WorkspaceUi.text(this, course?.name ?: "Course", 13f, WorkspaceUi.MUTED))
        if (lesson != null) {
            body.addView(WorkspaceUi.text(this, lesson.title, 22f, WorkspaceUi.NAVY, true).apply { setPadding(0, 8, 0, 8) })
            if (lesson.description.isNotBlank()) body.addView(WorkspaceUi.text(this, lesson.description, 14f, WorkspaceUi.MUTED))
            body.addView(WorkspaceUi.card(this, WorkspaceUi.text(this, lesson.content.ifBlank { "No lesson content yet." }, 15f).apply { setPadding(WorkspaceUi.dp(this@LessonDetailActivity, 18), WorkspaceUi.dp(this@LessonDetailActivity, 18), WorkspaceUi.dp(this@LessonDetailActivity, 18), WorkspaceUi.dp(this@LessonDetailActivity, 18)) }))
            body.addView(WorkspaceUi.button(this, if (lesson.completed) "Mark as in progress" else "Mark lesson complete", if (lesson.completed) R.drawable.ic_circle else R.drawable.ic_check) { WorkspaceRepository.update(this) { current -> current.copy(lessons = current.lessons.map { if (it.id == lesson.id) it.copy(completed = !lesson.completed, updatedAt = Instant.now().toString()) else it }) }; render() })
            body.addView(WorkspaceUi.subtleButton(this, "Edit lesson", R.drawable.ic_pencil) { editLesson(lesson) })
        } else if (course != null) {
            body.addView(WorkspaceUi.text(this, "Add a lesson to this course to keep notes and completion in one place.", 14f, WorkspaceUi.MUTED))
            body.addView(WorkspaceUi.button(this, "Add lesson", R.drawable.ic_plus) { editLesson(null) })
        } else {
            body.addView(WorkspaceUi.text(this, "Search, add, and import notes across your courses.", 14f, WorkspaceUi.MUTED))
        }
        body.addView(WorkspaceUi.section(this, if (course == null) "Study materials" else "Course materials"))
        body.addView(WorkspaceUi.row(this).apply {
            addView(WorkspaceUi.button(this@LessonDetailActivity, "Add material", R.drawable.ic_plus) { editMaterial(null) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(WorkspaceUi.subtleButton(this@LessonDetailActivity, "Import file", R.drawable.ic_file_up) { openTextFile.launch(arrayOf("text/plain", "text/markdown", "text/html", "application/xhtml+xml")) })
        })
        val search = WorkspaceUi.editText(this).apply { hint = "Search course materials"; setText(materialQuery) }
        body.addView(search)
        materialsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        body.addView(materialsContainer)
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { materialQuery = s?.toString().orEmpty(); renderMaterials(course?.id) }
            override fun afterTextChanged(s: Editable?) = Unit
        })
        renderMaterials(course?.id)
    }

    private fun renderMaterials(forCourse: String?) {
        if (!::materialsContainer.isInitialized) return
        materialsContainer.removeAllViews()
        val query = materialQuery.trim()
        val rows = WorkspaceRepository.load(this).materials.filter { forCourse == null || it.courseId == forCourse }
            .filter { query.isBlank() || listOf(it.title, it.fileName, it.content).any { value -> value.contains(query, ignoreCase = true) } }
        if (rows.isEmpty()) {
            val allEmpty = WorkspaceRepository.load(this).materials.none { forCourse == null || it.courseId == forCourse }
            materialsContainer.addView(WorkspaceUi.text(this, if (allEmpty) "No course materials yet. Add or import notes." else "No materials match this search.", 13f, WorkspaceUi.MUTED).apply { setPadding(0, 8, 0, 12) })
        }
        rows.forEach { material ->
            val card = WorkspaceUi.column(this, 14)
            card.addView(WorkspaceUi.text(this, material.title, 15f, WorkspaceUi.NAVY, true))
            val preview = material.content.take(900).ifBlank { material.fileName.ifBlank { "No extracted text" } }
            card.addView(WorkspaceUi.text(this, preview, 13f, WorkspaceUi.MUTED))
            card.addView(WorkspaceUi.subtleButton(this, "Edit material", R.drawable.ic_pencil) { editMaterial(material) })
            card.addView(WorkspaceUi.subtleButton(this, "Delete material", R.drawable.ic_trash) { AlertDialog.Builder(this).setTitle("Delete material?").setMessage("This will remove ${material.title}.").setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ -> WorkspaceRepository.update(this) { current -> current.copy(materials = current.materials.filterNot { it.id == material.id }) }; render() }.show() })
            materialsContainer.addView(WorkspaceUi.card(this, card))
        }
    }
    private fun editLesson(existing: WorkspaceLesson?) {
        val form = WorkspaceUi.column(this, 4)
        fun input(hint: String, value: String, multi: Boolean = false) = WorkspaceUi.editText(this).apply { this.hint = hint; setText(value); inputType = if (multi) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE else InputType.TYPE_CLASS_TEXT; if (multi) { minLines = 3; maxLines = 7 }; form.addView(this) }
        val title = input("Lesson title", existing?.title.orEmpty()); val description = input("Description", existing?.description.orEmpty()); val content = input("Lesson content", existing?.content.orEmpty(), true)
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add lesson" else "Edit lesson").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (title.text.isBlank()) { title.error = "Add a title"; return@setOnClickListener }
            val parentId = existing?.courseId ?: courseId ?: WorkspaceRepository.load(this).courses.firstOrNull()?.id
            if (parentId == null) { Toast.makeText(this, "Add a course first", Toast.LENGTH_SHORT).show(); return@setOnClickListener }
            val lesson = (existing ?: WorkspaceLesson(UUID.randomUUID().toString(), parentId, "", updatedAt = Instant.now().toString())).copy(title = title.text.toString().trim(), description = description.text.toString().trim(), content = content.text.toString().trim(), updatedAt = Instant.now().toString())
            WorkspaceRepository.update(this) { d -> if (existing == null) d.copy(lessons = d.lessons + lesson) else d.copy(lessons = d.lessons.map { if (it.id == lesson.id) lesson else it }) }
            lessonId = lesson.id; courseId = lesson.courseId; dialog.dismiss(); render()
        } }; dialog.show()
    }
    private fun editMaterial(existing: WorkspaceMaterial?) {
        val form = WorkspaceUi.column(this, 4); val title = WorkspaceUi.editText(this).apply { hint = "Material title"; setText(existing?.title.orEmpty()); form.addView(this) }
        val text = WorkspaceUi.editText(this).apply { hint = "Paste notes or extracted text"; setText(existing?.content.orEmpty()); minLines = 5; maxLines = 12; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE; form.addView(this) }
        val data = WorkspaceRepository.load(this); val courses = listOf("No course") + data.courses.map { it.name }; val course = WorkspaceUi.spinner(this, courses, (data.courses.indexOfFirst { it.id == existing?.courseId } + 1).coerceAtLeast(0)); form.addView(course)
        val dialog = AlertDialog.Builder(this).setTitle(if (existing == null) "Add material" else "Edit material").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (title.text.isBlank()) { title.error = "Add a title"; return@setOnClickListener }
            val stamp = Instant.now().toString(); val item = (existing ?: WorkspaceMaterial(UUID.randomUUID().toString(), "", createdAt = stamp, updatedAt = stamp)).copy(title = title.text.toString().trim(), content = text.text.toString(), courseId = data.courses.getOrNull(course.selectedItemPosition - 1)?.id, updatedAt = stamp)
            WorkspaceRepository.update(this) { current -> if (existing == null) current.copy(materials = current.materials + item) else current.copy(materials = current.materials.map { if (it.id == item.id) item else it }) }; dialog.dismiss(); render()
        } }; dialog.show()
    }
    private fun importMaterial(uri: Uri) {
        runCatching { contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: error("Could not read file") }
            .onSuccess { content ->
                val name = contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else "Imported notes" } ?: "Imported notes"
                val extracted = if (name.substringAfterLast('.', "").lowercase() in listOf("html", "htm")) android.text.Html.fromHtml(content, android.text.Html.FROM_HTML_MODE_COMPACT).toString() else content
                val stamp = Instant.now().toString(); val course = courseId ?: WorkspaceRepository.load(this).courses.firstOrNull()?.id
                WorkspaceRepository.update(this) { d -> d.copy(materials = d.materials + WorkspaceMaterial(UUID.randomUUID().toString(), name.substringBeforeLast('.'), course, extracted, name, stamp, stamp)) }
                Toast.makeText(this, "Material imported", Toast.LENGTH_SHORT).show(); render()
            }.onFailure { Toast.makeText(this, it.message ?: "Could not import file", Toast.LENGTH_LONG).show() }
    }
}
