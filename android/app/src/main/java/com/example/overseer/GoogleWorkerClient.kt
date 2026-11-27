package com.example.overseer

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

internal object GoogleWorkerClient {
    data class WorkerFailure(val code: String, val message: String, val retryable: Boolean, val payload: Map<String, Any?>)
    class GoogleWorkerException(val status: Int, val code: String, message: String, val retryable: Boolean, val payload: Map<String, Any?>) : Exception(message)
    enum class CursorRecovery { KEEP_FOR_RETRY, RESTART_FROM_BEGINNING }
    private val executor = Executors.newSingleThreadExecutor()

    fun request(context: Context, method: String, path: String, payload: Map<String, Any> = emptyMap()): Map<String, Any?> {
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to Overseer before using Google integrations.")
        val token = Tasks.await(user.getIdToken(false)).token ?: error("Firebase authentication token is unavailable.")
        val base = BuildConfig.GOOGLE_WORKER_URL.trimEnd('/')
        require(base.startsWith("https://")) { "Set the Google Worker HTTPS URL in the Android Gradle property googleWorkerUrl." }
        val connection = URL(base + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (method == "POST") {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(JSONObject(payload).toString().toByteArray(Charsets.UTF_8)) }
            }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (connection.responseCode !in 200..299) {
                val failure = parseWorkerFailure(connection.responseCode, raw)
                throw GoogleWorkerException(connection.responseCode, failure.code, failure.message, failure.retryable, failure.payload)
            }
            return JSONObject(raw).toMap()
        } finally { connection.disconnect() }
    }

    internal fun parseWorkerFailure(status: Int, raw: String): WorkerFailure {
        val payload = runCatching { JSONObject(raw).toMap() }.getOrDefault(emptyMap())
        return parseWorkerFailure(status, payload)
    }

    internal fun parseWorkerFailure(status: Int, payload: Map<String, Any?>): WorkerFailure {
        val error = payload["error"] as? Map<*, *>
        val code = error?.get("code") as? String ?: "HTTP_$status"
        val message = error?.get("message") as? String ?: error?.get("error") as? String ?: payload["error"] as? String ?: "Google integration request failed ($status)."
        return WorkerFailure(code, message, (error?.get("retryable") as? Boolean) ?: (status >= 500), payload)
    }

    internal fun cursorRecovery(error: GoogleWorkerException): CursorRecovery =
        if (error.code == "INVALID_PAGE_CURSOR" || !error.retryable) CursorRecovery.RESTART_FROM_BEGINNING else CursorRecovery.KEEP_FOR_RETRY

    fun async(context: Context, method: String, path: String, payload: Map<String, Any> = emptyMap(), done: (Map<String, Any?>?, Exception?) -> Unit) {
        executor.execute {
            val result = runCatching { request(context.applicationContext, method, path, payload) }
            (context as? android.app.Activity)?.runOnUiThread { done(result.getOrNull(), result.exceptionOrNull() as? Exception) }
        }
    }

    fun path(provider: String, suffix: String = ""): String = "/v1/google/$provider$suffix"
    private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
        when (val value = opt(key)) {
            JSONObject.NULL -> null
            is JSONObject -> value.toMap()
            is JSONArray -> (0 until value.length()).map { index -> value.opt(index).let { item -> if (item is JSONObject) item.toMap() else if (item === JSONObject.NULL) null else item } }
            else -> value
        }
    }
}
