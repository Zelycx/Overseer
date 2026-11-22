package com.example.overseer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class FocusNotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {

        val now = System.currentTimeMillis()
        var completed = false
        var completedMode = "focus"
        WorkspaceRepository.update(context) { data ->
            val timer = data.focusTimer
            if (timer.status != "running" || (timer.endsAt ?: Long.MAX_VALUE) > now) data
            else {
                completed = true
                completedMode = timer.mode
                val endedAt = java.time.Instant.ofEpochMilli(timer.endsAt ?: now).toString()
                val startedAt = timer.startedAt ?: endedAt
                val session = WorkspaceFocusSession(
                    "focus-${java.util.UUID.nameUUIDFromBytes(startedAt.toByteArray(Charsets.UTF_8))}",
                    timer.mode, startedAt, endedAt, timer.durationSeconds, timer.courseId, timer.taskId, true,
                )
                val sessions = if (data.focusSessions.any { it.id == session.id }) data.focusSessions else data.focusSessions + session
                data.copy(focusSessions = sessions, focusTimer = timer.copy(status = "idle", remainingSeconds = 0, elapsedSeconds = timer.durationSeconds, endsAt = null, startedAt = null, segmentStartedAt = null))
            }
        }
        if (!completed) return
        context.getSharedPreferences("overseer_focus", Context.MODE_PRIVATE).edit()
            .putBoolean("is_running", false).putLong("time_left", 0L).putLong("end_time", 0L).apply()

        val channelId = "focus_notifications"

        // Create notification channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Focus Sessions",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications when focus sessions finish"
            }

            val manager = context.getSystemService(
                Context.NOTIFICATION_SERVICE
            ) as NotificationManager

            manager.createNotificationChannel(channel)
        }

        // Build notification
        val modeName = when (completedMode) { "shortBreak" -> "Short break"; "longBreak" -> "Long break"; else -> "Focus session" }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("$modeName complete!")
            .setContentText("Great work! You've completed your $modeName.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        // Display notification
        NotificationManagerCompat.from(context)
            .notify(1001, notification)
    }
}
