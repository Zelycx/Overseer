package com.example.overseer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleWorkerClientTest {
    @Test fun parsesStructuredWorkerErrorWithoutCoercingObjects() {
        val parsed = GoogleWorkerClient.parseWorkerFailure(
            503,
            mapOf("error" to mapOf("code" to "GOOGLE_UPSTREAM_UNAVAILABLE", "message" to "Retry this page.", "retryable" to true)),
        )
        assertEquals("GOOGLE_UPSTREAM_UNAVAILABLE", parsed.code)
        assertEquals("Retry this page.", parsed.message)
        assertTrue(parsed.retryable)
    }

    @Test fun invalidCursorAndPermanentErrorsRestartButTransientErrorsKeepCursor() {
        val invalid = GoogleWorkerClient.GoogleWorkerException(400, "INVALID_PAGE_CURSOR", "Expired", false, emptyMap())
        val denied = GoogleWorkerClient.GoogleWorkerException(403, "GOOGLE_PERMISSION_DENIED", "Denied", false, emptyMap())
        val temporary = GoogleWorkerClient.GoogleWorkerException(503, "GOOGLE_UPSTREAM_UNAVAILABLE", "Retry", true, emptyMap())
        assertEquals(GoogleWorkerClient.CursorRecovery.RESTART_FROM_BEGINNING, GoogleWorkerClient.cursorRecovery(invalid))
        assertEquals(GoogleWorkerClient.CursorRecovery.RESTART_FROM_BEGINNING, GoogleWorkerClient.cursorRecovery(denied))
        assertEquals(GoogleWorkerClient.CursorRecovery.KEEP_FOR_RETRY, GoogleWorkerClient.cursorRecovery(temporary))
    }

    @Test fun legacyStringErrorsAndUnstructuredHttpErrorsStayReadable() {
        val legacy = GoogleWorkerClient.parseWorkerFailure(403, mapOf("error" to "Permission denied."))
        val fallback = GoogleWorkerClient.parseWorkerFailure(401, emptyMap())
        assertEquals("Permission denied.", legacy.message)
        assertEquals("HTTP_401", fallback.code)
        assertFalse(fallback.retryable)
    }
}
