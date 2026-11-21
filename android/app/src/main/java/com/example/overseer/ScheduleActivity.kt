package com.example.overseer

import android.app.AlertDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.card.MaterialCardView
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class ScheduleActivity : AppCompatActivity() {

    private lateinit var scheduleDate: TextView
    private lateinit var selectedDayDescription: TextView
    private lateinit var noClassesMessage: TextView
    private lateinit var classesContainer: LinearLayout

    private val calendar = Calendar.getInstance()

    private val preferences by lazy {
        getSharedPreferences("overseer_schedule", MODE_PRIVATE)
    }

    private val scheduleKey = "classes"

    private val days = listOf(
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_schedule)

        scheduleDate = findViewById(R.id.scheduleDate)
        selectedDayDescription = findViewById(R.id.selectedDayDescription)
        noClassesMessage = findViewById(R.id.noClassesMessage)
        classesContainer = findViewById(R.id.classesContainer)

        val previousDayButton =
            findViewById<Button>(R.id.previousDayButton)

        val nextDayButton =
            findViewById<Button>(R.id.nextDayButton)

        val addClassButton =
            findViewById<Button>(R.id.addClassButton)

        // Bottom navigation
        val bottomNavigation =
            findViewById<BottomNavigationView>(R.id.bottomNavigation)

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

                R.id.nav_focus -> {
                    startActivity(Intent(this, FocusActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_profile -> {
                    startActivity(Intent(this, ProfileActivity::class.java))
                    finish()
                    true
                }

                else -> false
            }
        }

        // Add the original sample classes only once
        initializeSampleClasses()

        // Date navigation
        previousDayButton.setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, -1)
            updateSchedule()
        }

        nextDayButton.setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, 1)
            updateSchedule()
        }

        // Add class
        addClassButton.setOnClickListener {
            showClassDialog()
        }

        updateSchedule()
    }

    // Initialize original sample schedules
    private fun initializeSampleClasses() {
        if (preferences.getBoolean("sample_classes_initialized", false)) {
            return
        }

        val classes = JSONArray()

        classes.put(
            createClassObject(
                "Database Management",
                Calendar.MONDAY,
                "10:00 AM",
                "11:30 AM",
                "Room 204",
                ""
            )
        )

        classes.put(
            createClassObject(
                "Programming",
                Calendar.TUESDAY,
                "1:00 PM",
                "2:30 PM",
                "Room 301",
                ""
            )
        )

        classes.put(
            createClassObject(
                "Database Management",
                Calendar.THURSDAY,
                "10:00 AM",
                "11:30 AM",
                "Room 204",
                ""
            )
        )

        classes.put(
            createClassObject(
                "Programming",
                Calendar.THURSDAY,
                "1:00 PM",
                "2:30 PM",
                "Room 301",
                ""
            )
        )

        saveClasses(classes)

        preferences.edit()
            .putBoolean("sample_classes_initialized", true)
            .apply()
    }

    private fun createClassObject(
        subject: String,
        day: Int,
        startTime: String,
        endTime: String,
        room: String,
        instructor: String
    ): JSONObject {
        return JSONObject().apply {
            put("id", System.currentTimeMillis().toString() + subject + day)
            put("subject", subject)
            put("day", day)
            put("startTime", startTime)
            put("endTime", endTime)
            put("room", room)
            put("instructor", instructor)
        }
    }

    // Load saved classes
    private fun loadClasses(): JSONArray {
        val savedClasses = preferences.getString(scheduleKey, "[]")
        return JSONArray(savedClasses)
    }

    // Save classes locally
    private fun saveClasses(classes: JSONArray) {
        preferences.edit()
            .putString(scheduleKey, classes.toString())
            .apply()
    }

    // Update the date and displayed classes
    private fun updateSchedule() {
        val dateFormat =
            SimpleDateFormat("EEEE, MMMM d", Locale.getDefault())

        scheduleDate.text =
            dateFormat.format(calendar.time).uppercase(Locale.getDefault())

        val today = Calendar.getInstance()

        val tomorrow = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
        }

        val isToday =
            today.get(Calendar.YEAR) == calendar.get(Calendar.YEAR) &&
                    today.get(Calendar.DAY_OF_YEAR) == calendar.get(Calendar.DAY_OF_YEAR)

        val isTomorrow =
            tomorrow.get(Calendar.YEAR) == calendar.get(Calendar.YEAR) &&
                    tomorrow.get(Calendar.DAY_OF_YEAR) == calendar.get(Calendar.DAY_OF_YEAR)

        selectedDayDescription.text = when {
            isToday -> "Your schedule for today."
            isTomorrow -> "Your schedule for tomorrow."
            else -> "Your schedule for this day."
        }

        displayClasses()
    }

    // Display classes for the selected day
    private fun displayClasses() {
        classesContainer.removeAllViews()

        val selectedDay = calendar.get(Calendar.DAY_OF_WEEK)
        val classes = loadClasses()

        var classCount = 0

        for (i in 0 until classes.length()) {
            val classItem = classes.getJSONObject(i)

            if (classItem.getInt("day") == selectedDay) {
                addClassCard(classItem)
                classCount++
            }
        }

        noClassesMessage.visibility =
            if (classCount == 0) View.VISIBLE else View.GONE
    }

    // Create a class card dynamically
    private fun addClassCard(classItem: JSONObject) {
        val card = MaterialCardView(this).apply {
            radius = 20f
            cardElevation = 0f
            strokeWidth = 2
            setStrokeColor(android.graphics.Color.parseColor("#777777"))
            setCardBackgroundColor(getColor(R.color.overseer_white))

            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )

            params.bottomMargin = 16
            layoutParams = params
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 20, 24, 20)
        }

        val subject = TextView(this).apply {
            text = classItem.getString("subject")
            textSize = 18f
            setTextColor(getColor(R.color.overseer_navy))
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        val time = TextView(this).apply {
            text = "${classItem.getString("startTime")} - ${classItem.getString("endTime")}"
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#777777"))
            setPadding(0, 8, 0, 0)
        }

        val room = TextView(this).apply {
            text = classItem.getString("room")
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#777777"))
            setPadding(0, 4, 0, 0)
        }

        content.addView(subject)
        content.addView(time)
        content.addView(room)

        val instructorName = classItem.optString("instructor", "")

        if (instructorName.isNotBlank()) {
            val instructor = TextView(this).apply {
                text = "Instructor: $instructorName"
                textSize = 14f
                setTextColor(android.graphics.Color.parseColor("#777777"))
                setPadding(0, 4, 0, 0)
            }

            content.addView(instructor)
        }

        card.addView(content)

        // Long press to edit or delete
        card.setOnLongClickListener {
            showClassOptions(classItem)
            true
        }

        classesContainer.addView(card)
    }

    // Add or edit a class
    private fun showClassDialog(existingClass: JSONObject? = null) {

        val isEditing = existingClass != null

        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 8, 24, 0)
        }

        fun createInput(hintText: String, value: String = ""): EditText {
            return EditText(this).apply {
                hint = hintText
                setText(value)
                textSize = 15f
                setSingleLine(true)
            }
        }

        val subjectInput = createInput(
            "Subject name",
            existingClass?.optString("subject", "") ?: ""
        )

        val daySpinner = Spinner(this)

        val dayAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            days
        )

        dayAdapter.setDropDownViewResource(
            android.R.layout.simple_spinner_dropdown_item
        )

        daySpinner.adapter = dayAdapter

        val currentDay = existingClass?.optInt("day")
            ?: calendar.get(Calendar.DAY_OF_WEEK)

        daySpinner.setSelection(currentDay - 1)

        val startTimeInput = createInput(
            "Start time",
            existingClass?.optString("startTime", "10:00 AM") ?: "10:00 AM"
        )

        val endTimeInput = createInput(
            "End time",
            existingClass?.optString("endTime", "11:00 AM") ?: "11:00 AM"
        )

        startTimeInput.isFocusable = false
        startTimeInput.isClickable = true

        endTimeInput.isFocusable = false
        endTimeInput.isClickable = true

        startTimeInput.setOnClickListener {
            showTimePicker(startTimeInput)
        }

        endTimeInput.setOnClickListener {
            showTimePicker(endTimeInput)
        }

        val roomInput = createInput(
            "Room or location",
            existingClass?.optString("room", "") ?: ""
        )

        val instructorInput = createInput(
            "Instructor (optional)",
            existingClass?.optString("instructor", "") ?: ""
        )

        form.addView(subjectInput)
        form.addView(daySpinner)
        form.addView(startTimeInput)
        form.addView(endTimeInput)
        form.addView(roomInput)
        form.addView(instructorInput)

        val dialog = AlertDialog.Builder(this)
            .setTitle(if (isEditing) "Edit Class" else "Add Class")
            .setView(form)
            .setNegativeButton("Cancel", null)
            .setPositiveButton(if (isEditing) "Save Changes" else "Add", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {

                val subject = subjectInput.text.toString().trim()
                val room = roomInput.text.toString().trim()

                if (subject.isBlank()) {
                    subjectInput.error = "Enter a subject name"
                    return@setOnClickListener
                }

                if (room.isBlank()) {
                    roomInput.error = "Enter a room or location"
                    return@setOnClickListener
                }

                val startTime = startTimeInput.text.toString()
                val endTime = endTimeInput.text.toString()

                val updatedClass = createClassObject(
                    subject,
                    daySpinner.selectedItemPosition + 1,
                    startTime,
                    endTime,
                    room,
                    instructorInput.text.toString().trim()
                )

                val classes = loadClasses()

                if (isEditing) {
                    val editingId = existingClass!!.getString("id")

                    for (i in 0 until classes.length()) {
                        if (classes.getJSONObject(i).getString("id") == editingId) {
                            updatedClass.put("id", editingId)
                            classes.put(i, updatedClass)
                            break
                        }
                    }
                } else {
                    classes.put(updatedClass)
                }

                saveClasses(classes)
                updateSchedule()
                dialog.dismiss()
            }
        }

        dialog.show()
    }

    // Show Android time picker
    private fun showTimePicker(target: EditText) {
        val initialTime = Calendar.getInstance()

        TimePickerDialog(
            this,
            { _, hour, minute ->
                val selectedTime = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, hour)
                    set(Calendar.MINUTE, minute)
                }

                val formatter =
                    SimpleDateFormat("h:mm a", Locale.getDefault())

                target.setText(formatter.format(selectedTime.time))
            },
            initialTime.get(Calendar.HOUR_OF_DAY),
            initialTime.get(Calendar.MINUTE),
            false
        ).show()
    }

    // Edit or delete a class
    private fun showClassOptions(classItem: JSONObject) {
        val options = arrayOf("Edit Class", "Delete Class")

        AlertDialog.Builder(this)
            .setTitle(classItem.getString("subject"))
            .setItems(options) { _, selected ->

                when (selected) {
                    0 -> showClassDialog(classItem)
                    1 -> confirmDeleteClass(classItem)
                }
            }
            .show()
    }

    // Confirm deletion
    private fun confirmDeleteClass(classItem: JSONObject) {
        AlertDialog.Builder(this)
            .setTitle("Delete Class")
            .setMessage(
                "Are you sure you want to delete ${classItem.getString("subject")}?"
            )
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->

                val classes = loadClasses()
                val updatedClasses = JSONArray()

                val deletingId = classItem.getString("id")

                for (i in 0 until classes.length()) {
                    val item = classes.getJSONObject(i)

                    if (item.getString("id") != deletingId) {
                        updatedClasses.put(item)
                    }
                }

                saveClasses(updatedClasses)
                updateSchedule()

                Toast.makeText(
                    this,
                    "Class deleted",
                    Toast.LENGTH_SHORT
                ).show()
            }
            .show()
    }
}
