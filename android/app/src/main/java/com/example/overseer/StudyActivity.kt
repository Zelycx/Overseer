package com.example.overseer

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.EditText
import android.widget.Toast
import android.content.Intent
import com.google.android.material.bottomnavigation.BottomNavigationView
import android.view.View
import android.widget.LinearLayout
import org.json.JSONArray

class StudyActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_study)

        findViewById<com.google.android.material.card.MaterialCardView>(R.id.databaseSubjectCard).setOnClickListener {
            val intent = Intent(this, SubjectDetailActivity::class.java)
            intent.putExtra("subject_name", "Database Management")
            startActivity(intent)
        }

        findViewById<com.google.android.material.card.MaterialCardView>(R.id.programmingSubjectCard).setOnClickListener {
            val intent = Intent(this, SubjectDetailActivity::class.java)
            intent.putExtra("subject_name", "Programming")
            startActivity(intent)
        }

        // Set up bottom navigation
        val bottomNavigation = findViewById<BottomNavigationView>(R.id.bottomNavigation)

        bottomNavigation.selectedItemId = R.id.nav_study


        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {

                R.id.nav_home -> {
                    startActivity(Intent(this, MainActivity::class.java))
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


        val addSubjectButton = findViewById<com.google.android.material.button.MaterialButton>(R.id.addSubjectButton)
        val addedSubjectsContainer = findViewById<LinearLayout>(R.id.addedSubjectsContainer)

        // Load previously saved subjects
        val sharedPreferences = getSharedPreferences("overseer_subjects", MODE_PRIVATE)

        val savedSubjects = sharedPreferences.getString("subjects", "[]")
        val subjectArray = JSONArray(savedSubjects)

        for (i in 0 until subjectArray.length()) {
            val subjectName = subjectArray.getString(i)
            addSubjectCard(subjectName, addedSubjectsContainer)
        }

        addSubjectButton.setOnClickListener {

            val subjectInput = EditText(this)
            subjectInput.hint = "Enter subject name"

            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Add Subject")
                .setMessage("Enter the name of your new subject.")
                .setView(subjectInput)
                .setPositiveButton("Add") { _, _ ->

                    val subjectName = subjectInput.text.toString().trim()

                    if (subjectName.isNotEmpty()) {

                        subjectArray.put(subjectName)

                        sharedPreferences.edit()
                            .putString("subjects", subjectArray.toString())
                            .apply()

                        addSubjectCard(subjectName, addedSubjectsContainer)

                        Toast.makeText(
                            this,
                            "Subject added: $subjectName",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->

            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

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


    private fun addSubjectCard(
        subjectName: String,
        container: LinearLayout
    ) {
        val card = com.google.android.material.card.MaterialCardView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (12 * resources.displayMetrics.density).toInt()
            }

            radius = 16f * resources.displayMetrics.density
            cardElevation = 2f * resources.displayMetrics.density
            setCardBackgroundColor(getColor(R.color.overseer_white))
            strokeWidth = (1 * resources.displayMetrics.density).toInt()
            strokeColor = android.graphics.Color.parseColor("#E5E5E5")
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

        val title = android.widget.TextView(this).apply {
            text = subjectName
            textSize = 18f
            setTextColor(getColor(R.color.overseer_navy))
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        val subtitle = android.widget.TextView(this).apply {
            text = "Notes, files and reviewers"
            textSize = 13f
            setTextColor(android.graphics.Color.GRAY)

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = (6 * resources.displayMetrics.density).toInt()
            }
        }

        content.addView(title)
        content.addView(subtitle)
        card.addView(content)

        card.setOnClickListener {
            val intent = Intent(this, SubjectDetailActivity::class.java)
            intent.putExtra("subject_name", subjectName)
            startActivity(intent)
        }

        container.addView(card)
    }

}