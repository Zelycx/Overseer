package com.example.overseer

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.EditText
import android.widget.Toast
import android.content.Intent
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Typeface
import android.graphics.Color
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.card.MaterialCardView
import com.google.android.material.button.MaterialButton
import org.json.JSONArray

class StudyActivity : AppCompatActivity() {

    private lateinit var addedSubjectsContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_study)

        addedSubjectsContainer =
            findViewById(R.id.addedSubjectsContainer)

        // Set up bottom navigation
        val bottomNavigation =
            findViewById<BottomNavigationView>(R.id.bottomNavigation)

        bottomNavigation.selectedItemId = R.id.nav_study

        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {

                R.id.nav_home -> {
                    val intent = Intent(this, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
                                Intent.FLAG_ACTIVITY_SINGLE_TOP
                    }

                    startActivity(intent)
                    finish()
                    true
                }

                R.id.nav_schedule -> {
                    startActivity(Intent(this, ScheduleActivity::class.java))
                    finish()
                    true
                }

                R.id.nav_study -> true

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


// Load saved subjects
        val sharedPreferences =
            getSharedPreferences("overseer_subjects", MODE_PRIVATE)

        val subjectArray = JSONArray(
            sharedPreferences.getString("subjects", "[]") ?: "[]"
        )

// Add starter subjects only during the initial setup
        val initialized = sharedPreferences.getBoolean(
            "starter_subjects_initialized",
            false
        )

        if (!initialized) {

            // Only add starters if this is a fresh, empty subject list
            if (subjectArray.length() == 0) {
                subjectArray.put("Database Management")
                subjectArray.put("Programming")
            }

            sharedPreferences.edit()
                .putString("subjects", subjectArray.toString())
                .putBoolean("starter_subjects_initialized", true)
                .apply()
        }

// Display all saved subjects
        displaySubjects(subjectArray)

        // Add Subject button
        val addSubjectButton =
            findViewById<MaterialButton>(R.id.addSubjectButton)

        addSubjectButton.setOnClickListener {

            val subjectInput = EditText(this)
            subjectInput.hint = "Enter subject name"

            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Add Subject")
                .setMessage("Enter the name of your new subject.")
                .setView(subjectInput)
                .setPositiveButton("Add") { _, _ ->

                    val subjectName =
                        subjectInput.text.toString().trim()

                    if (subjectName.isEmpty()) {
                        Toast.makeText(
                            this,
                            "Please enter a subject name.",
                            Toast.LENGTH_SHORT
                        ).show()

                        return@setPositiveButton
                    }

                    val currentSubjects = JSONArray(
                        sharedPreferences.getString("subjects", "[]") ?: "[]"
                    )

                    if (containsSubject(currentSubjects, subjectName)) {
                        Toast.makeText(
                            this,
                            "This subject already exists.",
                            Toast.LENGTH_SHORT
                        ).show()

                        return@setPositiveButton
                    }

                    currentSubjects.put(subjectName)

                    sharedPreferences.edit()
                        .putString("subjects", currentSubjects.toString())
                        .apply()

                    addSubjectCard(subjectName, addedSubjectsContainer)

                    Toast.makeText(
                        this,
                        "Subject added: $subjectName",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        // Edge-to-edge padding
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->

            val systemBars =
                insets.getInsets(WindowInsetsCompat.Type.systemBars())

            v.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                0
            )

            bottomNavigation.setPadding(
                0,
                0,
                0,
                systemBars.bottom
            )

            insets
        }
    }

    // Check whether a subject already exists, ignoring letter case
    private fun containsSubject(
        subjectArray: JSONArray,
        subjectName: String,
        excludedSubject: String? = null
    ): Boolean {

        for (i in 0 until subjectArray.length()) {
            val existingName = subjectArray.getString(i)

            if (
                existingName.equals(subjectName, ignoreCase = true) &&
                !existingName.equals(excludedSubject, ignoreCase = true)
            ) {
                return true
            }
        }

        return false
    }

    // Display all saved subjects
    private fun displaySubjects(subjectArray: JSONArray) {

        addedSubjectsContainer.removeAllViews()

        for (i in 0 until subjectArray.length()) {
            addSubjectCard(
                subjectArray.getString(i),
                addedSubjectsContainer
            )
        }
    }

    // Create a subject card
    private fun addSubjectCard(
        subjectName: String,
        container: LinearLayout
    ) {

        val card = MaterialCardView(this).apply {

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin =
                    (12 * resources.displayMetrics.density).toInt()
            }

            radius = 16f * resources.displayMetrics.density
            cardElevation = 2f * resources.displayMetrics.density

            setCardBackgroundColor(getColor(R.color.overseer_white))

            strokeWidth =
                (1 * resources.displayMetrics.density).toInt()

            strokeColor = Color.parseColor("#E5E5E5")
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL

            setPadding(
                (18 * resources.displayMetrics.density).toInt(),
                (18 * resources.displayMetrics.density).toInt(),
                (18 * resources.displayMetrics.density).toInt(),
                (18 * resources.displayMetrics.density).toInt()
            )
        }

        val title = TextView(this).apply {
            text = subjectName
            textSize = 18f
            setTextColor(getColor(R.color.overseer_navy))
            setTypeface(null, Typeface.BOLD)
        }

        val subtitle = TextView(this).apply {
            text = "Notes, files and reviewers"
            textSize = 13f
            setTextColor(Color.GRAY)

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin =
                    (6 * resources.displayMetrics.density).toInt()
            }
        }

        content.addView(title)
        content.addView(subtitle)
        card.addView(content)

        // Long press to edit or delete
        card.setOnLongClickListener {
            showSubjectOptions(subjectName)
            true
        }

        // Normal click to open subject details
        card.setOnClickListener {
            val intent = Intent(this, SubjectDetailActivity::class.java)
            intent.putExtra("subject_name", subjectName)
            startActivity(intent)
        }

        container.addView(card)
    }

    // Show subject options
    private fun showSubjectOptions(subjectName: String) {

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(subjectName)
            .setItems(arrayOf("Edit Subject", "Delete Subject")) { _, which ->

                when (which) {
                    0 -> showEditSubjectDialog(subjectName)
                    1 -> deleteSubject(subjectName)
                }
            }
            .show()
    }

    // Edit subject
    private fun showEditSubjectDialog(oldSubjectName: String) {

        val subjectInput = EditText(this)
        subjectInput.setText(oldSubjectName)
        subjectInput.selectAll()
        subjectInput.hint = "Enter subject name"

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Edit Subject")
            .setMessage("Change the name of your subject.")
            .setView(subjectInput)
            .setPositiveButton("Save") { _, _ ->

                val newSubjectName =
                    subjectInput.text.toString().trim()

                if (newSubjectName.isEmpty()) {
                    Toast.makeText(
                        this,
                        "Subject name cannot be empty.",
                        Toast.LENGTH_SHORT
                    ).show()

                    return@setPositiveButton
                }

                if (newSubjectName == oldSubjectName) {
                    return@setPositiveButton
                }

                val subjectPreferences =
                    getSharedPreferences("overseer_subjects", MODE_PRIVATE)

                val subjectArray = JSONArray(
                    subjectPreferences.getString("subjects", "[]") ?: "[]"
                )

                if (
                    containsSubject(
                        subjectArray,
                        newSubjectName,
                        oldSubjectName
                    )
                ) {
                    Toast.makeText(
                        this,
                        "A subject with that name already exists.",
                        Toast.LENGTH_SHORT
                    ).show()

                    return@setPositiveButton
                }

                // Rename the subject in the saved subject list
                for (i in 0 until subjectArray.length()) {
                    if (subjectArray.getString(i) == oldSubjectName) {
                        subjectArray.put(i, newSubjectName)
                        break
                    }
                }

                subjectPreferences.edit()
                    .putString("subjects", subjectArray.toString())
                    .apply()

                // Move the subject's materials to its new name
                moveSubjectMaterials(oldSubjectName, newSubjectName)

                Toast.makeText(
                    this,
                    "Subject renamed to: $newSubjectName",
                    Toast.LENGTH_SHORT
                ).show()

                recreate()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // Move materials when a subject is renamed
    private fun moveSubjectMaterials(
        oldSubjectName: String,
        newSubjectName: String
    ) {

        val materialsPreferences =
            getSharedPreferences("overseer_materials", MODE_PRIVATE)

        val oldKey = "materials_$oldSubjectName"
        val newKey = "materials_$newSubjectName"

        val oldMaterials =
            materialsPreferences.getString(oldKey, null)

        if (oldMaterials == null) {
            return
        }

        val newMaterials =
            materialsPreferences.getString(newKey, null)

        val combinedMaterials = JSONArray()
        val seenMaterials = mutableSetOf<String>()

        // Preserve any materials already stored under the new key
        if (newMaterials != null) {
            val newArray = JSONArray(newMaterials)

            for (i in 0 until newArray.length()) {
                val material = newArray.getString(i)

                if (seenMaterials.add(material.lowercase())) {
                    combinedMaterials.put(material)
                }
            }
        }

        // Add the old subject's materials without duplicates
        val oldArray = JSONArray(oldMaterials)

        for (i in 0 until oldArray.length()) {
            val material = oldArray.getString(i)

            if (seenMaterials.add(material.lowercase())) {
                combinedMaterials.put(material)
            }
        }

        materialsPreferences.edit()
            .putString(newKey, combinedMaterials.toString())
            .remove(oldKey)
            .apply()
    }

    // Delete subject
    private fun deleteSubject(subjectName: String) {

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Delete Subject")
            .setMessage(
                "Are you sure you want to delete \"$subjectName\"? Its saved materials will also be deleted."
            )
            .setPositiveButton("Delete") { _, _ ->

                val subjectPreferences =
                    getSharedPreferences("overseer_subjects", MODE_PRIVATE)

                val subjectArray = JSONArray(
                    subjectPreferences.getString("subjects", "[]") ?: "[]"
                )

                for (i in 0 until subjectArray.length()) {
                    if (subjectArray.getString(i) == subjectName) {
                        subjectArray.remove(i)
                        break
                    }
                }

                subjectPreferences.edit()
                    .putString("subjects", subjectArray.toString())
                    .apply()

                // Delete materials belonging to this subject
                val materialsPreferences =
                    getSharedPreferences("overseer_materials", MODE_PRIVATE)

                materialsPreferences.edit()
                    .remove("materials_$subjectName")
                    .apply()

                Toast.makeText(
                    this,
                    "Subject deleted: $subjectName",
                    Toast.LENGTH_SHORT
                ).show()

                recreate()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
