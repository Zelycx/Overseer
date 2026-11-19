
package com.example.overseer

import android.os.Bundle
import android.content.Intent
import android.widget.TextView
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Calendar
import android.view.View

class ScheduleActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_schedule)

        // Display the current date
        val scheduleDate = findViewById<TextView>(R.id.scheduleDate)

        val selectedDayDescription =
            findViewById<TextView>(R.id.selectedDayDescription)

        val dateFormat = SimpleDateFormat("EEEE, MMMM d", Locale.getDefault())

        // Set up bottom navigation
        val bottomNavigation = findViewById<BottomNavigationView>(R.id.bottomNavigation)

        bottomNavigation.selectedItemId = R.id.nav_schedule

        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> {
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_schedule -> true

                R.id.nav_study -> {
                    startActivity(Intent(this, StudyActivity::class.java))
                    finish()
                    true
                }

                else -> false
            }
        }

        // Get the arrow buttons
        val previousDayButton = findViewById<Button>(R.id.previousDayButton)
        val nextDayButton = findViewById<Button>(R.id.nextDayButton)

        // Store the currently selected date
        val calendar = Calendar.getInstance()

        // Get the class cards and empty-day message
        val databaseClassCard = findViewById<View>(R.id.databaseClassCard)
        val programmingClassCard = findViewById<View>(R.id.programmingClassCard)
        val noClassesMessage = findViewById<TextView>(R.id.noClassesMessage)

        val databaseClassName = findViewById<TextView>(R.id.databaseClassName)
        val databaseClassTime = findViewById<TextView>(R.id.databaseClassTime)
        val databaseClassLocation = findViewById<TextView>(R.id.databaseClassLocation)

        val programmingClassName = findViewById<TextView>(R.id.programmingClassName)
        val programmingClassTime = findViewById<TextView>(R.id.programmingClassTime)
        val programmingClassLocation = findViewById<TextView>(R.id.programmingClassLocation)

        // Function to update the displayed date
        fun updateDate() {

            // Update the displayed date
            scheduleDate.text = dateFormat.format(calendar.time)
                .uppercase(Locale.getDefault())

            // Compare selected date with today
            val today = Calendar.getInstance()

            val selectedDate = calendar.clone() as Calendar

            val isToday =
                today.get(Calendar.YEAR) == selectedDate.get(Calendar.YEAR) &&
                        today.get(Calendar.DAY_OF_YEAR) == selectedDate.get(Calendar.DAY_OF_YEAR)

            val tomorrow = Calendar.getInstance()
            tomorrow.add(Calendar.DAY_OF_YEAR, 1)

            val isTomorrow =
                tomorrow.get(Calendar.YEAR) == selectedDate.get(Calendar.YEAR) &&
                        tomorrow.get(Calendar.DAY_OF_YEAR) == selectedDate.get(Calendar.DAY_OF_YEAR)

            selectedDayDescription.text = when {
                isToday -> "Your schedule for today."
                isTomorrow -> "Your schedule for tomorrow."
                else -> "Your schedule for this day."
            }
        }

        // Check whether the selected date is today
        fun updateClasses() {

            val dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)

            when (dayOfWeek) {

                Calendar.MONDAY -> {
                    databaseClassCard.visibility = View.VISIBLE
                    programmingClassCard.visibility = View.GONE
                    noClassesMessage.visibility = View.GONE

                    databaseClassName.text = "Database Management"
                    databaseClassTime.text = "10:00 AM - 11:30 AM"
                    databaseClassLocation.text = "Room 204"
                }

                Calendar.TUESDAY -> {
                    databaseClassCard.visibility = View.GONE
                    programmingClassCard.visibility = View.VISIBLE
                    noClassesMessage.visibility = View.GONE

                    programmingClassName.text = "Programming"
                    programmingClassTime.text = "1:00 PM - 2:30 PM"
                    programmingClassLocation.text = "Room 301"
                }

                Calendar.WEDNESDAY -> {
                    databaseClassCard.visibility = View.GONE
                    programmingClassCard.visibility = View.GONE
                    noClassesMessage.visibility = View.VISIBLE
                }

                Calendar.THURSDAY -> {
                    databaseClassCard.visibility = View.VISIBLE
                    programmingClassCard.visibility = View.VISIBLE
                    noClassesMessage.visibility = View.GONE

                    databaseClassName.text = "Database Management"
                    databaseClassTime.text = "10:00 AM - 11:30 AM"
                    databaseClassLocation.text = "Room 204"

                    programmingClassName.text = "Programming"
                    programmingClassTime.text = "1:00 PM - 2:30 PM"
                    programmingClassLocation.text = "Room 301"
                }

                Calendar.FRIDAY -> {
                    databaseClassCard.visibility = View.GONE
                    programmingClassCard.visibility = View.GONE
                    noClassesMessage.visibility = View.VISIBLE
                }

                else -> {
                    databaseClassCard.visibility = View.GONE
                    programmingClassCard.visibility = View.GONE
                    noClassesMessage.visibility = View.VISIBLE
                }
            }
        }

        // Display the correct classes
        updateClasses()

        // Go to the previous day
        previousDayButton.setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, -1)
            updateDate()
            updateClasses()
        }

        // Go to the next day
        nextDayButton.setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, 1)
            updateDate()
            updateClasses()
        }
    }
}
