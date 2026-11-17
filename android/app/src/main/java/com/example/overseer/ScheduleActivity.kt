
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

                else -> false
            }
        }

        // Get the arrow buttons
        val previousDayButton = findViewById<Button>(R.id.previousDayButton)
        val nextDayButton = findViewById<Button>(R.id.nextDayButton)

        // Store the currently selected date
        val calendar = Calendar.getInstance()

        // Function to update the displayed date
        fun updateDate() {
            scheduleDate.text = dateFormat.format(calendar.time)
                .uppercase(Locale.getDefault())
        }

        // Display the initial date
        updateDate()

        // Get the class cards and empty-day message
        val databaseClassCard = findViewById<View>(R.id.databaseClassCard)
        val programmingClassCard = findViewById<View>(R.id.programmingClassCard)
        val noClassesMessage = findViewById<TextView>(R.id.noClassesMessage)

        // Check whether the selected date is today
        fun updateClasses() {

            val today = Calendar.getInstance()

            val isToday =
                calendar.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
                        calendar.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)

            if (isToday) {
                databaseClassCard.visibility = View.VISIBLE
                programmingClassCard.visibility = View.VISIBLE
                noClassesMessage.visibility = View.GONE
            } else {
                databaseClassCard.visibility = View.GONE
                programmingClassCard.visibility = View.GONE
                noClassesMessage.visibility = View.VISIBLE
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
