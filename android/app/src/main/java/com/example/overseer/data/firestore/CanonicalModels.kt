package com.example.overseer.data.firestore

import com.google.firebase.Timestamp

const val FIRESTORE_SCHEMA_VERSION = 1
const val FIRESTORE_SCHEMA_VERSION_V2 = 2

enum class Priority(val wireValue: String) {
    LOW("Low"), MEDIUM("Medium"), HIGH("High");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class CourseTint(val wireValue: String) {
    LAVENDER("lavender"), MINT("mint"), SAND("sand");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class EventType(val wireValue: String) {
    CLASS("class"), STUDY("study"), PERSONAL("personal"), OTHER("other");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class EventColor(val wireValue: String) {
    NAVY("navy"), LIME("lime"), BLUE("blue"), AMBER("amber");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class FocusMode(val wireValue: String) {
    FOCUS("focus"), SHORT_BREAK("shortBreak"), LONG_BREAK("longBreak");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class TimerStatus(val wireValue: String) {
    IDLE("idle"), RUNNING("running"), PAUSED("paused");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class DeletionStatus(val wireValue: String) {
    ACTIVE("active"), DELETING("deleting");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

enum class EndpointDisambiguation(val wireValue: String) {
    EARLIER("earlier"), LATER("later");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireValue == value } }
}

data class UserProfile(val id: String, val createdAt: Timestamp, val updatedAt: Timestamp, val displayName: String)

data class Course(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val name: String,
    val code: String,
    val description: String,
    val instructor: String,
    val tint: CourseTint,
    val sortOrder: Double,
    val deletionStatus: DeletionStatus,
    val deletionJobId: String?,
    val deletionStartedAt: Timestamp?,
)

data class Lesson(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val courseId: String,
    val title: String,
    val description: String,
    val content: String,
    val completed: Boolean,
    val sortOrder: Double,
)

data class StudyMaterial(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val title: String,
    val content: String,
    val fileName: String,
    val courseId: String?,
    val sortOrder: Double,
)

data class Task(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val title: String,
    val description: String,
    val dueAt: Timestamp?,
    val dueDate: String?,
    val timeZoneId: String?,
    val priority: Priority,
    val courseId: String?,
    val completed: Boolean,
    val completedAt: Timestamp?,
    val sortOrder: Double,
    val deletionStatus: DeletionStatus,
    val deletionJobId: String?,
    val deletionStartedAt: Timestamp?,
)

data class ScheduleEvent(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val title: String,
    val description: String,
    val startAt: Timestamp,
    val endAt: Timestamp,
    val timeZoneId: String,
    val type: EventType,
    val courseId: String?,
    val location: String,
    val color: EventColor,
    val startTimeDisambiguation: EndpointDisambiguation?,
    val endTimeDisambiguation: EndpointDisambiguation?,
)

data class PlannerBlock(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val title: String,
    val startAt: Timestamp,
    val endAt: Timestamp,
    val timeZoneId: String,
    val taskId: String?,
    val courseId: String?,
    val completed: Boolean,
    val sortOrder: Double,
)

data class FocusSession(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val mode: FocusMode,
    val startedAt: Timestamp,
    val endedAt: Timestamp,
    val durationSeconds: Int,
    val courseId: String?,
    val taskId: String?,
    val completed: Boolean,
)

data class UserPreferences(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val displayName: String,
    val timeFormat: String,
    val firstDayOfWeek: Int,
    val timeZoneId: String,
    val aiWorkspaceContextConsent: Boolean,
    val consentedAt: Timestamp?,
    val revokedAt: Timestamp?,
    val consentVersion: String?,
)

data class TimerPreferences(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val focusDurationSeconds: Int,
    val shortBreakDurationSeconds: Int,
    val longBreakDurationSeconds: Int,
)

data class ActiveFocusTimer(
    val id: String,
    val createdAt: Timestamp,
    val updatedAt: Timestamp,
    val status: TimerStatus,
    val mode: FocusMode,
    val durationSeconds: Int,
    val remainingSeconds: Int,
    val elapsedSeconds: Int,
    val generation: Int,
    val writeGeneration: Int,
    val startedAt: Timestamp?,
    val segmentStartedAt: Timestamp?,
    val endsAt: Timestamp?,
    val courseId: String?,
    val taskId: String?,
    val runId: String?,
)
