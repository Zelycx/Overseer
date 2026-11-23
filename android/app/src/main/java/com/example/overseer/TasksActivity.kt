package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.functions.FirebaseFunctions
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.Priority
import com.example.overseer.data.firestore.Task
import java.util.UUID

class TasksActivity : AppCompatActivity() {
    private var listener: ListenerRegistration? = null
    private var tasks = emptyList<Task>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) {
            openAuth()
            return
        }
        setContentView(R.layout.activity_tasks)

        val list = findViewById<LinearLayout>(R.id.taskList)
        val status = findViewById<TextView>(R.id.taskStatus)
        val newTask = findViewById<MaterialButton>(R.id.newTaskButton)
        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())

        listener = repository.observeCollection(
            "tasks",
            decoder = { id, data -> CanonicalCodecs.decodeTask(id, data) },
            onValue = { rows ->
                @Suppress("UNCHECKED_CAST")
                tasks = rows as List<Task>
                renderTasks(list, status, repository)
            },
            onError = { cause ->
                status.text = cause.localizedMessage ?: "Unable to load tasks"
            },
        )

        newTask.setOnClickListener { showCreateDialog(repository) }

        val bottom = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        bottom.selectedItemId = R.id.nav_study
        bottom.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> { startActivity(Intent(this, MainActivity::class.java)); finish(); true }
                R.id.nav_schedule -> { startActivity(Intent(this, ScheduleActivity::class.java)); finish(); true }
                R.id.nav_profile -> { auth.signOut(); openAuth(); true }
                else -> true
            }
        }
    }

    private fun renderTasks(list: LinearLayout, status: TextView, repository: AuthenticatedFirestoreRepository) {
        list.removeAllViews()
        status.text = "${tasks.count { !it.completed }} pending · ${tasks.count { it.completed }} completed"
        if (tasks.isEmpty()) {
            val empty = TextView(this)
            empty.text = "No tasks yet. Create your first task."
            list.addView(empty)
            return
        }
        tasks.sortedWith(compareBy<Task> { it.completed }.thenBy { it.dueDate ?: "9999" }.thenBy { it.priority.wireValue })
            .forEach { task ->
                val row = LinearLayout(this)
                row.orientation = LinearLayout.HORIZONTAL
                row.setPadding(24, 16, 24, 16)
                val check = CheckBox(this)
                check.isChecked = task.completed
                check.setOnCheckedChangeListener { _, checked ->
                    val updated = task.copy(completed = checked, completedAt = if (checked) Timestamp.now() else null)
                    repository.updateTask(updated)
                }
                val title = TextView(this)
                title.text = task.title
                title.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                val delete = MaterialButton(this)
                delete.text = "Delete"
                delete.setOnClickListener { confirmTrustedDelete(task) }
                row.addView(check)
                row.addView(title)
                row.addView(delete)
                list.addView(row)
            }
    }

    private fun showCreateDialog(repository: AuthenticatedFirestoreRepository) {
        val input = EditText(this)
        input.hint = "Task title"
        AlertDialog.Builder(this)
            .setTitle("Create task")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val title = input.text.toString().trim()
                if (title.isEmpty()) return@setPositiveButton
                repository.createTask(
                    id = "task-" + UUID.randomUUID(),
                    title = title,
                    description = "",
                    dueDate = null,
                    dueAt = null,
                    timeZoneId = null,
                    priority = Priority.MEDIUM,
                    courseId = null,
                )
            }.show()
    }

    private fun confirmTrustedDelete(task: Task) {
        AlertDialog.Builder(this)
            .setTitle("Delete task")
            .setMessage("Delete \"${task.title}\" using the trusted deletion system?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                FirebaseFunctions.getInstance("us-central1")
                    .getHttpsCallable("requestTaskDeletion")
                    .call(mapOf("taskId" to task.id))
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
