package com.example.overseer.data.firestore

import com.google.firebase.Timestamp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalCodecsTest {
    private val createdAt = Timestamp(1_700_000_000L, 123_456_789)
    private val updatedAt = Timestamp(1_700_000_010L, 987_654_321)

    private fun metadata(version: Int = 1) = mutableMapOf<String, Any?>(
        "schemaVersion" to version,
        "createdAt" to createdAt,
        "updatedAt" to updatedAt,
    )

    private fun courseFields(version: Int = 2) = metadata(version).apply {
        put("name", "Biology"); put("code", "BIO-101"); put("description", "Cells")
        put("instructor", "Dr. Lee"); put("tint", "mint"); put("sortOrder", 2.5)
        put("deletionStatus", "active"); put("deletionJobId", null); put("deletionStartedAt", null)
    }

    private fun taskFields(version: Int = 2) = metadata(version).apply {
        put("title", "Read chapter"); put("description", "Chapter 4")
        put("dueAt", null); put("dueDate", "2024-02-29"); put("timeZoneId", null)
        put("priority", "High"); put("courseId", null); put("completed", false); put("completedAt", null)
        put("sortOrder", 0); put("deletionStatus", "active"); put("deletionJobId", null); put("deletionStartedAt", null)
    }

    @Test fun courseUsesPathIdAndNeverEncodesAnIdField() {
        val raw = courseFields().apply { put("id", "forged-id") }
        val decoded = CanonicalCodecs.decodeCourse("path-id", raw)

        assertEquals("path-id", decoded.id)
        assertEquals(2, raw["schemaVersion"])
        val encoded = CanonicalCodecs.encodeCourseCreate(decoded)
        assertFalse(encoded.containsKey("id"))
        assertEquals("active", encoded["deletionStatus"])
        assertNull(encoded["deletionJobId"])
        assertNull(encoded["deletionStartedAt"])
        assertEquals(createdAt.nanoseconds, (encoded["createdAt"] as Timestamp).nanoseconds)
    }

    @Test fun courseUpdatesCannotWriteTrustedLifecycleOrCreatedAtFields() {
        val model = CanonicalCodecs.decodeCourse("course-id", courseFields())
        val update = CanonicalCodecs.encodeCourseUpdate(model.copy(name = "Updated"))

        assertEquals(setOf("name", "code", "description", "instructor", "tint", "sortOrder", "updatedAt"), update.keys)
        assertFalse(update.containsKey("createdAt"))
        assertFalse(update.containsKey("deletionStatus"))
        assertFalse(update.containsKey("deletionJobId"))
        assertFalse(update.containsKey("deletionStartedAt"))
    }

    @Test fun courseAndTaskCreateRejectNonInitialDeletionState() {
        val course = CanonicalCodecs.decodeCourse("course-id", courseFields())
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.encodeCourseCreate(course.copy(deletionStatus = DeletionStatus.DELETING, deletionJobId = "job", deletionStartedAt = updatedAt))
        }

        val task = CanonicalCodecs.decodeTask("task-id", taskFields())
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.encodeTaskCreate(task.copy(deletionStatus = DeletionStatus.DELETING, deletionJobId = "job", deletionStartedAt = updatedAt))
        }
    }

    @Test fun taskDateOnlyDeadlineAndNullableFieldsRoundTripWithoutSyntheticTimestamp() {
        val task = CanonicalCodecs.decodeTask("task-id", taskFields())
        val encoded = CanonicalCodecs.encodeTaskCreate(task)

        assertEquals("2024-02-29", task.dueDate)
        assertNull(task.dueAt)
        assertNull(task.timeZoneId)
        assertNull(task.completedAt)
        assertNull(encoded["dueAt"])
        assertEquals("2024-02-29", encoded["dueDate"])
        assertNull(encoded["timeZoneId"])
        assertFalse(encoded.containsKey("id"))
    }

    @Test fun taskTimedDeadlineRequiresTimestampAndTimezoneOnly() {
        val timed = taskFields().apply {
            put("dueAt", updatedAt); put("dueDate", null); put("timeZoneId", "Asia/Manila")
        }
        val decoded = CanonicalCodecs.decodeTask("task-id", timed)
        assertEquals(updatedAt.seconds, decoded.dueAt?.seconds)
        assertEquals(updatedAt.nanoseconds, decoded.dueAt?.nanoseconds)
        assertEquals("Asia/Manila", decoded.timeZoneId)

        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeTask("task-id", timed.apply { put("timeZoneId", null) })
        }
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeTask("task-id", taskFields().apply { put("dueDate", "2023-02-29") })
        }
    }

    @Test fun eventEndpointsRequireIndependentDisambiguationAndKeepTimestampsAuthoritative() {
        val event = metadata().apply {
            put("title", "Class"); put("description", "Lecture"); put("startAt", createdAt); put("endAt", updatedAt)
            put("timeZoneId", "America/New_York"); put("type", "class"); put("courseId", null)
            put("location", "Room 2"); put("color", "navy")
            put("startTimeDisambiguation", "earlier"); put("endTimeDisambiguation", null)
        }
        val decoded = CanonicalCodecs.decodeScheduleEvent("event-id", event)
        val encoded = CanonicalCodecs.encodeScheduleEvent(decoded)

        assertEquals(EndpointDisambiguation.EARLIER, decoded.startTimeDisambiguation)
        assertNull(decoded.endTimeDisambiguation)
        assertEquals(createdAt.seconds, (encoded["startAt"] as Timestamp).seconds)
        assertEquals(createdAt.nanoseconds, (encoded["startAt"] as Timestamp).nanoseconds)
        assertEquals("earlier", encoded["startTimeDisambiguation"])
        assertNull(encoded["endTimeDisambiguation"])
        assertFalse(encoded.containsKey("id"))
    }

    @Test fun eventRequiresBothDisambiguationKeysAndStrictlyIncreasingInstants() {
        val event = metadata().apply {
            put("title", "Class"); put("description", ""); put("startAt", createdAt); put("endAt", updatedAt)
            put("timeZoneId", "UTC"); put("type", "class"); put("courseId", null); put("location", ""); put("color", "navy")
            put("startTimeDisambiguation", null); put("endTimeDisambiguation", null)
        }
        assertTrue(CanonicalCodecs.decodeScheduleEvent("event-id", event).endAt == updatedAt)
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeScheduleEvent("event-id", event.toMutableMap().apply { remove("startTimeDisambiguation") })
        }
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeScheduleEvent("event-id", event.toMutableMap().apply { put("endTimeDisambiguation", "both") })
        }
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeScheduleEvent("event-id", event.toMutableMap().apply { put("endAt", createdAt) })
        }
    }

    @Test fun plannerBlocksAllowCrossMidnightByComparingInstants() {
        val overnight = Timestamp(createdAt.seconds + 86_400, createdAt.nanoseconds)
        val block = metadata().apply {
            put("title", "Overnight plan"); put("startAt", updatedAt); put("endAt", overnight)
            put("timeZoneId", "Pacific/Kiritimati"); put("taskId", null); put("courseId", null)
            put("completed", false); put("sortOrder", 0)
        }
        val decoded = CanonicalCodecs.decodePlannerBlock("block-id", block)
        assertTrue(decoded.endAt.seconds > decoded.startAt.seconds)
    }

    @Test fun incompatibleSchemaVersionAndMissingNullableFieldsAreRejected() {
        assertThrows(ContractDecodeException::class.java) { CanonicalCodecs.decodeCourse("id", courseFields(1)) }
        assertThrows(ContractDecodeException::class.java) {
            CanonicalCodecs.decodeTask("id", taskFields().apply { remove("completedAt") })
        }
    }
}
