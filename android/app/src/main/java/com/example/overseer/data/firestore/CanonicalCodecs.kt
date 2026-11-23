package com.example.overseer.data.firestore

import com.google.firebase.Timestamp

class ContractDecodeException(message: String) : IllegalArgumentException(message)

/** Strict, explicit codecs for user product documents. IDs always come from the document path. */
object CanonicalCodecs {
    private fun fail(type: String, field: String? = null): Nothing = throw ContractDecodeException(
        if (field == null) "Invalid canonical $type document." else "Invalid canonical $type document field: $field.",
    )

    private fun checkId(id: String, type: String) {
        if (id.isBlank() || '/' in id) fail(type, "documentId")
    }

    private fun checkSchema(data: Map<String, Any?>, expected: Int, type: String) {
        if (integer(data, "schemaVersion", type) != expected) fail(type, "schemaVersion")
    }

    private fun has(data: Map<String, Any?>, key: String, type: String): Any? {
        if (!data.containsKey(key)) fail(type, key)
        return data[key]
    }

    private fun string(data: Map<String, Any?>, key: String, type: String): String =
        (has(data, key, type) as? String) ?: fail(type, key)

    private fun nonEmptyString(data: Map<String, Any?>, key: String, type: String): String =
        string(data, key, type).also { if (it.isBlank()) fail(type, key) }

    private fun nullableString(data: Map<String, Any?>, key: String, type: String): String? =
        when (val value = has(data, key, type)) {
            null -> null
            is String -> value
            else -> fail(type, key)
        }

    private fun bool(data: Map<String, Any?>, key: String, type: String): Boolean =
        has(data, key, type) as? Boolean ?: fail(type, key)

    private fun number(data: Map<String, Any?>, key: String, type: String): Double {
        val value = has(data, key, type) as? Number ?: fail(type, key)
        return value.toDouble().also { if (!it.isFinite()) fail(type, key) }
    }

    private fun integer(data: Map<String, Any?>, key: String, type: String): Int {
        val value = number(data, key, type)
        if (value % 1.0 != 0.0 || value < Int.MIN_VALUE || value > Int.MAX_VALUE) fail(type, key)
        return value.toInt()
    }

    private fun timestamp(data: Map<String, Any?>, key: String, type: String): Timestamp =
        has(data, key, type) as? Timestamp ?: fail(type, key)

    private fun nullableTimestamp(data: Map<String, Any?>, key: String, type: String): Timestamp? =
        when (val value = has(data, key, type)) {
            null -> null
            is Timestamp -> value
            else -> fail(type, key)
        }

    private fun <T> enumValue(data: Map<String, Any?>, key: String, type: String, parse: (String) -> T?): T =
        parse(string(data, key, type)) ?: fail(type, key)

    private fun lifecycle(data: Map<String, Any?>, type: String): Triple<DeletionStatus, String?, Timestamp?> {
        val status = enumValue(data, "deletionStatus", type, DeletionStatus::fromWire)
        val jobId = nullableString(data, "deletionJobId", type)
        val startedAt = nullableTimestamp(data, "deletionStartedAt", type)
        when (status) {
            DeletionStatus.ACTIVE -> if (jobId != null || startedAt != null) fail(type, "deletionLifecycle")
            DeletionStatus.DELETING -> if (jobId.isNullOrBlank() || startedAt == null) fail(type, "deletionLifecycle")
        }
        return Triple(status, jobId, startedAt)
    }

    private fun isDateOnly(value: String): Boolean = try {
        val parts = value.split('-')
        if (parts.size != 3 || parts[0].length != 4 || parts[1].length != 2 || parts[2].length != 2) false
        else {
            val year = parts[0].toInt()
            val month = parts[1].toInt()
            val day = parts[2].toInt()
            if (year !in 1..9999) false else java.time.LocalDate.of(year, month, day).toString() == value
        }
    } catch (_: RuntimeException) { false }

    private fun isAfter(later: Timestamp, earlier: Timestamp): Boolean =
        later.seconds > earlier.seconds || (later.seconds == earlier.seconds && later.nanoseconds > earlier.nanoseconds)

    private fun metadata(model: UserProfile): MutableMap<String, Any?> = linkedMapOf(
        "schemaVersion" to FIRESTORE_SCHEMA_VERSION,
        "createdAt" to model.createdAt,
        "updatedAt" to model.updatedAt,
    )

    private fun baseMap(schemaVersion: Int, createdAt: Timestamp, updatedAt: Timestamp) = linkedMapOf<String, Any?>(
        "schemaVersion" to schemaVersion,
        "createdAt" to createdAt,
        "updatedAt" to updatedAt,
    )

    fun decodeUserProfile(id: String, data: Map<String, Any?>): UserProfile {
        checkId(id, "user profile"); checkSchema(data, 1, "user profile")
        return UserProfile(id, timestamp(data, "createdAt", "user profile"), timestamp(data, "updatedAt", "user profile"), string(data, "displayName", "user profile"))
    }

    fun encodeUserProfile(model: UserProfile): Map<String, Any?> {
        checkId(model.id, "user profile")
        return baseMap(1, model.createdAt, model.updatedAt).apply { put("displayName", model.displayName) }
    }

    fun decodeCourse(id: String, data: Map<String, Any?>): Course {
        checkId(id, "course"); checkSchema(data, 2, "course")
        val (status, jobId, startedAt) = lifecycle(data, "course")
        return Course(id, timestamp(data, "createdAt", "course"), timestamp(data, "updatedAt", "course"),
            string(data, "name", "course"), string(data, "code", "course"), string(data, "description", "course"),
            string(data, "instructor", "course"), enumValue(data, "tint", "course", CourseTint::fromWire),
            number(data, "sortOrder", "course"), status, jobId, startedAt)
    }

    fun encodeCourseCreate(model: Course): Map<String, Any?> {
        checkId(model.id, "course")
        if (model.deletionStatus != DeletionStatus.ACTIVE || model.deletionJobId != null || model.deletionStartedAt != null) fail("course", "deletionLifecycle")
        return baseMap(2, model.createdAt, model.updatedAt).apply {
            put("name", model.name); put("code", model.code); put("description", model.description)
            put("instructor", model.instructor); put("tint", model.tint.wireValue); put("sortOrder", model.sortOrder)
            put("deletionStatus", "active"); put("deletionJobId", null); put("deletionStartedAt", null)
        }
    }

    /** Mutable fields only. Lifecycle and createdAt can never be changed by a client update. */
    fun encodeCourseUpdate(model: Course): Map<String, Any?> {
        checkId(model.id, "course")
        return linkedMapOf("name" to model.name, "code" to model.code, "description" to model.description,
            "instructor" to model.instructor, "tint" to model.tint.wireValue, "sortOrder" to model.sortOrder,
            "updatedAt" to model.updatedAt)
    }

    fun decodeLesson(id: String, data: Map<String, Any?>): Lesson {
        checkId(id, "lesson"); checkSchema(data, 1, "lesson")
        return Lesson(id, timestamp(data, "createdAt", "lesson"), timestamp(data, "updatedAt", "lesson"),
            nonEmptyString(data, "courseId", "lesson"), string(data, "title", "lesson"), string(data, "description", "lesson"),
            string(data, "content", "lesson"), bool(data, "completed", "lesson"), number(data, "sortOrder", "lesson"))
    }

    fun encodeLesson(model: Lesson): Map<String, Any?> {
        checkId(model.id, "lesson"); if (model.courseId.isBlank()) fail("lesson", "courseId")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("courseId", model.courseId); put("title", model.title); put("description", model.description)
            put("content", model.content); put("completed", model.completed); put("sortOrder", model.sortOrder)
        }
    }

    fun decodeStudyMaterial(id: String, data: Map<String, Any?>): StudyMaterial {
        checkId(id, "study material"); checkSchema(data, 1, "study material")
        return StudyMaterial(id, timestamp(data, "createdAt", "study material"), timestamp(data, "updatedAt", "study material"),
            string(data, "title", "study material"), string(data, "content", "study material"), string(data, "fileName", "study material"),
            nullableString(data, "courseId", "study material"), number(data, "sortOrder", "study material"))
    }

    fun encodeStudyMaterial(model: StudyMaterial): Map<String, Any?> {
        checkId(model.id, "study material")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("title", model.title); put("content", model.content); put("fileName", model.fileName)
            put("courseId", model.courseId); put("sortOrder", model.sortOrder)
        }
    }

    fun decodeTask(id: String, data: Map<String, Any?>): Task {
        checkId(id, "task"); checkSchema(data, 2, "task")
        val dueAt = nullableTimestamp(data, "dueAt", "task")
        val dueDate = nullableString(data, "dueDate", "task")
        val zone = nullableString(data, "timeZoneId", "task")
        if (dueAt != null && (dueDate != null || zone.isNullOrBlank())) fail("task", "deadline")
        if (dueDate != null && (!isDateOnly(dueDate) || dueAt != null || zone != null)) fail("task", "deadline")
        if (dueAt == null && dueDate == null && zone != null) fail("task", "deadline")
        val (status, jobId, startedAt) = lifecycle(data, "task")
        return Task(id, timestamp(data, "createdAt", "task"), timestamp(data, "updatedAt", "task"),
            string(data, "title", "task"), string(data, "description", "task"), dueAt, dueDate, zone,
            enumValue(data, "priority", "task", Priority::fromWire), nullableString(data, "courseId", "task"),
            bool(data, "completed", "task"), nullableTimestamp(data, "completedAt", "task"), number(data, "sortOrder", "task"),
            status, jobId, startedAt)
    }

    fun encodeTaskCreate(model: Task): Map<String, Any?> {
        checkId(model.id, "task")
        if (model.deletionStatus != DeletionStatus.ACTIVE || model.deletionJobId != null || model.deletionStartedAt != null) fail("task", "deletionLifecycle")
        if (model.dueAt != null && (model.dueDate != null || model.timeZoneId.isNullOrBlank())) fail("task", "deadline")
        if (model.dueDate != null && (!isDateOnly(model.dueDate) || model.dueAt != null || model.timeZoneId != null)) fail("task", "deadline")
        if (model.dueAt == null && model.dueDate == null && model.timeZoneId != null) fail("task", "deadline")
        return taskMutableFields(model).apply {
            putAll(baseMap(2, model.createdAt, model.updatedAt))
            put("deletionStatus", "active"); put("deletionJobId", null); put("deletionStartedAt", null)
        }
    }

    /** Mutable fields only. A repository must use this for updates, never a full replacement map. */
    fun encodeTaskUpdate(model: Task): Map<String, Any?> {
        checkId(model.id, "task")
        return taskMutableFields(model)
    }

    private fun taskMutableFields(model: Task) = linkedMapOf<String, Any?>(
        "title" to model.title, "description" to model.description, "dueAt" to model.dueAt,
        "dueDate" to model.dueDate, "timeZoneId" to model.timeZoneId, "priority" to model.priority.wireValue,
        "courseId" to model.courseId, "completed" to model.completed, "completedAt" to model.completedAt,
        "sortOrder" to model.sortOrder, "updatedAt" to model.updatedAt,
    )

    fun decodeScheduleEvent(id: String, data: Map<String, Any?>): ScheduleEvent {
        checkId(id, "event"); checkSchema(data, 1, "event")
        val start = timestamp(data, "startAt", "event"); val end = timestamp(data, "endAt", "event")
        if (!isAfter(end, start)) fail("event", "endAt")
        val startChoice = nullableString(data, "startTimeDisambiguation", "event")?.let { EndpointDisambiguation.fromWire(it) ?: fail("event", "startTimeDisambiguation") }
        val endChoice = nullableString(data, "endTimeDisambiguation", "event")?.let { EndpointDisambiguation.fromWire(it) ?: fail("event", "endTimeDisambiguation") }
        return ScheduleEvent(id, timestamp(data, "createdAt", "event"), timestamp(data, "updatedAt", "event"),
            string(data, "title", "event"), string(data, "description", "event"), start, end,
            nonEmptyString(data, "timeZoneId", "event"), enumValue(data, "type", "event", EventType::fromWire),
            nullableString(data, "courseId", "event"), string(data, "location", "event"),
            enumValue(data, "color", "event", EventColor::fromWire), startChoice, endChoice)
    }

    fun encodeScheduleEvent(model: ScheduleEvent): Map<String, Any?> {
        checkId(model.id, "event"); if (!isAfter(model.endAt, model.startAt)) fail("event", "endAt")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("title", model.title); put("description", model.description); put("startAt", model.startAt); put("endAt", model.endAt)
            put("timeZoneId", model.timeZoneId); put("type", model.type.wireValue); put("courseId", model.courseId)
            put("location", model.location); put("color", model.color.wireValue)
            put("startTimeDisambiguation", model.startTimeDisambiguation?.wireValue)
            put("endTimeDisambiguation", model.endTimeDisambiguation?.wireValue)
        }
    }

    fun decodePlannerBlock(id: String, data: Map<String, Any?>): PlannerBlock {
        checkId(id, "planner block"); checkSchema(data, 1, "planner block")
        val start = timestamp(data, "startAt", "planner block"); val end = timestamp(data, "endAt", "planner block")
        if (!isAfter(end, start)) fail("planner block", "endAt")
        return PlannerBlock(id, timestamp(data, "createdAt", "planner block"), timestamp(data, "updatedAt", "planner block"),
            string(data, "title", "planner block"), start, end, nonEmptyString(data, "timeZoneId", "planner block"),
            nullableString(data, "taskId", "planner block"), nullableString(data, "courseId", "planner block"),
            bool(data, "completed", "planner block"), number(data, "sortOrder", "planner block"))
    }

    fun encodePlannerBlock(model: PlannerBlock): Map<String, Any?> {
        checkId(model.id, "planner block"); if (!isAfter(model.endAt, model.startAt)) fail("planner block", "endAt")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("title", model.title); put("startAt", model.startAt); put("endAt", model.endAt); put("timeZoneId", model.timeZoneId)
            put("taskId", model.taskId); put("courseId", model.courseId); put("completed", model.completed); put("sortOrder", model.sortOrder)
        }
    }

    fun decodeFocusSession(id: String, data: Map<String, Any?>): FocusSession {
        checkId(id, "focus session"); checkSchema(data, 1, "focus session")
        val duration = integer(data, "durationSeconds", "focus session")
        if (duration <= 0 || !bool(data, "completed", "focus session")) fail("focus session", "completed/durationSeconds")
        return FocusSession(id, timestamp(data, "createdAt", "focus session"), timestamp(data, "updatedAt", "focus session"),
            enumValue(data, "mode", "focus session", FocusMode::fromWire), timestamp(data, "startedAt", "focus session"),
            timestamp(data, "endedAt", "focus session"), duration, nullableString(data, "courseId", "focus session"),
            nullableString(data, "taskId", "focus session"), true)
    }

    fun encodeFocusSession(model: FocusSession): Map<String, Any?> {
        checkId(model.id, "focus session"); if (model.durationSeconds <= 0 || !model.completed) fail("focus session", "completed/durationSeconds")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("mode", model.mode.wireValue); put("startedAt", model.startedAt); put("endedAt", model.endedAt)
            put("durationSeconds", model.durationSeconds); put("courseId", model.courseId); put("taskId", model.taskId); put("completed", true)
        }
    }

    fun decodeUserPreferences(id: String, data: Map<String, Any?>): UserPreferences {
        checkId(id, "preferences"); checkSchema(data, 1, "preferences")
        val timeFormat = string(data, "timeFormat", "preferences")
        val weekStart = integer(data, "firstDayOfWeek", "preferences")
        if (timeFormat !in setOf("12h", "24h") || weekStart !in 0..1) fail("preferences", "timeFormat/firstDayOfWeek")
        return UserPreferences(id, timestamp(data, "createdAt", "preferences"), timestamp(data, "updatedAt", "preferences"),
            string(data, "displayName", "preferences"), timeFormat, weekStart, nonEmptyString(data, "timeZoneId", "preferences"),
            bool(data, "aiWorkspaceContextConsent", "preferences"), nullableTimestamp(data, "consentedAt", "preferences"),
            nullableTimestamp(data, "revokedAt", "preferences"), nullableString(data, "consentVersion", "preferences"))
    }

    fun encodeUserPreferences(model: UserPreferences): Map<String, Any?> {
        checkId(model.id, "preferences"); if (model.timeFormat !in setOf("12h", "24h") || model.firstDayOfWeek !in 0..1 || model.timeZoneId.isBlank()) fail("preferences")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("displayName", model.displayName); put("timeFormat", model.timeFormat); put("firstDayOfWeek", model.firstDayOfWeek)
            put("timeZoneId", model.timeZoneId); put("aiWorkspaceContextConsent", model.aiWorkspaceContextConsent)
            put("consentedAt", model.consentedAt); put("revokedAt", model.revokedAt); put("consentVersion", model.consentVersion)
        }
    }

    fun decodeTimerPreferences(id: String, data: Map<String, Any?>): TimerPreferences {
        checkId(id, "timer preferences"); checkSchema(data, 1, "timer preferences")
        val focus = integer(data, "focusDurationSeconds", "timer preferences")
        val short = integer(data, "shortBreakDurationSeconds", "timer preferences")
        val long = integer(data, "longBreakDurationSeconds", "timer preferences")
        if (focus <= 0 || short <= 0 || long <= 0) fail("timer preferences", "duration")
        return TimerPreferences(id, timestamp(data, "createdAt", "timer preferences"), timestamp(data, "updatedAt", "timer preferences"), focus, short, long)
    }

    fun encodeTimerPreferences(model: TimerPreferences): Map<String, Any?> {
        checkId(model.id, "timer preferences"); if (model.focusDurationSeconds <= 0 || model.shortBreakDurationSeconds <= 0 || model.longBreakDurationSeconds <= 0) fail("timer preferences", "duration")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("focusDurationSeconds", model.focusDurationSeconds); put("shortBreakDurationSeconds", model.shortBreakDurationSeconds); put("longBreakDurationSeconds", model.longBreakDurationSeconds)
        }
    }

    fun decodeActiveFocusTimer(id: String, data: Map<String, Any?>): ActiveFocusTimer {
        checkId(id, "focus timer"); checkSchema(data, 1, "focus timer")
        val status = enumValue(data, "status", "focus timer", TimerStatus::fromWire)
        val mode = enumValue(data, "mode", "focus timer", FocusMode::fromWire)
        val duration = integer(data, "durationSeconds", "focus timer"); val remaining = integer(data, "remainingSeconds", "focus timer")
        val elapsed = integer(data, "elapsedSeconds", "focus timer"); val generation = integer(data, "generation", "focus timer")
        val writeGeneration = integer(data, "writeGeneration", "focus timer")
        if (duration <= 0 || remaining < 0 || elapsed < 0 || generation < 0 || writeGeneration < 0) fail("focus timer", "duration/generation")
        return ActiveFocusTimer(id, timestamp(data, "createdAt", "focus timer"), timestamp(data, "updatedAt", "focus timer"), status, mode,
            duration, remaining, elapsed, generation, writeGeneration, nullableTimestamp(data, "startedAt", "focus timer"),
            nullableTimestamp(data, "segmentStartedAt", "focus timer"), nullableTimestamp(data, "endsAt", "focus timer"),
            nullableString(data, "courseId", "focus timer"), nullableString(data, "taskId", "focus timer"), nullableString(data, "runId", "focus timer"))
    }

    fun encodeActiveFocusTimer(model: ActiveFocusTimer): Map<String, Any?> {
        checkId(model.id, "focus timer"); if (model.durationSeconds <= 0 || model.remainingSeconds < 0 || model.elapsedSeconds < 0 || model.generation < 0 || model.writeGeneration < 0) fail("focus timer")
        return baseMap(1, model.createdAt, model.updatedAt).apply {
            put("status", model.status.wireValue); put("mode", model.mode.wireValue); put("durationSeconds", model.durationSeconds)
            put("remainingSeconds", model.remainingSeconds); put("elapsedSeconds", model.elapsedSeconds); put("generation", model.generation)
            put("writeGeneration", model.writeGeneration); put("startedAt", model.startedAt); put("segmentStartedAt", model.segmentStartedAt)
            put("endsAt", model.endsAt); put("courseId", model.courseId); put("taskId", model.taskId); put("runId", model.runId)
        }
    }
}
