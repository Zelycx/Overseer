package com.example.overseer

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomnavigation.BottomNavigationView
import android.content.ComponentName
import android.provider.Settings

class ProfileActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)


        findViewById<android.widget.TextView>(R.id.aboutOverseerOption)
            .setOnClickListener {
                showAboutDialog()
            }


        findViewById<android.widget.TextView>(R.id.notificationsOption)
            .setOnClickListener {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(
                        Settings.EXTRA_APP_PACKAGE,
                        packageName
                    )
                }

                startActivity(intent)
            }

        val prefs = getSharedPreferences("overseer_profile", MODE_PRIVATE)

        findViewById<android.widget.TextView>(R.id.profileName).text =
            prefs.getString("profile_name", "Student Name")

        findViewById<android.widget.TextView>(R.id.profileEmail).text =
            prefs.getString("profile_email", "student@email.com")

        findViewById<android.widget.TextView>(R.id.editProfileOption)
            .setOnClickListener {
                showEditProfileDialog()
            }

        findViewById<android.widget.TextView>(R.id.accountInfoOption)
            .setOnClickListener {
                showAccountInfoDialog()
            }

        val bottomNavigation =
            findViewById<BottomNavigationView>(R.id.bottomNavigation)

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

        bottomNavigation.selectedItemId = R.id.nav_profile

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

                R.id.nav_profile -> true

                else -> false
            }
        }
    }


    private fun showEditProfileDialog() {
        val nameInput = android.widget.EditText(this).apply {
            hint = "Enter your name"
            setSingleLine(true)
        }

        val emailInput = android.widget.EditText(this).apply {
            hint = "Enter your email"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }

        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 8, 48, 0)
            addView(nameInput)
            addView(emailInput)
        }

        val prefs = getSharedPreferences("overseer_profile", MODE_PRIVATE)

        nameInput.setText(prefs.getString("profile_name", ""))
        emailInput.setText(prefs.getString("profile_email", ""))

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Edit Profile")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val name = nameInput.text.toString().trim()
                val email = emailInput.text.toString().trim()

                if (name.isNotEmpty() && email.isNotEmpty()) {
                    prefs.edit()
                        .putString("profile_name", name)
                        .putString("profile_email", email)
                        .apply()

                    findViewById<android.widget.TextView>(R.id.profileName).text = name
                    findViewById<android.widget.TextView>(R.id.profileEmail).text = email
                } else {
                    android.widget.Toast.makeText(
                        this,
                        "Please enter both your name and email.",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showAccountInfoDialog() {

        val prefs = getSharedPreferences("overseer_profile", MODE_PRIVATE)

        val name = prefs.getString("profile_name", "Student Name")
        val email = prefs.getString("profile_email", "student@email.com")

        val message = """
        Name: $name
        
        Email: $email
        
        App Version: 1.0
        
        Storage: Local / Offline
    """.trimIndent()

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Account Information")
            .setMessage(message)
            .setPositiveButton("Done", null)
            .show()
    }


    private fun showAboutDialog() {
        val message = """
        Overseer

        Your personal student productivity companion.

        Organize your subjects, manage your schedule,
        and stay focused on your academic goals.

        Version: 1.0

        Storage: Local / Offline

        Built as a student hackathon project.
    """.trimIndent()

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("About Overseer")
            .setMessage(message)
            .setPositiveButton("Got it", null)
            .show()
    }


}
