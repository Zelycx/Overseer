package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.PlannerBlock
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

class PlannerActivity : AppCompatActivity() {
    private var listener: ListenerRegistration? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) { openAuth(); return }
        setContentView(R.layout.activity_planner)
        val list = findViewById<LinearLayout>(R.id.plannerList)
        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())
        listener = repository.observeCollection(
            "plannerBlocks",
            decoder = { id, data -> CanonicalCodecs.decodePlannerBlock(id, data) },
            onValue = { rows ->
                @Suppress("UNCHECKED_CAST")
                val blocks = rows as List<PlannerBlock>
                list.removeAllViews()
                if (blocks.isEmpty()) {
                    val empty = TextView(this)
                    empty.text = "No planned blocks yet."
                    list.addView(empty)
                }
                blocks.sortedBy { it.startAt.seconds }.forEach { block ->
                    val zone = runCatching { ZoneId.of(block.timeZoneId) }.getOrElse { ZoneId.systemDefault() }
                    val start = Instant.ofEpochSecond(block.startAt.seconds, block.startAt.nanoseconds.toLong()).atZone(zone)
                    val end = Instant.ofEpochSecond(block.endAt.seconds, block.endAt.nanoseconds.toLong()).atZone(zone)
                    val formatter = DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a")
                    val row = TextView(this)
                    row.text = "${block.title}\n${formatter.format(start)} – ${DateTimeFormatter.ofPattern("h:mm a").format(end)}"
                    row.setPadding(24, 24, 24, 24)
                    list.addView(row)
                }
            },
            onError = { cause ->
                val error = TextView(this)
                error.text = cause.localizedMessage ?: "Unable to load planner"
                list.addView(error)
            },
        )
        findViewById<android.widget.Button>(R.id.newBlockButton).setOnClickListener { showCreate(repository) }
    }

    private fun showCreate(repository: AuthenticatedFirestoreRepository) {
        val title = EditText(this)
        title.hint = "Block title"
        AlertDialog.Builder(this)
            .setTitle("Add planned block")
            .setView(title)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Add") { _, _ ->
                val value = title.text.toString().trim()
                if (value.isEmpty()) return@setPositiveButton
                val now = Timestamp.now()
                val end = Timestamp(now.seconds + 3600, now.nanoseconds)
                val model = PlannerBlock(
                    id = "block-" + UUID.randomUUID(),
                    createdAt = now,
                    updatedAt = now,
                    title = value,
                    startAt = now,
                    endAt = end,
                    timeZoneId = java.util.TimeZone.getDefault().id,
                    taskId = null,
                    courseId = null,
                    completed = false,
                    sortOrder = 0.0,
                )
                repository.createPlannerBlock(model)
            }.show()
    }
    override fun onDestroy() { listener?.remove(); listener = null; super.onDestroy() }
    private fun openAuth() {
        startActivity(Intent(this, AuthActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK })
        finish()
    }
}
