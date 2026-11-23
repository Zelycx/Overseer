package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.Course
import com.example.overseer.data.firestore.CourseTint
import com.example.overseer.data.firestore.DeletionStatus
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.functions.FirebaseFunctions
import java.util.UUID

class CoursesActivity : AppCompatActivity() {
    private var listener: ListenerRegistration? = null
    private var courses = emptyList<Course>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) {
            openAuth()
            return
        }
        setContentView(R.layout.activity_courses)

        val list = findViewById<LinearLayout>(R.id.courseList)
        val status = findViewById<TextView>(R.id.courseStatus)
        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())

        listener = repository.observeCollection(
            "courses",
            decoder = { id, data -> CanonicalCodecs.decodeCourse(id, data) },
            onValue = { rows ->
                @Suppress("UNCHECKED_CAST")
                courses = rows as List<Course>
                renderCourses(list, status, repository)
            },
            onError = { status.text = it.localizedMessage ?: "Unable to load courses" },
        )

        findViewById<MaterialButton>(R.id.newCourseButton).setOnClickListener {
            showCourseDialog(repository, null)
        }

        val bottom = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        bottom.selectedItemId = R.id.nav_study
        bottom.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> { startActivity(Intent(this, MainActivity::class.java)); finish(); true }
                R.id.nav_schedule -> { startActivity(Intent(this, ScheduleActivity::class.java)); finish(); true }
                R.id.nav_study -> true
                R.id.nav_profile -> { auth.signOut(); openAuth(); true }
                else -> false
            }
        }
    }

    private fun renderCourses(list: LinearLayout, status: TextView, repository: AuthenticatedFirestoreRepository) {
        list.removeAllViews()
        status.text = "${courses.size} ${if (courses.size == 1) "course" else "courses"}"
        if (courses.isEmpty()) {
            val empty = TextView(this)
            empty.text = "No courses yet. Create one to organize lessons and tasks."
            list.addView(empty)
        }
        courses.forEach { course ->
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            row.setPadding(24, 16, 24, 16)
            val title = TextView(this)
            title.text = "${course.name}${if (course.code.isBlank()) "" else " · ${course.code}"}"
            title.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            val edit = MaterialButton(this)
            edit.text = "Edit"
            edit.setOnClickListener { showCourseDialog(repository, course) }
            val delete = MaterialButton(this)
            delete.text = "Delete"
            delete.setOnClickListener { confirmDelete(course) }
            row.addView(title)
            row.addView(edit)
            row.addView(delete)
            list.addView(row)
        }
    }

    private fun showCourseDialog(repository: AuthenticatedFirestoreRepository, initial: Course?) {
        val container = LinearLayout(this)
        container.orientation = LinearLayout.VERTICAL
        val name = EditText(this)
        name.hint = "Course name"
        name.setText(initial?.name ?: "")
        val code = EditText(this)
        code.hint = "Course code"
        code.setText(initial?.code ?: "")
        val description = EditText(this)
        description.hint = "Description"
        description.setText(initial?.description ?: "")
        val instructor = EditText(this)
        instructor.hint = "Instructor"
        instructor.setText(initial?.instructor ?: "")
        container.addView(name)
        container.addView(code)
        container.addView(description)
        container.addView(instructor)
        AlertDialog.Builder(this)
            .setTitle(if (initial == null) "Create course" else "Edit course")
            .setView(container)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                val nameValue = name.text.toString().trim()
                if (nameValue.isEmpty()) return@setPositiveButton
                val now = Timestamp.now()
                val course = Course(
                    id = initial?.id ?: "course-" + UUID.randomUUID(),
                    createdAt = initial?.createdAt ?: now,
                    updatedAt = now,
                    name = nameValue,
                    code = code.text.toString().trim(),
                    description = description.text.toString().trim(),
                    instructor = instructor.text.toString().trim(),
                    tint = initial?.tint ?: CourseTint.LAVENDER,
                    sortOrder = initial?.sortOrder ?: courses.size.toDouble(),
                    deletionStatus = DeletionStatus.ACTIVE,
                    deletionJobId = null,
                    deletionStartedAt = null,
                )
                if (initial == null) {
                    repository.setDocument("courses", course.id, CanonicalCodecs.encodeCourseCreate(course).plus("createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()).plus("updatedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()), merge = false)
                } else {
                    repository.setDocument("courses", course.id, CanonicalCodecs.encodeCourseUpdate(course).plus("updatedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()), merge = true)
                }
            }.show()
    }

    private fun confirmDelete(course: Course) {
        AlertDialog.Builder(this)
            .setTitle("Delete course")
            .setMessage("Delete \"${course.name}\" using the trusted deletion system?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                FirebaseFunctions.getInstance("us-central1")
                    .getHttpsCallable("requestCourseDeletion")
                    .call(mapOf("courseId" to course.id))
            }.show()
    }

    override fun onDestroy() {
        listener?.remove()
        listener = null
        super.onDestroy()
    }

    private fun openAuth() {
        startActivity(Intent(this, AuthActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })
        finish()
    }
}
