package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.UserPreferences
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class SettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) { openAuth(); return }
        setContentView(R.layout.activity_settings)
        val name = findViewById<EditText>(R.id.settingsName)
        val zone = findViewById<EditText>(R.id.settingsTimezone)
        val save = findViewById<Button>(R.id.settingsSave)
        val signOut = findViewById<Button>(R.id.settingsSignOut)
        name.setText(auth.currentUser?.displayName ?: "")
        zone.setText(java.util.TimeZone.getDefault().id)
        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())
        save.setOnClickListener {
            val now = Timestamp.now()
            val model = UserPreferences(
                id = "preferences",
                createdAt = now,
                updatedAt = now,
                displayName = name.text.toString().trim().ifBlank { "Student" },
                timeFormat = "12h",
                firstDayOfWeek = 1,
                timeZoneId = zone.text.toString().trim().ifBlank { "UTC" },
                aiWorkspaceContextConsent = false,
                consentedAt = null,
                revokedAt = null,
                consentVersion = null,
            )
            runCatching { CanonicalCodecs.encodeUserPreferences(model) }
                .onSuccess { repository.savePreferences(model) }
        }
        signOut.setOnClickListener { auth.signOut(); openAuth() }
    }
    private fun openAuth() {
        startActivity(Intent(this, AuthActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK })
        finish()
    }
}
