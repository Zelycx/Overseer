package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.view.ViewGroup
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.UserPreferences
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import org.json.JSONObject

class SettingsActivity : AppCompatActivity() {
    private var pendingProvider: String? = null
    private var pendingState: String? = null
    private var pendingVerifier: String? = null
    private lateinit var integrationStatus: TextView
    private lateinit var integrationContent: TextView
    private lateinit var integrationRoot: LinearLayout
    private data class PendingOAuth(val provider: String, val state: String?, val verifier: String)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) { openAuth(); return }
        setContentView(R.layout.activity_settings)
        (lastCustomNonConfigurationInstance as? PendingOAuth)?.let {
            pendingProvider = it.provider
            pendingState = it.state
            pendingVerifier = it.verifier
        }
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

        val content = findViewById<ViewGroup>(android.R.id.content)
        val scroll = content.getChildAt(0) as android.widget.ScrollView
        integrationRoot = scroll.getChildAt(0) as LinearLayout
        addGoogleIntegrations()
        refreshStatuses()
        handleCallback(intent)
    }

    override fun onRetainCustomNonConfigurationInstance(): Any? = pendingProvider?.let { PendingOAuth(it, pendingState, pendingVerifier.orEmpty()) }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleCallback(intent)
    }

    private fun addGoogleIntegrations() {
        integrationRoot.addView(TextView(this).apply { text = "Google integrations"; textSize = 20f; setPadding(0, 28, 0, 8) })
        integrationStatus = TextView(this).apply { text = "Checking connections…"; setPadding(0, 4, 0, 8) }
        integrationContent = TextView(this).apply { textSize = 14f; setPadding(0, 8, 0, 8) }
        integrationRoot.addView(integrationStatus)
        listOf("calendar" to "Google Calendar", "classroom" to "Google Classroom").forEach { (provider, title) ->
            integrationRoot.addView(TextView(this).apply { text = title; textSize = 17f; setPadding(0, 16, 0, 4) })
            integrationRoot.addView(Button(this).apply { text = "Connect / Reconnect"; setOnClickListener { beginAuthorization(provider) } })
            integrationRoot.addView(Button(this).apply { text = "Refresh data"; setOnClickListener { loadProviderData(provider) } })
            integrationRoot.addView(Button(this).apply { text = "Disconnect"; setOnClickListener { disconnect(provider) } })
        }
        integrationRoot.addView(integrationContent, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun refreshStatuses() {
        val rows = mutableListOf<String>()
        listOf("calendar", "classroom").forEach { provider ->
            callable("getGoogleIntegrationStatus", mapOf("provider" to provider)) { result, error ->
                if (error != null) { integrationStatus.text = "Connection status unavailable. Sign in again and retry."; return@callable }
                val data = result as? Map<*, *>
                val label = if (data?.get("connected") == true) "Connected" else "Not connected"
                rows.add("${provider.replaceFirstChar(Char::uppercase)}: $label")
                integrationStatus.text = rows.sorted().joinToString("\n")
            }
        }
    }

    private fun beginAuthorization(provider: String) {
        val verifier = GoogleOAuthSupport.newVerifier()
        pendingProvider = provider
        pendingVerifier = verifier
        pendingState = null
        integrationContent.text = "Starting secure Google authorization…"
        callable("beginNativeGoogleAuthorization", mapOf("provider" to provider, "platform" to "android", "codeChallenge" to GoogleOAuthSupport.challenge(verifier))) { result, error ->
            if (error != null) return@callable failPending("Could not start Google authorization. Please try again.")
            val data = result as? Map<*, *> ?: return@callable failPending("Google authorization could not be started.")
            val url = runCatching { Uri.parse(data["authorizationUrl"] as? String) }.getOrNull()
            val state = data["state"] as? String
            val redirect = runCatching { Uri.parse(data["redirectUri"] as? String) }.getOrNull()
            val callbackHost = applicationInfo.metaData?.getString("com.example.overseer.GOOGLE_OAUTH_HOST")
            val challenge = GoogleOAuthSupport.challenge(verifier)
            val authState = url?.getQueryParameters("state")?.singleOrNull()
            val authChallenge = url?.getQueryParameters("code_challenge")?.singleOrNull()
            val authRedirect = url?.getQueryParameter("redirect_uri")
            if (url?.scheme != "https" || url.host != "accounts.google.com" || url.userInfo != null || state.isNullOrBlank() || authState != state || authChallenge != challenge || authRedirect != redirect.toString() || redirect?.scheme != "https" || redirect.host != callbackHost || redirect.path != "/oauth/android" || redirect.userInfo != null || redirect.fragment != null || (redirect.port != -1 && redirect.port != 443)) {
                return@callable failPending("Google authorization configuration is incomplete.")
            }
            pendingState = state
            try { CustomTabsIntent.Builder().build().launchUrl(this, url) }
            catch (_: Exception) { failPending("A browser could not be opened for Google authorization.") }
        }
    }

    private fun handleCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        val expectedHost = applicationInfo.metaData?.getString("com.example.overseer.GOOGLE_OAUTH_HOST") ?: return
        val callback = GoogleOAuthSupport.parseCallback(uri.toString(), expectedHost) ?: return
        if (callback.state != pendingState || pendingProvider == null || pendingVerifier == null) {
            integrationContent.text = "This authorization attempt expired or does not match this sign-in. Start again."
            clearPending(); return
        }
        if (callback.error != null) { failPending("Google authorization was cancelled or denied."); return }
        val provider = pendingProvider!!
        val verifier = pendingVerifier!!
        integrationContent.text = "Completing secure connection…"
        callable("completeNativeGoogleAuthorization", mapOf("provider" to provider, "platform" to "android", "state" to callback.state, "code" to callback.code.orEmpty(), "codeVerifier" to verifier)) { result, error ->
            if (error != null) failPending("Google could not complete the connection. Start a new attempt.")
            else {
                val email = (result as? Map<*, *>)?.get("accountEmail") as? String
                integrationContent.text = if (email.isNullOrBlank()) "${provider.replaceFirstChar(Char::uppercase)} connected." else "${provider.replaceFirstChar(Char::uppercase)} connected for $email."
                clearPending(); refreshStatuses()
            }
        }
    }

    private fun loadProviderData(provider: String) {
        integrationContent.text = "Loading ${provider} data…"
        val function = if (provider == "calendar") "getGoogleCalendarEvents" else "getGoogleClassroomData"
        val args: Map<String, Any> = if (provider == "calendar") mapOf("timeMin" to java.time.Instant.now().minusSeconds(7 * 86400).toString(), "timeMax" to java.time.Instant.now().plusSeconds(31 * 86400).toString()) else emptyMap()
        callable(function, args) { result, error ->
            if (error != null) { integrationContent.text = "Google data could not be loaded. Check the connection and try again."; return@callable }
            integrationContent.text = runCatching { JSONObject(result as Map<*, *>).toString(2) }.getOrDefault("No Google data was returned.")
        }
    }

    private fun disconnect(provider: String) {
        callable("disconnectGoogleIntegration", mapOf("provider" to provider)) { _, error ->
            integrationContent.text = if (error == null) "${provider.replaceFirstChar(Char::uppercase)} disconnected from Overseer." else "Could not disconnect. Please retry."
            refreshStatuses()
        }
    }

    private fun failPending(message: String) { integrationContent.text = message; clearPending() }
    private fun clearPending() { pendingProvider = null; pendingState = null; pendingVerifier = null }
    private fun callable(name: String, data: Map<String, Any>, done: (Any?, Exception?) -> Unit) {
        val provider = data["provider"] as? String
        val (method, path) = when (name) {
            "beginNativeGoogleAuthorization" -> "POST" to "/v1/google/native/android/authorize"
            "completeNativeGoogleAuthorization" -> "POST" to "/v1/google/native/android/complete"
            "getGoogleIntegrationStatus" -> "GET" to GoogleWorkerClient.path(provider.orEmpty(), "/status")
            "disconnectGoogleIntegration" -> "DELETE" to GoogleWorkerClient.path(provider.orEmpty())
            "getGoogleCalendarEvents" -> {
                val query = data.entries.joinToString("&") { "${java.net.URLEncoder.encode(it.key, "UTF-8")}=${java.net.URLEncoder.encode(it.value.toString(), "UTF-8")}" }
                "GET" to GoogleWorkerClient.path("calendar", "/events?$query")
            }
            "getGoogleClassroomData" -> "GET" to GoogleWorkerClient.path("classroom", "/courses")
            else -> { done(null, IllegalArgumentException("Unsupported integration operation.")); return }
        }
        GoogleWorkerClient.async(this, method, path, data) { result, error -> done(result, error) }
    }

    private fun openAuth() {
        startActivity(Intent(this, AuthActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK })
        finish()
    }

}
