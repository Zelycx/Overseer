package com.example.overseer

import android.os.Bundle
import android.view.View
import android.widget.CheckBox
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import android.content.Intent
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
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

        // Set greeting based on current time
        val currentHour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)

        val greeting = findViewById<TextView>(R.id.greeting)
        val dateText = findViewById<TextView>(R.id.dateText)

        greeting.text = when (currentHour) {
            in 5..11 -> "Good morning!"
            in 12..16 -> "Good afternoon!"
            in 17..20 -> "Good evening!"
            else -> "Good night!"
        }

// Set today's date
        val dateFormat = SimpleDateFormat("EEEE, MMMM d", Locale.US)
        dateText.text = dateFormat.format(Calendar.getInstance().time)

        // Set up bottom navigation
        val bottomNavigation = findViewById<BottomNavigationView>(R.id.bottomNavigation)


        bottomNavigation.selectedItemId = R.id.nav_home

        bottomNavigation.setOnItemSelectedListener { item ->
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

        // Handle phone screen insets
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            v.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                0
            )

            findViewById<View>(R.id.bottomNavigation)
                .setPadding(0, 0, 0, systemBars.bottom)

            insets
        }

        // Get the progress card components
        val progressCount = findViewById<TextView>(R.id.progressCount)
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        val progressPercentage = findViewById<TextView>(R.id.progressPercentage)



        // Get the task container
        val tasksContainer = findViewById<LinearLayout>(R.id.tasksContainer)

        val taskCheckboxes = listOf(taskOne, taskTwo, taskThree)
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
                taskCheckboxes.forEachIndexed { index, checkbox ->
                    val task = tasks.getOrNull(index)
                    if (task == null) {
                        checkbox.visibility = View.GONE
                    } else {
                        checkbox.visibility = View.VISIBLE
                        checkbox.text = task.title
                        checkbox.setOnCheckedChangeListener(null)
                        checkbox.isChecked = task.completed
                        checkbox.setOnCheckedChangeListener { _, isChecked ->
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
                }
            },
            onError = { cause ->
                progressCount.text = "Unable to load tasks"
                progressPercentage.text = cause.localizedMessage ?: "Check your connection"
            },
        )

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
