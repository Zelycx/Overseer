package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.os.CountDownTimer
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.ActiveFocusTimer
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.FocusMode
import com.example.overseer.data.firestore.FocusSession
import com.example.overseer.data.firestore.TimerStatus
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.util.UUID
import java.time.Instant
import java.nio.charset.StandardCharsets

class FocusActivity : AppCompatActivity() {
    private var listener: ListenerRegistration? = null
    private var timer: CountDownTimer? = null
    private var state: ActiveFocusTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) { openAuth(); return }
        setContentView(R.layout.activity_focus)
        WorkspaceRepository.load(this)

        val display = findViewById<TextView>(R.id.focusTime)
        val status = findViewById<TextView>(R.id.focusStatus)
        val start = findViewById<Button>(R.id.focusStart)
        val pause = findViewById<Button>(R.id.focusPause)
        val reset = findViewById<Button>(R.id.focusReset)
        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())

        listener = repository.observeDocument(
            "focusTimer",
            "active",
            decoder = { id, data -> com.example.overseer.data.firestore.CanonicalCodecs.decodeActiveFocusTimer(id, data) },
            onValue = { model ->
                state = model
                render(display, status, model)
            },
            onError = { status.text = it.localizedMessage ?: "Unable to load timer" },
        )

        start.setOnClickListener {
            val now = Timestamp.now()
            val current = state ?: defaultTimer(now)
            val duration = current.remainingSeconds.takeIf { it > 0 } ?: current.durationSeconds
            val running = current.copy(
                status = TimerStatus.RUNNING,
                remainingSeconds = duration,
                elapsedSeconds = if (current.status == TimerStatus.PAUSED) current.elapsedSeconds else 0,
                startedAt = current.startedAt ?: now,
                segmentStartedAt = now,
                endsAt = Timestamp(now.seconds + duration, now.nanoseconds),
                writeGeneration = current.writeGeneration + 1,
            )
            repository.saveActiveFocusTimer(running)
            beginCountdown(running.remainingSeconds, display, status, repository)
        }
        pause.setOnClickListener {
            val current = state ?: return@setOnClickListener
            if (current.status != TimerStatus.RUNNING) return@setOnClickListener
            timer?.cancel()
            val remaining = display.text.toString().split(":").let { it[0].toIntOrNull()?.times(60)?.plus(it.getOrNull(1)?.toIntOrNull() ?: 0) ?: current.remainingSeconds }
            repository.saveActiveFocusTimer(current.copy(status = TimerStatus.PAUSED, remainingSeconds = remaining, segmentStartedAt = null, endsAt = null, writeGeneration = current.writeGeneration + 1))
        }
        reset.setOnClickListener {
            timer?.cancel()
            val current = state ?: defaultTimer(Timestamp.now())
            repository.saveActiveFocusTimer(defaultTimer(Timestamp.now()).copy(mode = current.mode, courseId = current.courseId, taskId = current.taskId))
        }
    }

    private fun beginCountdown(seconds: Int, display: TextView, status: TextView, repository: AuthenticatedFirestoreRepository) {
        timer?.cancel()
        timer = object : CountDownTimer(seconds * 1000L, 250L) {
            override fun onTick(millisUntilFinished: Long) {
                val remaining = ((millisUntilFinished + 999) / 1000).toInt()
                val minutes = remaining / 60
                val secs = remaining % 60
                display.text = "%02d:%02d".format(minutes, secs)
            }
            override fun onFinish() {
                val current = state
                if (current != null) {
                    val ended = Timestamp.now()
                    val session = FocusSession(
                        id = "session-" + UUID.randomUUID(),
                        createdAt = current.startedAt ?: ended,
                        updatedAt = ended,
                        mode = current.mode,
                        startedAt = current.startedAt ?: ended,
                        endedAt = ended,
                        durationSeconds = current.durationSeconds,
                        courseId = current.courseId,
                        taskId = current.taskId,
                        completed = true,
                    )
                    repository.createFocusSession(session)
                    repository.saveActiveFocusTimer(defaultTimer(ended).copy(mode = current.mode, courseId = current.courseId, taskId = current.taskId))
                }
                status.text = "Session complete"
            }
        }.start()
    }

    private fun render(display: TextView, status: TextView, model: ActiveFocusTimer) {
        val remaining = model.remainingSeconds
        display.text = "%02d:%02d".format(remaining / 60, remaining % 60)
        status.text = if (model.status == TimerStatus.RUNNING) "Running" else if (model.status == TimerStatus.PAUSED) "Paused" else "Ready"
    }

    private fun defaultTimer(now: Timestamp) = ActiveFocusTimer(
        id = "active",
        createdAt = now,
        updatedAt = now,
        status = TimerStatus.IDLE,
        mode = FocusMode.FOCUS,
        durationSeconds = 25 * 60,
        remainingSeconds = 25 * 60,
        elapsedSeconds = 0,
        generation = 1,
        writeGeneration = 1,
        startedAt = null,
        segmentStartedAt = null,
        endsAt = null,
        courseId = null,
        taskId = null,
        runId = null,
    )

    override fun onDestroy() {
        timer?.cancel()
        listener?.remove()
        listener = null
        super.onDestroy()
    }

    private fun openAuth() {
        startActivity(Intent(this, AuthActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })
        finish()
    }
}
