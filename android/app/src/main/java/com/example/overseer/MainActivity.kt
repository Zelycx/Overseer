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
import android.widget.ProgressBar
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
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.DeletionStatus
import com.example.overseer.data.firestore.Priority
import com.example.overseer.data.firestore.Task

class MainActivity : AppCompatActivity() {
    private var taskListener: ListenerRegistration? = null
    private var tasks = emptyList<Task>()

    private val observedAuthListener = FirebaseAuth.AuthStateListener { auth ->
        val uid = auth.currentUser?.uid
        if (uid == null) openAuth()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            FirebaseApp.initializeApp(this)
        } catch (_: Exception) {
            openAuth("Firebase is not configured. Place google-services.json in android/app.")
            return
        }
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) {
            openAuth()
            return
        }
        auth.addAuthStateListener(observedAuthListener)
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

                R.id.nav_schedule -> {
                    startActivity(Intent(this, ScheduleActivity::class.java))
                    true
                }

                R.id.nav_study -> {
                    startActivity(Intent(this, CoursesActivity::class.java))
                    true
                }

                R.id.nav_profile -> {
                    startActivity(Intent(this, SettingsActivity::class.java))
                    true
                }

                R.id.nav_focus -> {
                    startActivity(Intent(this, FocusActivity::class.java))
                    true
                }

                else -> false
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, 0)
            nav.setPadding(0, 0, 0, bars.bottom)
            insets
        }

        // Get the progress card components
        val progressCount = findViewById<TextView>(R.id.progressCount)
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val progressPercentage = findViewById<TextView>(R.id.progressPercentage)

        // Get the task container
        val tasksContainer = findViewById<LinearLayout>(R.id.tasksContainer)

        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())
        taskListener = repository.observeCollection(
            "tasks",
            decoder = { id, data -> CanonicalCodecs.decodeTask(id, data) },
            onValue = { rows ->
                @Suppress("UNCHECKED_CAST")
                tasks = rows as List<Task>
                val completedTasks = tasks.count { it.completed }
                val totalTasks = tasks.size
                val percentage = if (totalTasks == 0) 0 else (completedTasks * 100f / totalTasks).roundToInt()
                progressCount.text = "$completedTasks of $totalTasks tasks completed"
                progressBar.progress = percentage
                progressPercentage.text = "$percentage% complete"

                tasksContainer.removeAllViews()
                if (tasks.isEmpty()) {
                    val emptyView = TextView(this@MainActivity).apply {
                        text = "No tasks yet"
                        setTextColor(getColor(R.color.overseer_muted))
                    }
                    tasksContainer.addView(emptyView)
                } else {
                    tasks.take(3).forEach { task ->
                        val checkbox = CheckBox(this@MainActivity).apply {
                            text = task.title
                            isChecked = task.completed
                            setTextColor(getColor(R.color.overseer_navy))
                            setOnCheckedChangeListener { _, isChecked ->
                                val updated = task.copy(
                                    completed = isChecked,
                                    completedAt = if (isChecked) com.google.firebase.Timestamp.now() else null,
                                )
                                repository.setDocument(
                                    "tasks",
                                    task.id,
                                    CanonicalCodecs.encodeTaskUpdate(updated),
                                    merge = true,
                                )
                            }
                        }
                        tasksContainer.addView(checkbox)
                    }
                }
            },
            onError = { cause ->
                progressCount.text = "Unable to load tasks"
                progressPercentage.text = cause.localizedMessage ?: "Check your connection"
            },
        )
    }

    private fun addQuickTask() {
        val input = EditText(this).apply {
            hint = "Task title"
        }
        AlertDialog.Builder(this)
            .setTitle("Add Task")
            .setView(input)
            .setPositiveButton("Add") { _, _ ->
                val title = input.text.toString().trim()
                if (title.isNotBlank()) {
                    val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())
                    val now = com.google.firebase.Timestamp.now()
                    val newTask = Task(
                        id = "task-" + UUID.randomUUID().toString(),
                        createdAt = now,
                        updatedAt = now,
                        title = title,
                        description = "",
                        dueAt = null,
                        dueDate = null,
                        timeZoneId = null,
                        priority = Priority.MEDIUM,
                        courseId = null,
                        completed = false,
                        completedAt = null,
                        sortOrder = 0.0,
                        deletionStatus = DeletionStatus.ACTIVE,
                        deletionJobId = null,
                        deletionStartedAt = null,
                    )
                    repository.setDocument(
                        "tasks",
                        newTask.id,
                        CanonicalCodecs.encodeTaskCreate(newTask),
                        merge = false,
                    )
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun updateUpNext() {
        // Refreshes workspace schedule state if active
    }

    override fun onDestroy() {
        taskListener?.remove()
        taskListener = null
        try { FirebaseAuth.getInstance().removeAuthStateListener(observedAuthListener) } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun openAuth(message: String? = null) {
        val intent = Intent(this, AuthActivity::class.java)
        if (message != null) intent.putExtra("firebase_setup_error", message)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onResume() {
        super.onResume()
        updateUpNext()
    }
}
