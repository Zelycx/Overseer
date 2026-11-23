package com.example.overseer

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import android.content.res.Configuration
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomnavigation.BottomNavigationView
import android.content.ComponentName
import android.provider.Settings
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

class ProfileActivity : AppCompatActivity() {

    private val exportBackup = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(::writeBackup) }
    private val exportRecovery = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let(::writeRecoveryCopy) }
    private val importBackup = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(::readBackup) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)
        val data = WorkspaceRepository.load(this)


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

        setProfileIdentity(data.preferences.displayName, data.preferences.profileEmail)

        findViewById<android.widget.TextView>(R.id.editProfileOption)
            .setOnClickListener {
                showEditProfileDialog()
            }

        findViewById<android.widget.TextView>(R.id.accountInfoOption)
            .setOnClickListener {
                showAccountInfoDialog()
            }

        findViewById<android.widget.TextView>(R.id.timeFormatOption).setOnClickListener { showTimePreferences() }
        findViewById<android.widget.TextView>(R.id.appearanceOption).setOnClickListener { showAppearancePreferences() }
        findViewById<android.widget.TextView>(R.id.exportDataOption).setOnClickListener {
            val name = "overseer-backup-${SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())}.json"
            exportBackup.launch(name)
        }
        findViewById<android.widget.TextView>(R.id.importDataOption).setOnClickListener { importBackup.launch(arrayOf("application/json", "text/json", "text/plain")) }
        findViewById<android.widget.TextView>(R.id.resetDataOption).setOnClickListener { confirmReset() }
        val recoveryDivider = findViewById<android.view.View>(R.id.recoveryDivider)
        findViewById<android.widget.TextView>(R.id.exportRecoveryOption).apply {
            val available = WorkspaceRepository.recoveryFile(this@ProfileActivity) != null
            visibility = if (available) android.view.View.VISIBLE else android.view.View.GONE
            recoveryDivider.visibility = if (available) android.view.View.VISIBLE else android.view.View.GONE
            setOnClickListener { exportRecovery.launch("overseer-recovery-copy.json") }
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
        val nameInput = WorkspaceUi.editText(this).apply {
            hint = "Enter your name"
            setSingleLine(true)
        }

        val emailInput = WorkspaceUi.editText(this).apply {
            hint = "Enter your email"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }

        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 8, 48, 0)
            addView(nameInput)
            addView(emailInput)
        }

        val prefs = WorkspaceRepository.load(this).preferences
        nameInput.setText(prefs.displayName)
        emailInput.setText(prefs.profileEmail)

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Edit Profile")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val name = nameInput.text.toString().trim()
                val email = emailInput.text.toString().trim()

                if (name.isNotEmpty() && email.isNotEmpty()) {
                    WorkspaceRepository.update(this) { data -> data.copy(preferences = data.preferences.copy(displayName = name, profileEmail = email)) }
                    getSharedPreferences("overseer_profile", MODE_PRIVATE).edit()
                        .putString("profile_name", name)
                        .putString("profile_email", email)
                        .apply()

                    setProfileIdentity(name, email)
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
        val prefs = WorkspaceRepository.load(this).preferences
        val name = prefs.displayName.ifBlank { "Student Name" }
        val email = prefs.profileEmail.ifBlank { "student@email.com" }

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

        Organize your courses and learning materials,
        manage your class schedule and tasks,
        and stay focused on your academic goals.

        Version: 1.0

        Storage: Local / Offline

        Made by Vengeance Studios
    """.trimIndent()

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("About Overseer")
            .setMessage(message)
            .setPositiveButton("Got it", null)
            .show()
    }

    private fun writeBackup(uri: Uri) {
        runCatching {
            val json = WorkspaceRepository.exportJson(WorkspaceRepository.load(this))
            contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use { it.write(json) } ?: error("Could not open the selected file")
        }.onSuccess { Toast.makeText(this, "Workspace backup exported", Toast.LENGTH_SHORT).show() }
            .onFailure { Toast.makeText(this, it.message ?: "Could not export backup", Toast.LENGTH_LONG).show() }
    }

    private fun writeRecoveryCopy(uri: Uri) {
        val recovery = WorkspaceRepository.recoveryFile(this)
        if (recovery == null) {
            Toast.makeText(this, "No recovery copy is available", Toast.LENGTH_SHORT).show()
            return
        }
        runCatching { contentResolver.openOutputStream(uri)?.use { it.write(recovery.readBytes()) } ?: error("Could not open the selected file") }
            .onSuccess { Toast.makeText(this, "Recovery copy exported", Toast.LENGTH_LONG).show() }
            .onFailure { Toast.makeText(this, it.message ?: "Could not export the recovery copy", Toast.LENGTH_LONG).show() }
    }

    private fun readBackup(uri: Uri) {
        val json = runCatching { contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: error("Could not read the selected file") }
            .getOrElse { Toast.makeText(this, it.message ?: "Could not read backup", Toast.LENGTH_LONG).show(); return }
        val preview = runCatching { WorkspaceRepository.previewImport(WorkspaceRepository.load(this), json) }
            .getOrElse { Toast.makeText(this, it.message ?: "This is not a supported Overseer backup", Toast.LENGTH_LONG).show(); return }
        val summary = preview.summary
        AlertDialog.Builder(this)
            .setTitle("Merge workspace backup?")
            .setMessage("${summary.added} records will be added; ${summary.alreadyPresent} already exist. ${summary.idConflicts} ID conflicts will be kept as separate records. Your local preferences and timer stay in place.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Merge") { _, _ ->
                runCatching { WorkspaceRepository.save(this, preview.data) }
                    .onSuccess { Toast.makeText(this, "Workspace backup merged", Toast.LENGTH_LONG).show(); refreshProfile() }
                    .onFailure { Toast.makeText(this, it.message ?: "Could not save imported data", Toast.LENGTH_LONG).show() }
            }.show()
    }

    private fun confirmReset() {
        AlertDialog.Builder(this).setTitle("Reset this workspace?")
            .setMessage("This clears courses, lessons, materials, tasks, events, plans, focus history, and profile preferences from this device. Export a backup first if you may need the data later.")
            .setNegativeButton("Keep workspace", null)
            .setPositiveButton("Reset workspace") { _, _ ->
                WorkspaceRepository.reset(this)
                applyAppearance("system")
                refreshProfile()
                Toast.makeText(this, "Workspace reset", Toast.LENGTH_SHORT).show()
            }
            .show()
    }

    private fun refreshProfile() {
        val prefs = WorkspaceRepository.load(this).preferences
        setProfileIdentity(prefs.displayName, prefs.profileEmail)
    }

    private fun setProfileIdentity(name: String, email: String) {
        val displayName = name.ifBlank { "Student Name" }
        findViewById<android.widget.TextView>(R.id.profileName).text = displayName
        findViewById<android.widget.TextView>(R.id.profileEmail).text = email.ifBlank { "student@email.com" }
        findViewById<android.widget.TextView>(R.id.profileAvatar).text = displayName.trim().split(Regex("\\s+")).let { parts ->
            if (parts.size > 1) "${parts.first().firstOrNull() ?: 'S'}${parts.last().firstOrNull() ?: 'T'}".uppercase(Locale.getDefault())
            else displayName.take(2).uppercase(Locale.getDefault())
        }
    }

    private fun showTimePreferences() {
        val data = WorkspaceRepository.load(this)
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 8, 48, 0) }
        form.addView(android.widget.TextView(this).apply { text = "Time format" })
        val time = WorkspaceUi.spinner(this, listOf("12-hour", "24-hour"), if (data.preferences.timeFormat == "24h") 1 else 0)
        form.addView(time)
        form.addView(WorkspaceUi.text(this, "First day of week"))
        val week = WorkspaceUi.spinner(this, listOf("Monday", "Sunday"), if (data.preferences.firstDayOfWeek == 0) 1 else 0)
        form.addView(week)
        AlertDialog.Builder(this).setTitle("Time and week preferences").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Save") { _, _ ->
            WorkspaceRepository.update(this) { current -> current.copy(preferences = current.preferences.copy(timeFormat = if (time.selectedItemPosition == 1) "24h" else "12h", firstDayOfWeek = if (week.selectedItemPosition == 1) 0 else 1)) }
            Toast.makeText(this, "Preferences saved", Toast.LENGTH_SHORT).show()
        }.show()
    }

    private fun showAppearancePreferences() {
        val current = WorkspaceRepository.load(this).preferences
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 8, 48, 0) }
        val modes = listOf("system", "light", "dark")
        form.addView(WorkspaceUi.text(this, "Color mode"))
        val mode = WorkspaceUi.spinner(this, listOf("System", "Light", "Dark"), modes.indexOf(current.appearanceMode).coerceAtLeast(0))
        form.addView(mode)
        val presets = listOf("studio", "midnight", "paper", "high-contrast")
        form.addView(WorkspaceUi.text(this, "Appearance preset"))
        val preset = WorkspaceUi.spinner(this, listOf("Studio", "Midnight", "Paper", "High contrast"), presets.indexOf(current.appearancePreset).coerceAtLeast(0))
        form.addView(preset)
        val accents = listOf("olive", "blue", "terracotta", "violet", "teal")
        form.addView(WorkspaceUi.text(this, "Accent color"))
        val accent = WorkspaceUi.spinner(this, listOf("Olive / lime", "Blue", "Terracotta", "Violet", "Teal"), accents.indexOf(current.accentColor).coerceAtLeast(0))
        form.addView(accent)
        val densities = listOf("comfortable", "compact")
        form.addView(WorkspaceUi.text(this, "Layout density"))
        val density = WorkspaceUi.spinner(this, listOf("Comfortable", "Compact"), densities.indexOf(current.density).coerceAtLeast(0))
        form.addView(density)
        val reducedMotion = WorkspaceUi.checkBox(this).apply { text = "Reduce motion in Web app"; isChecked = current.reducedMotion }
        form.addView(reducedMotion)
        val scroll = android.widget.ScrollView(this).apply { isFillViewport = true; addView(form) }
        AlertDialog.Builder(this).setTitle("Appearance").setMessage("Color mode, appearance preset, accent color, and density apply throughout the Android app. Reduce motion applies to the Web app.").setView(scroll).setNegativeButton("Cancel", null).setPositiveButton("Save") { _, _ ->
            val selectedMode = modes[mode.selectedItemPosition]
            WorkspaceRepository.update(this) { data -> data.copy(preferences = data.preferences.copy(
                appearanceMode = selectedMode,
                appearancePreset = presets[preset.selectedItemPosition],
                accentColor = accents[accent.selectedItemPosition],
                density = densities[density.selectedItemPosition],
                reducedMotion = reducedMotion.isChecked,
            )) }
            applyAppearance(selectedMode)
            val currentDark = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
            val systemDark = applicationContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
            val selectedDark = when (selectedMode) { "dark" -> true; "light" -> false; else -> systemDark }
            if (currentDark == selectedDark) recreate()
            Toast.makeText(this, "Appearance preferences saved", Toast.LENGTH_SHORT).show()
        }.show()
    }

    private fun applyAppearance(mode: String) {
        val preferences = WorkspaceRepository.load(this).preferences
        val systemIsDark = applicationContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        val dark = when (mode) {
            "dark" -> true
            "light" -> false
            else -> systemIsDark
        }
        WorkspaceUi.configure(preferences, dark)
        AppCompatDelegate.setDefaultNightMode(when (mode) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
    }



}
