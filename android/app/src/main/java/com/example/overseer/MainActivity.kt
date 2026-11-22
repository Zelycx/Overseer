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
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import android.widget.EditText
import android.view.Gravity
import android.graphics.Color
import android.graphics.Typeface
import android.view.ViewGroup
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
                    startActivity(Intent(this, StudyActivity::class.java))
                    true
                }

                R.id.nav_focus -> {
                    startActivity(Intent(this, FocusActivity::class.java))
                    true
                }

                R.id.nav_profile -> {
                    startActivity(Intent(this, ProfileActivity::class.java))
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

        // Open local task storage
        val prefs = getSharedPreferences("overseer_tasks", MODE_PRIVATE)

        // Load previously saved tasks
        val tasks = JSONArray(prefs.getString("tasks", "[]"))

        // Migrate the old three-checkbox system
        if (!prefs.getBoolean("legacy_tasks_migrated", false)) {

            if (!prefs.contains("tasks")) {

                val oldTasks = listOf(
                    Pair("Finish programming activity", "task_one"),
                    Pair("Review database notes", "task_two"),
                    Pair("Prepare for tomorrow's quiz", "task_three")
                )

                oldTasks.forEach { (title, oldKey) ->

                    val task = JSONObject()

                    task.put("id", oldKey)
                    task.put("title", title)
                    task.put("completed", prefs.getBoolean(oldKey, false))

                    tasks.put(task)
                }
            }

            prefs.edit()
                .putString("tasks", tasks.toString())
                .putBoolean("legacy_tasks_migrated", true)
                .apply()
        }

        // Convert dp to pixels
        fun dp(value: Int): Int {
            return (value * resources.displayMetrics.density).toInt()
        }

        // Update task progress
        fun updateProgress() {
            val totalTasks = tasks.length()

            var completedTasks = 0

            for (i in 0 until totalTasks) {
                if (tasks.getJSONObject(i).getBoolean("completed")) {
                    completedTasks++
                }
            }

            val percentage = if (totalTasks == 0) {
                0
            } else {
                (completedTasks * 100f / totalTasks).roundToInt()
            }

            progressCount.text = "$completedTasks of $totalTasks tasks completed"
            progressBar.progress = percentage
            progressPercentage.text = "$percentage% complete"
        }

        // Display tasks inside the task card
        fun displayTasks() {

            tasksContainer.removeAllViews()

            if (tasks.length() == 0) {
                val emptyText = TextView(this)

                emptyText.text = "No tasks yet. Add one to get started."
                emptyText.textSize = 14f
                emptyText.setTextColor(Color.parseColor("#777777"))
                emptyText.gravity = Gravity.CENTER
                emptyText.setPadding(0, dp(16), 0, dp(16))

                tasksContainer.addView(emptyText)

            } else {

                for (i in 0 until tasks.length()) {

                    val task = tasks.getJSONObject(i)

                    val checkbox = CheckBox(this)

                    checkbox.text = task.getString("title")
                    checkbox.textSize = 15f
                    checkbox.setTextColor(Color.parseColor("#131D44"))
                    checkbox.minHeight = dp(48)
                    checkbox.setPadding(0, dp(8), 0, dp(8))

                    // Restore saved completion state
                    checkbox.isChecked = task.getBoolean("completed")

                    // Save whenever the checkbox changes
                    checkbox.setOnCheckedChangeListener { _, isChecked ->

                        task.put("completed", isChecked)

                        prefs.edit()
                            .putString("tasks", tasks.toString())
                            .apply()

                        updateProgress()
                    }


                    checkbox.setOnLongClickListener {

                        val options = arrayOf("Edit Task", "Delete Task")

                        AlertDialog.Builder(this)
                            .setTitle(task.getString("title"))
                            .setItems(options) { _, which ->

                                when (which) {

                                    0 -> {
                                        val input = EditText(this)
                                        input.setText(task.getString("title"))
                                        input.setSingleLine(true)

                                        AlertDialog.Builder(this)
                                            .setTitle("Edit Task")
                                            .setView(input)
                                            .setNegativeButton("Cancel", null)
                                            .setPositiveButton("Save") { _, _ ->

                                                val newTitle = input.text.toString().trim()

                                                if (newTitle.isNotEmpty()) {
                                                    task.put("title", newTitle)

                                                    prefs.edit()
                                                        .putString("tasks", tasks.toString())
                                                        .apply()

                                                    displayTasks()
                                                } else {
                                                    Toast.makeText(
                                                        this,
                                                        "Task name cannot be empty",
                                                        Toast.LENGTH_SHORT
                                                    ).show()
                                                }
                                            }
                                            .show()
                                    }

                                    1 -> {
                                        AlertDialog.Builder(this)
                                            .setTitle("Delete Task?")
                                            .setMessage("Are you sure you want to delete this task?")
                                            .setNegativeButton("Cancel", null)
                                            .setPositiveButton("Delete") { _, _ ->

                                                tasks.remove(i)

                                                prefs.edit()
                                                    .putString("tasks", tasks.toString())
                                                    .apply()

                                                displayTasks()
                                            }
                                            .show()
                                    }
                                }
                            }
                            .show()

                        true
                    }


                    tasksContainer.addView(checkbox)

                    // Add divider between tasks
                    if (i < tasks.length() - 1) {

                        val divider = View(this)

                        divider.setBackgroundColor(
                            Color.parseColor("#E5E5E5")
                        )

                        val params = LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            dp(1)
                        )

                        divider.layoutParams = params

                        tasksContainer.addView(divider)
                    }
                }
            }

            updateProgress()
        }

        // Show saved tasks when the Home screen opens
        displayTasks()


// Add a new task
        val addTaskButton = findViewById<com.google.android.material.button.MaterialButton>(
            R.id.addTaskButton
        )

        addTaskButton.setOnClickListener {

            val input = EditText(this)
            input.hint = "Enter task name"
            input.setSingleLine(true)

            val dialog = AlertDialog.Builder(this)
                .setTitle("Add New Task")
                .setView(input)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Add", null)
                .create()

            dialog.setOnShowListener {

                dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                    .setOnClickListener {

                        val taskTitle = input.text.toString().trim()

                        if (taskTitle.isEmpty()) {
                            input.error = "Please enter a task name"
                            return@setOnClickListener
                        }

                        val newTask = JSONObject()

                        newTask.put("id", System.currentTimeMillis().toString())
                        newTask.put("title", taskTitle)
                        newTask.put("completed", false)

                        tasks.put(newTask)

                        prefs.edit()
                            .putString("tasks", tasks.toString())
                            .apply()

                        displayTasks()
                        dialog.dismiss()
                    }
            }

            dialog.show()
        }


    }

    private fun updateUpNext() {

        val upNextSubject = findViewById<TextView>(R.id.upNextSubject)
        val upNextTime = findViewById<TextView>(R.id.upNextTime)
        val upNextRoom = findViewById<TextView>(R.id.upNextRoom)

        // Load saved schedule
        val prefs = getSharedPreferences("overseer_schedule", MODE_PRIVATE)
        val classes = JSONArray(prefs.getString("classes", "[]"))

        // Get today's date and current time
        val today = Calendar.getInstance()
        val currentDay = today.get(Calendar.DAY_OF_WEEK)
        val currentTime = today.timeInMillis

        val timeFormat = SimpleDateFormat("h:mm a", Locale.US)

        val upcomingClasses = mutableListOf<Pair<Long, JSONObject>>()
        var todaysClassCount = 0

        // Find today's upcoming classes
        for (i in 0 until classes.length()) {

            val classItem = classes.getJSONObject(i)

            if (classItem.getInt("day") == currentDay) {

                todaysClassCount++

                val parsedTime = timeFormat.parse(classItem.getString("startTime"))
                    ?: continue

                val parsedCalendar = Calendar.getInstance().apply {
                    time = parsedTime
                }

                val classStart = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, parsedCalendar.get(Calendar.HOUR_OF_DAY))
                    set(Calendar.MINUTE, parsedCalendar.get(Calendar.MINUTE))
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }

                if (classStart.timeInMillis > currentTime) {
                    upcomingClasses.add(
                        Pair(classStart.timeInMillis, classItem)
                    )
                }
            }
        }

        // Find the earliest upcoming class
        val nextClass = upcomingClasses.minByOrNull { it.first }?.second

        if (nextClass != null) {

            upNextSubject.text = nextClass.getString("subject")

            upNextTime.text =
                "${nextClass.getString("startTime")} - ${nextClass.getString("endTime")}"

            upNextRoom.text = nextClass.getString("room")
            upNextRoom.visibility = View.VISIBLE

        } else {

            if (todaysClassCount == 0) {
                upNextSubject.text = "No classes scheduled today"
                upNextTime.text = ""
            } else {
                upNextSubject.text = "You're all caught up!"
                upNextTime.text = "No more classes today"
            }

            upNextRoom.text = ""
            upNextRoom.visibility = View.GONE
        }
    }

    override fun onResume() {
        super.onResume()
        updateUpNext()
    }

}
