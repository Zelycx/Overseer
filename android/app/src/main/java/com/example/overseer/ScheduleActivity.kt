package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.example.overseer.data.firestore.AuthenticatedFirestoreRepository
import com.example.overseer.data.firestore.CanonicalCodecs
import com.example.overseer.data.firestore.ScheduleEvent
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale

class ScheduleActivity : AppCompatActivity() {
    private var eventListener: ListenerRegistration? = null
    private var events = emptyList<ScheduleEvent>()

    private lateinit var scheduleDate: TextView
    private lateinit var selectedDayDescription: TextView
    private lateinit var noClassesMessage: TextView
    private lateinit var classesContainer: LinearLayout

    private val calendar = Calendar.getInstance()

    private val preferences by lazy {
        getSharedPreferences("overseer_schedule", MODE_PRIVATE)
    }

    private val scheduleKey = "classes"

    private val days = listOf(
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            FirebaseApp.initializeApp(this)
        } catch (_: Exception) {
            openAuth()
            return
        }
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser == null) {
            openAuth()
            return
        }
        setContentView(R.layout.activity_schedule)

        val scheduleDate = findViewById<TextView>(R.id.scheduleDate)
        val firestoreEvents = findViewById<LinearLayout>(R.id.firestoreEvents)
        val noClassesMessage = findViewById<TextView>(R.id.noClassesMessage)
        val dateFormat = SimpleDateFormat("EEEE, MMMM d", Locale.getDefault())
        val calendar = Calendar.getInstance()

        fun updateDate() {
            scheduleDate.text = dateFormat.format(calendar.time).uppercase(Locale.getDefault())
            renderEvents(firestoreEvents, noClassesMessage, calendar)
        }

        findViewById<Button>(R.id.previousDayButton).setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, -1)
            updateDate()
        }
        findViewById<Button>(R.id.nextDayButton).setOnClickListener {
            calendar.add(Calendar.DAY_OF_MONTH, 1)
            updateDate()
        }

        val repository = AuthenticatedFirestoreRepository(FirebaseFirestore.getInstance())
        eventListener = repository.observeCollection(
            "events",
            decoder = { id, data -> CanonicalCodecs.decodeScheduleEvent(id, data) },
            onValue = { rows ->
                @Suppress("UNCHECKED_CAST")
                events = rows as List<ScheduleEvent>
                updateDate()
            },
            onError = { cause ->
                noClassesMessage.text = cause.localizedMessage ?: "Unable to load schedule"
                noClassesMessage.visibility = View.VISIBLE
            },
        )

        val bottomNavigation = findViewById<BottomNavigationView>(R.id.bottomNavigation)
        bottomNavigation.selectedItemId = R.id.nav_schedule
        bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> { startActivity(Intent(this, MainActivity::class.java)); finish(); true }
                R.id.nav_schedule -> true
                R.id.nav_profile -> { auth.signOut(); openAuth(); true }
                else -> false
            }
        }
        updateDate()
    }

    private fun renderEvents(container: LinearLayout, empty: TextView, calendar: Calendar) {
        container.removeAllViews()
        findViewById<View>(R.id.databaseClassCard).visibility = View.GONE
        findViewById<View>(R.id.programmingClassCard).visibility = View.GONE

        val dayStart = Calendar.getInstance().apply {
            timeInMillis = calendar.timeInMillis
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val dayEndMillis = dayStart.timeInMillis + 86_400_000L
        val dayEvents = events.filter { event ->
            val startMillis = event.startAt.seconds * 1000L + event.startAt.nanoseconds / 1_000_000L
            startMillis >= dayStart.timeInMillis && startMillis < dayEndMillis
        }.sortedBy { it.startAt.seconds }

        empty.visibility = if (dayEvents.isEmpty()) View.VISIBLE else View.GONE
        empty.text = "No events scheduled for this day."

        dayEvents.forEach { event ->
            val zone = runCatching { ZoneId.of(event.timeZoneId) }.getOrElse { ZoneId.systemDefault() }
            val start = Instant.ofEpochSecond(event.startAt.seconds, event.startAt.nanoseconds.toLong())
                .atZone(zone)
            val end = Instant.ofEpochSecond(event.endAt.seconds, event.endAt.nanoseconds.toLong())
                .atZone(zone)
            val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())
            val row = TextView(this)
            row.text = "${event.title}\n${timeFormatter.format(start)} – ${timeFormatter.format(end)}${if (event.location.isBlank()) "" else "\n${event.location}"}"
            row.setTextColor(getColor(R.color.overseer_navy))
            row.setPadding(24, 24, 24, 24)
            container.addView(row)
        }
    }

    override fun onDestroy() {
        eventListener?.remove()
        eventListener = null
        super.onDestroy()
    }

    private fun openAuth() {
        val intent = Intent(this, AuthActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
