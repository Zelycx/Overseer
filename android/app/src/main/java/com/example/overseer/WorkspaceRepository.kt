package com.example.overseer

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale

private const val WORKSPACE_VERSION = 5
private const val SEEDED_AT = "2026-01-01T00:00:00.000Z"

interface WorkspaceRecord { val id: String }
data class WorkspacePreferences(
    val displayName: String = "", val profileEmail: String = "", val timeFormat: String = "12h",
    val firstDayOfWeek: Int = 1, val theme: String = "light", val appearancePreset: String = "studio",
    val appearanceMode: String = "system", val accentColor: String = "olive", val density: String = "comfortable",
    val reducedMotion: Boolean = false, val sidebarCollapsed: Boolean = false,
)
data class WorkspaceCourse(override val id: String, val name: String, val code: String = "", val description: String = "", val instructor: String = "", val tint: String = "lavender", val createdAt: String) : WorkspaceRecord
data class WorkspaceLesson(override val id: String, val courseId: String, val title: String, val description: String = "", val content: String = "", val completed: Boolean = false, val updatedAt: String) : WorkspaceRecord
data class WorkspaceMaterial(override val id: String, val title: String, val courseId: String? = null, val content: String = "", val fileName: String = "", val createdAt: String, val updatedAt: String) : WorkspaceRecord
data class WorkspaceTask(override val id: String, val title: String, val description: String = "", val dueDate: String? = null, val dueTime: String? = null, val priority: String = "Medium", val courseId: String? = null, val completed: Boolean = false, val createdAt: String, val completedAt: String? = null) : WorkspaceRecord
data class WorkspaceEvent(override val id: String, val title: String, val description: String = "", val date: String, val repeatWeekly: Boolean = false, val startTime: String, val endTime: String, val type: String = "class", val courseId: String? = null, val location: String = "", val color: String = "navy", val createdAt: String) : WorkspaceRecord
data class WorkspaceBlock(override val id: String, val date: String, val title: String, val startTime: String, val endTime: String, val taskId: String? = null, val courseId: String? = null, val completed: Boolean = false, val order: Int = 0, val createdAt: String) : WorkspaceRecord
data class WorkspaceFocusSession(override val id: String, val mode: String, val startedAt: String, val endedAt: String, val durationSeconds: Int, val courseId: String? = null, val taskId: String? = null, val completed: Boolean = true) : WorkspaceRecord
data class WorkspaceFocusTimer(val status: String = "idle", val mode: String = "focus", val durationSeconds: Int = 1500, val remainingSeconds: Int = 1500, val startedAt: String? = null, val segmentStartedAt: String? = null, val elapsedSeconds: Int = 0, val endsAt: Long? = null, val courseId: String? = null, val taskId: String? = null)
data class WorkspaceData(
    val preferences: WorkspacePreferences = WorkspacePreferences(), val courses: List<WorkspaceCourse> = emptyList(),
    val lessons: List<WorkspaceLesson> = emptyList(), val materials: List<WorkspaceMaterial> = emptyList(),
    val tasks: List<WorkspaceTask> = emptyList(), val events: List<WorkspaceEvent> = emptyList(),
    val plannerBlocks: List<WorkspaceBlock> = emptyList(), val focusSessions: List<WorkspaceFocusSession> = emptyList(),
    val focusTimer: WorkspaceFocusTimer = WorkspaceFocusTimer(),
)
data class WorkspaceMergeSummary(val added: Int, val alreadyPresent: Int, val idConflicts: Int)
data class WorkspaceMergeResult(val data: WorkspaceData, val summary: WorkspaceMergeSummary)

object WorkspaceRepository {
    private const val DATA_FILE = "overseer-workspace.json"
    private const val META_PREFS = "overseer_workspace_meta"
    private const val MIGRATED_KEY = "legacy_migration_complete"
    private const val RECOVERY_FILE_KEY = "unreadable_workspace_recovery_file"
    private const val RECOVERY_NOTICE_SHOWN_KEY = "unreadable_workspace_recovery_notice_shown"
    private val time12 = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
    private val time24 = DateTimeFormatter.ofPattern("HH:mm", Locale.US)
    private fun file(context: Context) = AtomicFile(File(context.filesDir, DATA_FILE))
    private fun meta(context: Context) = context.getSharedPreferences(META_PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun load(context: Context): WorkspaceData {
        val store = file(context)
        if (store.baseFile.exists()) {
            try { return decodeEnvelope(store.openRead().bufferedReader().use { it.readText() }) }
            catch (error: Exception) {
                preserveUnreadableWorkspace(context, store.baseFile)
                return WorkspaceData()
            }
        }
        val initial = if (meta(context).getBoolean(MIGRATED_KEY, false)) WorkspaceData() else migrateLegacy(context)
        save(context, initial)
        meta(context).edit().putBoolean(MIGRATED_KEY, true).apply()
        return initial
    }

    @Synchronized
    fun save(context: Context, data: WorkspaceData) {
        val atomic = file(context)
        val stream = atomic.startWrite()
        try { stream.write(encodeEnvelope(data).toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) }
        catch (error: Exception) { atomic.failWrite(stream); throw error }
    }

    @Synchronized
    fun update(context: Context, transform: (WorkspaceData) -> WorkspaceData): WorkspaceData {
        val next = transform(load(context)); save(context, next); return next
    }

    fun exportJson(data: WorkspaceData): String = encodeEnvelope(data)

    fun recoveryFile(context: Context): File? = meta(context).getString(RECOVERY_FILE_KEY, null)
        ?.let { File(context.filesDir, it) }
        ?.takeIf { it.isFile }

    fun shouldShowRecoveryNotice(context: Context): Boolean = recoveryFile(context) != null &&
        !meta(context).getBoolean(RECOVERY_NOTICE_SHOWN_KEY, false)

    fun markRecoveryNoticeShown(context: Context) {
        meta(context).edit().putBoolean(RECOVERY_NOTICE_SHOWN_KEY, true).apply()
    }

    private fun preserveUnreadableWorkspace(context: Context, source: File) {
        val current = recoveryFile(context)
        if (current != null) return
        val recovery = File(context.filesDir, "overseer-workspace-recovery-${System.currentTimeMillis()}.json")
        source.copyTo(recovery, overwrite = false)
        meta(context).edit().putString(RECOVERY_FILE_KEY, recovery.name).apply()
    }

    fun parseJson(json: String): WorkspaceData = decodeEnvelope(json)

    /** Parse and merge an import without writing it, so the UI can confirm before saving. */
    fun previewImport(current: WorkspaceData, json: String): WorkspaceMergeResult = merge(current, decodeEnvelope(json))

    fun importAndMerge(context: Context, json: String): WorkspaceMergeResult {
        val result = previewImport(load(context), json)
        save(context, result.data)
        return result
    }

    fun reset(context: Context) {
        save(context, WorkspaceData())
        meta(context).edit().putBoolean(MIGRATED_KEY, true).apply()
        listOf("overseer_tasks", "overseer_schedule", "overseer_subjects", "overseer_materials", "overseer_profile", "overseer_focus")
            .forEach { context.getSharedPreferences(it, Context.MODE_PRIVATE).edit().clear().apply() }
    }

    private fun merge(current: WorkspaceData, incoming: WorkspaceData): WorkspaceMergeResult {
        val courses = current.courses.toMutableList(); val lessons = current.lessons.toMutableList()
        val materials = current.materials.toMutableList(); val tasks = current.tasks.toMutableList()
        val events = current.events.toMutableList(); val blocks = current.plannerBlocks.toMutableList()
        val sessions = current.focusSessions.toMutableList()
        val used = (courses.map { it.id } + lessons.map { it.id } + materials.map { it.id } + tasks.map { it.id } + events.map { it.id } + blocks.map { it.id } + sessions.map { it.id }).toMutableSet()
        val idMap = mutableMapOf<String, String>(); var added = 0; var present = 0; var conflicts = 0
        fun <T : WorkspaceRecord> addRows(target: MutableList<T>, source: List<T>, rewrite: (T) -> T, rekey: (T, String) -> T) {
            source.forEach { original ->
                val mapped = rewrite(original); val existing = target.firstOrNull { it.id == mapped.id }
                if (existing != null && existing == mapped) { idMap[original.id] = original.id; present++ }
                else if (mapped.id in used) {
                    val base = stableImportedId(mapped)
                    var next = base; var suffix = 1
                    while (true) {
                        val existingImport = target.firstOrNull { it.id == next }
                        if (existingImport != null) {
                            if (existingImport == rekey(mapped, next)) { idMap[original.id] = next; present++; break }
                            next = "$base-${suffix++}"; continue
                        }
                        if (next in used) { next = "$base-${suffix++}"; continue }
                        idMap[original.id] = next; target.add(rekey(mapped, next)); used.add(next); added++; conflicts++; break
                    }
                }
                else { idMap[original.id] = original.id; target.add(mapped); used.add(mapped.id); added++ }
            }
        }
        addRows(courses, incoming.courses, { it }, { row, id -> row.copy(id = id) })
        addRows(lessons, incoming.lessons, { it.copy(courseId = idMap[it.courseId] ?: it.courseId) }, { row, id -> row.copy(id = id) })
        addRows(materials, incoming.materials, { it.copy(courseId = it.courseId?.let { id -> idMap[id] ?: id }) }, { row, id -> row.copy(id = id) })
        addRows(tasks, incoming.tasks, { it.copy(courseId = it.courseId?.let { id -> idMap[id] ?: id }) }, { row, id -> row.copy(id = id) })
        addRows(events, incoming.events, { it.copy(courseId = it.courseId?.let { id -> idMap[id] ?: id }) }, { row, id -> row.copy(id = id) })
        addRows(blocks, incoming.plannerBlocks, { it.copy(courseId = it.courseId?.let { id -> idMap[id] ?: id }, taskId = it.taskId?.let { id -> idMap[id] ?: id }) }, { row, id -> row.copy(id = id) })
        addRows(sessions, incoming.focusSessions, { it.copy(courseId = it.courseId?.let { id -> idMap[id] ?: id }, taskId = it.taskId?.let { id -> idMap[id] ?: id }) }, { row, id -> row.copy(id = id) })
        return WorkspaceMergeResult(current.copy(courses = courses, lessons = lessons, materials = materials, tasks = tasks, events = events, plannerBlocks = blocks, focusSessions = sessions), WorkspaceMergeSummary(added, present, conflicts))
    }

    private fun migrateLegacy(context: Context): WorkspaceData {
        val now = java.time.Instant.now().toString()
        val subjectPrefs = context.getSharedPreferences("overseer_subjects", Context.MODE_PRIVATE)
        val subjects = JSONArray(subjectPrefs.getString("subjects", "[]"))
        val materialPrefs = context.getSharedPreferences("overseer_materials", Context.MODE_PRIVATE)
        val courseIds = mutableMapOf<String, String>()
        val courses = mutableListOf<WorkspaceCourse>()
        val materials = mutableListOf<WorkspaceMaterial>()
        for (index in 0 until subjects.length()) {
            val name = subjects.optString(index).trim()
            if (name.isBlank()) continue
            val id = "legacy-course-${slug(name)}"
            courseIds[name.lowercase()] = id
            courses.add(WorkspaceCourse(id, name, createdAt = now))
            val rows = JSONArray(materialPrefs.getString("materials_$name", "[]"))
            for (i in 0 until rows.length()) {
                val title = rows.optString(i).trim()
                if (title.isNotBlank()) materials.add(WorkspaceMaterial("legacy-material-${slug(name)}-$i", title, id, "", title, now, now))
            }
        }

        val taskPrefs = context.getSharedPreferences("overseer_tasks", Context.MODE_PRIVATE)
        val oldTasks = JSONArray(taskPrefs.getString("tasks", "[]"))
        val tasks = (0 until oldTasks.length()).mapNotNull { index ->
            val row = oldTasks.optJSONObject(index) ?: return@mapNotNull null
            val title = row.optString("title").trim()
            if (title.isBlank()) null else WorkspaceTask(row.optString("id", "legacy-task-$index"), title, completed = row.optBoolean("completed"), createdAt = now)
        }.toMutableList()
        if (!taskPrefs.contains("tasks")) {
            listOf("Finish programming activity" to "task_one", "Review database notes" to "task_two", "Prepare for tomorrow's quiz" to "task_three").forEach { (title, key) ->
                if (taskPrefs.contains(key)) tasks.add(WorkspaceTask(key, title, completed = taskPrefs.getBoolean(key, false), createdAt = now))
            }
        }

        val schedulePrefs = context.getSharedPreferences("overseer_schedule", Context.MODE_PRIVATE)
        val oldEvents = JSONArray(schedulePrefs.getString("classes", "[]"))
        val events = (0 until oldEvents.length()).mapNotNull { index ->
            val row = oldEvents.optJSONObject(index) ?: return@mapNotNull null
            val title = row.optString("subject").trim()
            val start = parseLegacyTime(row.optString("startTime")) ?: return@mapNotNull null
            val end = parseLegacyTime(row.optString("endTime")) ?: return@mapNotNull null
            val calendarDay = row.optInt("day", Calendar.MONDAY)
            val isoDay = if (calendarDay == Calendar.SUNDAY) DayOfWeek.SUNDAY else DayOfWeek.of((calendarDay - 1).coerceIn(1, 7))
            val date = LocalDate.now().with(java.time.temporal.TemporalAdjusters.nextOrSame(isoDay)).toString()
            if (title.isBlank() || end <= start) return@mapNotNull null
            WorkspaceEvent(row.optString("id", "legacy-event-$index"), title, row.optString("instructor"), date, true, start, end, "class", courseIds[title.lowercase()], row.optString("room"), "navy", now)
        }.toMutableList()
        if (oldEvents.length() == 0 && !schedulePrefs.getBoolean("sample_classes_initialized", false)) {
            val samples = listOf(
                Triple("Database Management", Calendar.MONDAY, "10:00" to "11:30"),
                Triple("Programming", Calendar.TUESDAY, "13:00" to "14:30"),
                Triple("Database Management", Calendar.THURSDAY, "10:00" to "11:30"),
                Triple("Programming", Calendar.THURSDAY, "13:00" to "14:30"),
            )
            samples.forEachIndexed { index, (title, day, times) ->
                val isoDay = if (day == Calendar.SUNDAY) DayOfWeek.SUNDAY else DayOfWeek.of((day - 1).coerceIn(1, 7))
                val date = LocalDate.now().with(java.time.temporal.TemporalAdjusters.nextOrSame(isoDay)).toString()
                events.add(WorkspaceEvent("legacy-sample-class-$index", title, "", date, true, times.first, times.second, "class", courseIds[title.lowercase()], if (title == "Database Management") "Room 204" else "Room 301", "navy", now))
            }
        }

        val focusPrefs = context.getSharedPreferences("overseer_focus", Context.MODE_PRIVATE)
        val focusDuration = focusPrefs.getInt("focus_duration", 25).coerceIn(1, 180) * 60
        val oldRemaining = (focusPrefs.getLong("time_left", focusDuration * 1000L) / 1000L).toInt().coerceAtLeast(0)
        val oldRunning = focusPrefs.getBoolean("is_running", false)
        val oldEnd = focusPrefs.getLong("end_time", 0L).takeIf { oldRunning && it > 0L }
        val remaining = if (oldEnd != null) ((oldEnd - System.currentTimeMillis()) / 1000L).toInt().coerceAtLeast(0) else oldRemaining
        val timer = WorkspaceFocusTimer(
            status = if (oldRunning && remaining > 0) "running" else if (remaining < focusDuration) "paused" else "idle",
            durationSeconds = focusDuration, remainingSeconds = remaining, endsAt = oldEnd,
        )
        val profilePrefs = context.getSharedPreferences("overseer_profile", Context.MODE_PRIVATE)
        val preferences = WorkspacePreferences(
            displayName = profilePrefs.getString("profile_name", "") ?: "",
            profileEmail = profilePrefs.getString("profile_email", "") ?: "",
        )
        val hasLegacyData = taskPrefs.all.isNotEmpty() || schedulePrefs.all.isNotEmpty() || subjectPrefs.all.isNotEmpty() || materialPrefs.all.isNotEmpty() || profilePrefs.all.isNotEmpty() || focusPrefs.all.isNotEmpty()
        return if (hasLegacyData) WorkspaceData(preferences, courses, materials = materials, tasks = tasks, events = events, focusTimer = timer) else createSeedData()
    }

    private fun slug(value: String) = value.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "item" }
    private fun parseLegacyTime(value: String): String? = runCatching { LocalTime.parse(value.trim().uppercase(Locale.US), time12).format(time24) }.getOrNull()

    private fun createSeedData(): WorkspaceData {
        // Match Web's stable seed timestamp so first-time imports deduplicate.
        val stamp = SEEDED_AT
        val today = LocalDate.now().toString()
        val courses = listOf(
            WorkspaceCourse("course-structures", "Data Structures", "CS 204", "Core data structures, algorithms, and practical analysis.", "Prof. Rivera", "lavender", stamp),
            WorkspaceCourse("course-math", "Discrete Mathematics", "MATH 221", "Logic, graphs, counting, and proofs.", "Dr. Chen", "mint", stamp),
            WorkspaceCourse("course-design", "Human-Computer Interaction", "IT 310", "Research and design for usable interfaces.", "Prof. Santos", "sand", stamp),
        )
        val lessons = listOf(
            WorkspaceLesson("lesson-array", "course-structures", "Arrays and linked lists", "Compare contiguous and linked storage.", "Arrays store items in contiguous memory and support constant-time indexed access. Linked lists connect nodes with references, which makes insertion flexible but indexed access slower.", true, stamp),
            WorkspaceLesson("lesson-stacks", "course-structures", "Stacks and queues", "Explore common linear structures.", "A stack follows last-in, first-out. A queue follows first-in, first-out. Both are useful abstractions for managing work in order.", false, stamp),
            WorkspaceLesson("lesson-trees", "course-structures", "Trees and traversals", "Represent hierarchical data.", "Trees organize values in parent and child relationships. Preorder, inorder, and postorder traversals visit nodes in different sequences.", false, stamp),
            WorkspaceLesson("lesson-logic", "course-math", "Propositional logic", "Build and evaluate statements.", "Propositions have truth values. Logical connectives combine them into compound statements that can be evaluated with truth tables.", false, stamp),
            WorkspaceLesson("lesson-graphs", "course-math", "Graph theory basics", "Model relationships with graphs.", "A graph is a set of vertices joined by edges. Graphs can represent networks, dependencies, and paths.", false, stamp),
            WorkspaceLesson("lesson-research", "course-design", "Usability research", "Plan a useful study.", "A usability study observes representative users completing realistic tasks. Clear prompts and careful note-taking reduce bias.", false, stamp),
        )
        val tasks = listOf(
            WorkspaceTask("task-graph-set", "Finish graph theory problem set", "Complete questions 1–8 and check the proofs.", today, "18:00", "High", "course-math", createdAt = stamp),
            WorkspaceTask("task-stack-review", "Review linked lists and stacks", "Review notes and write a short comparison.", priority = "Medium", courseId = "course-structures", createdAt = stamp),
            WorkspaceTask("task-test-questions", "Draft usability test questions", priority = "Low", courseId = "course-design", createdAt = stamp),
        )
        val events = listOf(
            WorkspaceEvent("event-math", "Discrete Mathematics", "Lecture", today, startTime = "09:00", endTime = "10:30", courseId = "course-math", location = "Room 204", color = "navy", createdAt = stamp),
            WorkspaceEvent("event-study", "Study block", "Review trees and traversals", today, startTime = "11:00", endTime = "12:00", type = "study", courseId = "course-structures", color = "lime", createdAt = stamp),
            WorkspaceEvent("event-hci", "Human-Computer Interaction", "Studio class", today, startTime = "13:30", endTime = "15:00", courseId = "course-design", location = "Design Lab", color = "blue", createdAt = stamp),
        )
        return WorkspaceData(courses = courses, lessons = lessons, tasks = tasks, events = events)
    }

    private fun decodeEnvelope(text: String): WorkspaceData {
        val root = JSONObject(text)
        val version = root.optInt("version", 1)
        require(version in 1..WORKSPACE_VERSION) { "Unsupported Overseer backup version." }
        val data = if (root.has("data")) root.getJSONObject("data") else root
        val p = data.optJSONObject("preferences") ?: JSONObject()
        val preferences = WorkspacePreferences(
            displayName = p.optString("displayName"), profileEmail = p.optString("profileEmail"),
            timeFormat = if (p.optString("timeFormat") == "24h") "24h" else "12h",
            firstDayOfWeek = if (p.optInt("firstDayOfWeek", 1) == 0) 0 else 1,
            theme = p.optString("theme", "light"), appearancePreset = p.optString("appearancePreset", "studio"),
            appearanceMode = p.optString("appearanceMode", "system"), accentColor = p.optString("accentColor", "olive"),
            density = p.optString("density", "comfortable"), reducedMotion = p.optBoolean("reducedMotion"), sidebarCollapsed = p.optBoolean("sidebarCollapsed"),
        )
        val courses = data.optJSONArray("courses").mapObjects { WorkspaceCourse(it.getString("id"), it.getString("name"), it.optString("code"), it.optString("description"), it.optString("instructor"), it.optString("tint", "lavender"), it.getString("createdAt")) }
        val lessons = data.optJSONArray("lessons").mapObjects { WorkspaceLesson(it.getString("id"), it.getString("courseId"), it.getString("title"), it.optString("description"), it.optString("content"), it.optBoolean("completed"), it.getString("updatedAt")) }
        val materials = data.optJSONArray("materials").mapObjects { WorkspaceMaterial(it.getString("id"), it.getString("title"), it.nullableString("courseId"), it.optString("content"), it.optString("fileName"), it.getString("createdAt"), it.getString("updatedAt")) }
        val tasks = data.optJSONArray("tasks").mapObjects { WorkspaceTask(it.getString("id"), it.getString("title"), it.optString("description"), it.nullableString("dueDate"), it.nullableString("dueTime"), it.optString("priority", "Medium"), it.nullableString("courseId"), it.optBoolean("completed"), it.getString("createdAt"), it.nullableString("completedAt")) }
        val events = data.optJSONArray("events").mapObjects { WorkspaceEvent(it.getString("id"), it.getString("title"), it.optString("description"), it.getString("date"), it.optBoolean("repeatWeekly"), it.getString("startTime"), it.getString("endTime"), it.optString("type", "class"), it.nullableString("courseId"), it.optString("location"), it.optString("color", "navy"), it.getString("createdAt")) }
        val blocks = data.optJSONArray("plannerBlocks").mapObjects { WorkspaceBlock(it.getString("id"), it.getString("date"), it.getString("title"), it.getString("startTime"), it.getString("endTime"), it.nullableString("taskId"), it.nullableString("courseId"), it.optBoolean("completed"), it.optInt("order"), it.getString("createdAt")) }
        val sessions = data.optJSONArray("focusSessions").mapObjects { WorkspaceFocusSession(it.getString("id"), it.optString("mode", "focus"), it.getString("startedAt"), it.getString("endedAt"), it.optInt("durationSeconds"), it.nullableString("courseId"), it.nullableString("taskId"), it.optBoolean("completed", true)) }
        val t = data.optJSONObject("focusTimer") ?: JSONObject()
        val timer = WorkspaceFocusTimer(
            status = t.optString("status", "idle"), mode = t.optString("mode", "focus"),
            durationSeconds = t.optInt("durationSeconds", 1500), remainingSeconds = t.optInt("remainingSeconds", 1500),
            startedAt = t.nullableString("startedAt"), segmentStartedAt = t.nullableString("segmentStartedAt") ?: t.nullableString("startedAt"),
            elapsedSeconds = t.optInt("elapsedSeconds"), endsAt = if (t.isNull("endsAt") || !t.has("endsAt")) null else t.optLong("endsAt"),
            courseId = t.nullableString("courseId"), taskId = t.nullableString("taskId"),
        )
        return WorkspaceData(preferences, courses, lessons, materials, tasks, events, blocks, sessions, timer)
    }

    private inline fun <T> JSONArray?.mapObjects(block: (JSONObject) -> T): List<T> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { index -> optJSONObject(index)?.let(block) }
    }

    private fun encodeEnvelope(data: WorkspaceData): String = JSONObject().put("version", WORKSPACE_VERSION).put("data", data.toJson()).toString(2)

    private fun WorkspaceData.toJson() = JSONObject().apply {
        put("preferences", JSONObject().apply {
            put("displayName", preferences.displayName); put("profileEmail", preferences.profileEmail)
            put("timeFormat", preferences.timeFormat); put("firstDayOfWeek", preferences.firstDayOfWeek)
            put("theme", preferences.theme); put("appearancePreset", preferences.appearancePreset)
            put("appearanceMode", preferences.appearanceMode); put("accentColor", preferences.accentColor)
            put("density", preferences.density); put("reducedMotion", preferences.reducedMotion)
            put("sidebarCollapsed", preferences.sidebarCollapsed)
        })
        put("courses", courses.toJsonArray { JSONObject().apply { put("id", it.id); put("name", it.name); put("code", it.code); put("description", it.description); put("instructor", it.instructor); put("tint", it.tint); put("createdAt", it.createdAt) } })
        put("lessons", lessons.toJsonArray { JSONObject().apply { put("id", it.id); put("courseId", it.courseId); put("title", it.title); put("description", it.description); put("content", it.content); put("completed", it.completed); put("updatedAt", it.updatedAt) } })
        put("materials", materials.toJsonArray { JSONObject().apply { put("id", it.id); put("title", it.title); putNullable("courseId", it.courseId); put("content", it.content); put("fileName", it.fileName); put("createdAt", it.createdAt); put("updatedAt", it.updatedAt) } })
        put("tasks", tasks.toJsonArray { JSONObject().apply { put("id", it.id); put("title", it.title); put("description", it.description); putNullable("dueDate", it.dueDate); putNullable("dueTime", it.dueTime); put("priority", it.priority); putNullable("courseId", it.courseId); put("completed", it.completed); put("createdAt", it.createdAt); putNullable("completedAt", it.completedAt) } })
        put("events", events.toJsonArray { JSONObject().apply { put("id", it.id); put("title", it.title); put("description", it.description); put("date", it.date); put("repeatWeekly", it.repeatWeekly); put("startTime", it.startTime); put("endTime", it.endTime); put("type", it.type); putNullable("courseId", it.courseId); put("location", it.location); put("color", it.color); put("createdAt", it.createdAt) } })
        put("plannerBlocks", plannerBlocks.toJsonArray { JSONObject().apply { put("id", it.id); put("date", it.date); put("title", it.title); put("startTime", it.startTime); put("endTime", it.endTime); putNullable("taskId", it.taskId); putNullable("courseId", it.courseId); put("completed", it.completed); put("order", it.order); put("createdAt", it.createdAt) } })
        put("focusSessions", focusSessions.toJsonArray { JSONObject().apply { put("id", it.id); put("mode", it.mode); put("startedAt", it.startedAt); put("endedAt", it.endedAt); put("durationSeconds", it.durationSeconds); putNullable("courseId", it.courseId); putNullable("taskId", it.taskId); put("completed", it.completed) } })
        put("focusTimer", JSONObject().apply { put("status", focusTimer.status); put("mode", focusTimer.mode); put("durationSeconds", focusTimer.durationSeconds); put("remainingSeconds", focusTimer.remainingSeconds); putNullable("startedAt", focusTimer.startedAt); putNullable("segmentStartedAt", focusTimer.segmentStartedAt); put("elapsedSeconds", focusTimer.elapsedSeconds); putNullable("endsAt", focusTimer.endsAt); putNullable("courseId", focusTimer.courseId); putNullable("taskId", focusTimer.taskId) })
    }

    /** Keep collision IDs byte-for-byte compatible with Web's stable JSON/FNV-1a algorithm. */
    private fun stableImportedId(record: WorkspaceRecord): String {
        val source = canonicalJson(record.toJsonObject())
        var hash = 2166136261L.toInt()
        source.forEach { character -> hash = (hash xor character.code) * 16777619 }
        val unsigned = hash.toLong() and 0xffffffffL
        return "imported-${java.lang.Long.toString(unsigned, 36)}"
    }

    private fun canonicalJson(value: Any?): String = when (value) {
        JSONObject.NULL -> "null"
        null -> "null"
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(separator = ",", prefix = "{", postfix = "}") { key ->
            "${JSONObject.quote(key)}:${canonicalJson(value.get(key))}"
        }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { canonicalJson(value.get(it)) }
        is String -> JSONObject.quote(value)
        is Number, is Boolean -> value.toString()
        else -> JSONObject.quote(value.toString())
    }

    private fun WorkspaceRecord.toJsonObject(): JSONObject = when (this) {
        is WorkspaceCourse -> JSONObject().apply { put("id", id); put("name", name); put("code", code); put("description", description); put("instructor", instructor); put("tint", tint); put("createdAt", createdAt) }
        is WorkspaceLesson -> JSONObject().apply { put("id", id); put("courseId", courseId); put("title", title); put("description", description); put("content", content); put("completed", completed); put("updatedAt", updatedAt) }
        is WorkspaceMaterial -> JSONObject().apply { put("id", id); put("title", title); putNullable("courseId", courseId); put("content", content); put("fileName", fileName); put("createdAt", createdAt); put("updatedAt", updatedAt) }
        is WorkspaceTask -> JSONObject().apply { put("id", id); put("title", title); put("description", description); putNullable("dueDate", dueDate); putNullable("dueTime", dueTime); put("priority", priority); putNullable("courseId", courseId); put("completed", completed); put("createdAt", createdAt); putNullable("completedAt", completedAt) }
        is WorkspaceEvent -> JSONObject().apply { put("id", id); put("title", title); put("description", description); put("date", date); put("repeatWeekly", repeatWeekly); put("startTime", startTime); put("endTime", endTime); put("type", type); putNullable("courseId", courseId); put("location", location); put("color", color); put("createdAt", createdAt) }
        is WorkspaceBlock -> JSONObject().apply { put("id", id); put("date", date); put("title", title); put("startTime", startTime); put("endTime", endTime); putNullable("taskId", taskId); putNullable("courseId", courseId); put("completed", completed); put("order", order); put("createdAt", createdAt) }
        is WorkspaceFocusSession -> JSONObject().apply { put("id", id); put("mode", mode); put("startedAt", startedAt); put("endedAt", endedAt); put("durationSeconds", durationSeconds); putNullable("courseId", courseId); putNullable("taskId", taskId); put("completed", completed) }
        else -> error("Unsupported workspace record: ${this::class.java.name}")
    }

    private fun JSONObject.putNullable(key: String, value: Any?) { if (value == null) put(key, JSONObject.NULL) else put(key, value) }
    private fun JSONObject.nullableString(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
    private inline fun <T> List<T>.toJsonArray(block: (T) -> JSONObject) = JSONArray().also { array -> forEach { array.put(block(it)) } }
}
