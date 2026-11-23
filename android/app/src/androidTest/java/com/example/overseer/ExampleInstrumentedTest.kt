package com.example.overseer

import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.core.app.ActivityScenario

import org.junit.Test
import org.junit.runner.RunWith

import org.junit.Assert.*
import android.content.Context
import android.content.ContextWrapper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.io.File

/**
 * Instrumented test, which will execute on an Android device.
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {
    @Test
    fun studyToolsAreVisibleAndPlannerUsesSafeAreaPadding() {
        ActivityScenario.launch(StudyActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val root = (activity.findViewById<View>(android.R.id.content) as ViewGroup).getChildAt(0)
                assertTrue("Study tab should include the expanded tools", containsText(root, "STUDY TOOLS"))
            }
        }

        ActivityScenario.launch(PlannerActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                assertEquals(PlannerActivity::class.java, activity.javaClass)
                val root = (activity.findViewById<View>(android.R.id.content) as ViewGroup).getChildAt(0)
                assertTrue("Planner content should clear the status bar", root.paddingTop > 0)
                assertTrue("Planner should show its fixed schedule section", containsText(root, "FIXED SCHEDULE"))
            }
        }
    }

    private fun containsText(view: View, expected: String): Boolean = when (view) {
        is TextView -> view.text.toString() == expected
        is ViewGroup -> (0 until view.childCount).any { containsText(view.getChildAt(it), expected) }
        else -> false
    }

    @Test
    fun useAppContext() {
        // Context of the app under test.
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("com.example.overseer", appContext.packageName)
    }

    @Test
    fun sharedBackupRoundTripsAndKeepsConflictingRecords() {
        val stamp = Instant.parse("2026-01-01T00:00:00Z").toString()
        val course = WorkspaceCourse("course-a", "Discrete Mathematics", "MATH 221", "", "", "mint", stamp)
        val lesson = WorkspaceLesson("lesson-a", course.id, "Graphs", "", "Vertices and edges", false, stamp)
        val task = WorkspaceTask("task-a", "Review graphs", "", "2026-01-03", "10:00", "High", course.id, false, stamp)
        val event = WorkspaceEvent("event-a", "Lecture", "", "2026-01-02", true, "09:00", "10:00", "class", course.id, "Room 204", "navy", stamp)
        val workspace = WorkspaceData(courses = listOf(course), lessons = listOf(lesson), tasks = listOf(task), events = listOf(event))
        val json = WorkspaceRepository.exportJson(workspace)
        assertEquals(workspace, WorkspaceRepository.parseJson(json))

        val localCourse = course.copy(name = "My local course")
        val preview = WorkspaceRepository.previewImport(WorkspaceData(courses = listOf(localCourse)), json)
        assertEquals(1, preview.summary.idConflicts)
        assertEquals("My local course", preview.data.courses.first { it.id == course.id }.name)
        val importedCourse = preview.data.courses.first { it.name == course.name }
        assertNotEquals(course.id, importedCourse.id)
        assertEquals("imported-u68xeo", importedCourse.id) // Matches Web's stable JSON/FNV-1a collision ID.
        assertEquals(importedCourse.id, preview.data.lessons.single().courseId)
        assertEquals(importedCourse.id, preview.data.tasks.single().courseId)
        assertEquals(importedCourse.id, preview.data.events.single().courseId)
        val repeated = WorkspaceRepository.previewImport(preview.data, json)
        assertEquals(0, repeated.summary.added)
        assertEquals(4, repeated.summary.alreadyPresent)
    }

    @Test
    fun webVersionFiveEnvelopeImportsIntoAndroidModel() {
        val webData = JSONObject()
            .put("preferences", JSONObject().put("displayName", "Web Student").put("profileEmail", "web@example.com").put("timeFormat", "24h").put("firstDayOfWeek", 0).put("theme", "light").put("appearancePreset", "midnight").put("appearanceMode", "dark").put("accentColor", "blue").put("density", "compact").put("reducedMotion", true).put("sidebarCollapsed", false))
            .put("courses", JSONArray().put(JSONObject().put("id", "web-course").put("name", "Data Structures").put("code", "CS 204").put("description", "Course notes").put("instructor", "Prof. Rivera").put("tint", "lavender").put("createdAt", "2026-01-01T00:00:00Z")))
            .put("lessons", JSONArray())
            .put("materials", JSONArray())
            .put("tasks", JSONArray().put(JSONObject().put("id", "web-task").put("title", "Review lists").put("description", "").put("dueDate", "2026-01-03").put("dueTime", "18:00").put("priority", "High").put("courseId", "web-course").put("completed", false).put("createdAt", "2026-01-01T00:00:00Z").put("completedAt", JSONObject.NULL)))
            .put("events", JSONArray().put(JSONObject().put("id", "web-event").put("title", "Lecture").put("description", "").put("date", "2026-01-02").put("repeatWeekly", true).put("startTime", "09:00").put("endTime", "10:00").put("type", "class").put("courseId", "web-course").put("location", "Room 204").put("color", "lime").put("createdAt", "2026-01-01T00:00:00Z")))
            .put("plannerBlocks", JSONArray())
            .put("focusSessions", JSONArray())
            .put("focusTimer", JSONObject().put("status", "idle").put("mode", "focus").put("durationSeconds", 1500).put("remainingSeconds", 1500).put("startedAt", JSONObject.NULL).put("segmentStartedAt", JSONObject.NULL).put("elapsedSeconds", 0).put("endsAt", JSONObject.NULL).put("courseId", JSONObject.NULL).put("taskId", JSONObject.NULL))
        val parsed = WorkspaceRepository.parseJson(JSONObject().put("version", 5).put("data", webData).toString())
        assertEquals("Web Student", parsed.preferences.displayName)
        assertEquals("24h", parsed.preferences.timeFormat)
        assertEquals("midnight", parsed.preferences.appearancePreset)
        assertEquals("dark", parsed.preferences.appearanceMode)
        assertEquals("blue", parsed.preferences.accentColor)
        assertEquals("compact", parsed.preferences.density)
        assertTrue(parsed.preferences.reducedMotion)
        assertEquals("High", parsed.tasks.single().priority)
        assertEquals("web-course", parsed.events.single().courseId)
        assertTrue(parsed.events.single().repeatWeekly)
        assertEquals("lime", parsed.events.single().color)
    }

    @Test
    fun legacyAndroidPreferencesMigrateIntoSharedWorkspace() {
        // Use the test APK's isolated storage so this migration test never touches user data.
        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val isolatedFiles = File(targetContext.cacheDir, "legacy-migration-test").apply {
            deleteRecursively()
            mkdirs()
        }
        val context = object : ContextWrapper(targetContext) {
            override fun getFilesDir(): File = isolatedFiles
            override fun getSharedPreferences(name: String, mode: Int) =
                targetContext.getSharedPreferences("instrumentation_$name", mode)
        }
        assertTrue(isolatedFiles.isDirectory)
        context.filesDir.listFiles()?.filter { it.name.startsWith("overseer-workspace.json") }?.forEach { it.delete() }
        context.getSharedPreferences("overseer_workspace_meta", Context.MODE_PRIVATE).edit().clear().commit()
        listOf("overseer_subjects", "overseer_materials", "overseer_tasks", "overseer_schedule", "overseer_profile", "overseer_focus").forEach { context.getSharedPreferences(it, Context.MODE_PRIVATE).edit().clear().commit() }
        context.getSharedPreferences("overseer_subjects", Context.MODE_PRIVATE).edit()
            .putString("subjects", JSONArray().put("Data Structures").toString()).commit()
        context.getSharedPreferences("overseer_materials", Context.MODE_PRIVATE).edit()
            .putString("materials_Data Structures", JSONArray().put("Lecture notes").toString()).commit()
        context.getSharedPreferences("overseer_tasks", Context.MODE_PRIVATE).edit()
            .putString("tasks", JSONArray().put(JSONObject().put("id", "old-task").put("title", "Review notes").put("completed", true)).toString()).commit()
        context.getSharedPreferences("overseer_schedule", Context.MODE_PRIVATE).edit()
            .putString("classes", JSONArray().put(JSONObject().put("id", "old-event").put("subject", "Data Structures").put("day", java.util.Calendar.MONDAY).put("startTime", "10:00 AM").put("endTime", "11:00 AM").put("room", "Room 2")).toString()).commit()
        context.getSharedPreferences("overseer_profile", Context.MODE_PRIVATE).edit().putString("profile_name", "Student").putString("profile_email", "student@example.com").commit()

        val migrated = WorkspaceRepository.load(context)
        assertEquals("Student", migrated.preferences.displayName)
        assertEquals("student@example.com", migrated.preferences.profileEmail)
        assertEquals("Data Structures", migrated.courses.single().name)
        assertEquals("Lecture notes", migrated.materials.single().title)
        assertTrue(migrated.tasks.single().completed)
        assertEquals("Medium", migrated.tasks.single().priority)
        assertTrue(migrated.events.single { it.id == "old-event" }.repeatWeekly)
        context.getSharedPreferences("overseer_focus", Context.MODE_PRIVATE).edit().putBoolean("is_running", true).commit()
        context.getSharedPreferences("overseer_profile", Context.MODE_PRIVATE).edit().putString("profile_name", "Old name").commit()
        WorkspaceRepository.reset(context)
        assertFalse(context.getSharedPreferences("overseer_focus", Context.MODE_PRIVATE).contains("is_running"))
        assertFalse(context.getSharedPreferences("overseer_profile", Context.MODE_PRIVATE).contains("profile_name"))
        assertTrue(WorkspaceRepository.load(context).tasks.isEmpty())
        context.filesDir.listFiles()?.filter { it.name.startsWith("overseer-workspace.json") }?.forEach { it.delete() }
        context.getSharedPreferences("overseer_workspace_meta", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun unreadableWorkspaceIsCopiedBeforeLaterWrites() {
        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val isolatedFiles = File(targetContext.cacheDir, "corrupt-workspace-test").apply {
            deleteRecursively()
            mkdirs()
        }
        val context = object : ContextWrapper(targetContext) {
            override fun getFilesDir(): File = isolatedFiles
            override fun getSharedPreferences(name: String, mode: Int) =
                targetContext.getSharedPreferences("corrupt_test_$name", mode)
        }
        context.getSharedPreferences("overseer_workspace_meta", Context.MODE_PRIVATE).edit().clear().commit()
        val original = "preserve this unreadable file"
        File(isolatedFiles, "overseer-workspace.json").writeText(original)

        assertTrue(WorkspaceRepository.load(context).tasks.isEmpty())
        val recovery = WorkspaceRepository.recoveryFile(context)
        assertNotNull(recovery)
        assertEquals(original, recovery!!.readText())
        assertTrue(WorkspaceRepository.shouldShowRecoveryNotice(context))

        WorkspaceRepository.update(context) { data -> data.copy(tasks = listOf(WorkspaceTask("after-recovery", "Safe write", createdAt = "2026-01-01T00:00:00Z"))) }
        assertEquals("Safe write", WorkspaceRepository.load(context).tasks.single().title)
        assertEquals("The original unreadable bytes remain available", original, recovery.readText())

        context.filesDir.listFiles()?.forEach { it.delete() }
        context.getSharedPreferences("overseer_workspace_meta", Context.MODE_PRIVATE).edit().clear().commit()
    }
}
