
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

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

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


        // Get the task checkboxes
        val taskOne = findViewById<CheckBox>(R.id.taskOne)
        val taskTwo = findViewById<CheckBox>(R.id.taskTwo)
        val taskThree = findViewById<CheckBox>(R.id.taskThree)

        // Open local task storage
        val prefs = getSharedPreferences("overseer_tasks", MODE_PRIVATE)

        // Connect each checkbox to a saved storage key
        val taskCheckboxes = listOf(
            taskOne to "task_one",
            taskTwo to "task_two",
            taskThree to "task_three"
        )

        // Restore previously saved checkbox states
        taskCheckboxes.forEach { (checkbox, key) ->
            checkbox.isChecked = prefs.getBoolean(key, false)
        }

        // Update the progress whenever a task changes
        fun updateProgress() {

            val completedTasks = taskCheckboxes.count { it.first.isChecked }
            val totalTasks = taskCheckboxes.size

            val percentage = (completedTasks * 100f / totalTasks).roundToInt()

            progressCount.text = "$completedTasks of $totalTasks tasks completed"
            progressBar.progress = percentage
            progressPercentage.text = "$percentage% complete"
        }

        // Listen for checkbox changes and save them
        taskCheckboxes.forEach { (checkbox, key) ->
            checkbox.setOnCheckedChangeListener { _, isChecked ->

                prefs.edit()
                    .putBoolean(key, isChecked)
                    .apply()

                updateProgress()
            }
        }

        // Display the initial progress
        updateProgress()

    }
}
