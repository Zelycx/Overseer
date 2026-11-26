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
        val googleResults = findViewById<TextView>(R.id.googleClassroomResults)
        val googleButton = findViewById<MaterialButton>(R.id.refreshGoogleClassroom)
        var googleCursor: String? = null
        var restartClassroomFromBeginning = false
        val googleCourses = linkedMapOf<String, MutableMap<String, Any?>>()
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
        findViewById<MaterialButton>(R.id.manageGoogleClassroom).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        googleButton.setOnClickListener {
            googleResults.text = "Loading Google Classroom courses…"
            val cursorForRequest = if (restartClassroomFromBeginning) null else googleCursor
            val suffix = cursorForRequest?.let { "/courses?cursor=${java.net.URLEncoder.encode(it, "UTF-8")}" } ?: "/courses"
            GoogleWorkerClient.async(this, "GET", GoogleWorkerClient.path("classroom", suffix)) { result, error ->
                    val workerError = error as? GoogleWorkerClient.GoogleWorkerException
                    val page = result ?: workerError?.payload?.takeIf { it.containsKey("courses") }
                    if (page == null) {
                        if (workerError?.code == "INVALID_PAGE_CURSOR") {
                            googleCursor = null
                            restartClassroomFromBeginning = true
                            googleButton.text = "Refresh from beginning"
                            googleResults.text = "This continuation expired or is invalid. Loaded courses are preserved; refresh to restart."
                            return@async
                        }
                        googleResults.text = when {
                            workerError?.status == 401 -> "Overseer sign-in expired. Sign in again to load Google Classroom."
                            workerError != null && GoogleWorkerClient.cursorRecovery(workerError) == GoogleWorkerClient.CursorRecovery.RESTART_FROM_BEGINNING -> {
                                googleCursor = null
                                restartClassroomFromBeginning = true
                                googleButton.text = "Refresh from beginning"
                                "${workerError.message} Loaded courses are preserved; refresh from the beginning after reconnecting."
                            }
                            workerError != null -> workerError.message
                            else -> "Google Classroom is unavailable because of a network error. Retry when connected."
                        }
                        return@async
                    }
                    val records = page["courses"] as? List<*> ?: emptyList<Any>()
                    records.forEach { raw ->
                        val record = raw as? Map<*, *> ?: return@forEach
                        val course = record["course"] as? Map<*, *> ?: return@forEach
                        val id = course["id"] as? String ?: return@forEach
                        val previous = googleCourses[id]
                        fun mergeRows(key: String): List<Any?> {
                            val rows = ((previous?.get(key) as? List<*>)?.toList() ?: emptyList()) + ((record[key] as? List<*>)?.toList() ?: emptyList())
                            return rows.distinctBy { (it as? Map<*, *>)?.get("id") ?: it.toString() }
                        }
                        googleCourses[id] = mutableMapOf("course" to course, "courseWork" to mergeRows("courseWork"), "announcements" to mergeRows("announcements"))
                    }
                    val pagination = page["pagination"] as? Map<*, *>
                    val pageError = page["error"] as? Map<*, *>
                    val errorCode = (pageError?.get("code") as? String) ?: workerError?.code
                    val errorMessage = (pageError?.get("message") as? String) ?: workerError?.message
                    googleCursor = pagination?.get("nextCursor") as? String
                    if (errorCode == "INVALID_PAGE_CURSOR") {
                        googleCursor = null
                        restartClassroomFromBeginning = true
                        googleButton.text = "Refresh from beginning"
                    } else if (pageError?.get("retryable") == false && googleCursor != null) {
                        restartClassroomFromBeginning = false
                        googleButton.text = "Continue past failed page"
                    } else if (pageError?.get("retryable") == false || (workerError != null && GoogleWorkerClient.cursorRecovery(workerError) == GoogleWorkerClient.CursorRecovery.RESTART_FROM_BEGINNING)) {
                        googleCursor = null
                        restartClassroomFromBeginning = true
                        googleButton.text = "Refresh from beginning"
                    } else {
                        restartClassroomFromBeginning = false
                        googleButton.text = if (googleCursor == null) "Refresh" else "Load more"
                    }
                    val lines = googleCourses.values.mapNotNull { raw ->
                        val record = raw as? Map<*, *> ?: return@mapNotNull null
                        val course = record["course"] as? Map<*, *> ?: return@mapNotNull null
                        val name = course["name"] as? String ?: "Google Classroom course"
                        val work = (record["courseWork"] as? List<*>)?.mapNotNull { (it as? Map<*, *>)?.get("title") as? String } ?: emptyList()
                        val announcements = (record["announcements"] as? List<*>)?.mapNotNull { (it as? Map<*, *>)?.get("text") as? String } ?: emptyList()
                        val workSummary = if (work.isEmpty()) "No coursework" else "Coursework: ${work.take(3).joinToString(", ")}"
                        val announcementsSummary = if (announcements.isEmpty()) "No announcements" else "Announcements: ${announcements.take(3).joinToString(" · ")}"
                        "Google Classroom · $name\n$workSummary\n$announcementsSummary"
                    }
                    val listing = if (lines.isEmpty()) "No Google Classroom records have loaded yet." else lines.take(50).joinToString("\n\n")
                    googleResults.text = when {
                        errorCode == "INVALID_PAGE_CURSOR" -> "$listing\n\nThis continuation expired or is invalid. Loaded records are preserved; refresh to restart."
                        errorMessage != null && pageError?.get("retryable") == true -> "$listing\n\n$errorMessage"
                        errorMessage != null -> "$listing\n\n$errorMessage Refresh from the beginning after reconnecting or correcting the request."
                        googleCursor != null -> "$listing\n\nMore courses or classwork are available. Tap Load more."
                        lines.isEmpty() -> "No active Google Classroom courses found."
                        else -> listing
                    }
                }
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
