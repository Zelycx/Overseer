package com.example.overseer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object FocusAlarmScheduler {

    fun schedule(context: Context, endTimeMillis: Long) {

        val alarmManager = context.getSystemService(
            Context.ALARM_SERVICE
        ) as AlarmManager

        val intent = Intent(
            context,
            FocusNotificationReceiver::class.java
        )

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            1001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            endTimeMillis,
            pendingIntent
        )
    }

    fun cancel(context: Context) {

        val intent = Intent(
            context,
            FocusNotificationReceiver::class.java
        )

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            1001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = context.getSystemService(
            Context.ALARM_SERVICE
        ) as AlarmManager

        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }
}
