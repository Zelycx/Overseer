package com.example.overseer.data.firestore

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue

class AuthenticatedFirestoreRepository(
    private val firestore: FirebaseFirestore,
) {
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()

    private fun currentUid(): String = auth.currentUser?.uid
        ?: throw IllegalStateException("Sign in before accessing workspace data.")

    fun observeDocument(
        collection: String,
        id: String,
        decoder: (String, Map<String, Any?>) -> Any,
        onValue: (ActiveFocusTimer) -> Unit,
        onError: (Exception) -> Unit,
    ): ListenerRegistration {
        val uid = currentUid()
        return firestore.collection("users").document(uid).collection(collection).document(id)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { onError(error); return@addSnapshotListener }
                if (snapshot == null || !snapshot.exists()) return@addSnapshotListener
                try {
                    @Suppress("UNCHECKED_CAST")
                    onValue(decoder(snapshot.id, snapshot.data ?: emptyMap()) as ActiveFocusTimer)
                } catch (cause: Exception) {
                    onError(cause)
                }
            }
    }

    fun observeCollection(
        collection: String,
        decoder: (String, Map<String, Any?>) -> Any,
        onValue: (List<Any>) -> Unit,
        onError: (Exception) -> Unit,
    ): ListenerRegistration {
        val uid = currentUid()
        return firestore.collection("users")
            .document(uid)
            .collection(collection)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    onError(error)
                    return@addSnapshotListener
                }
                val rows = snapshot?.documents?.mapNotNull { document ->
                    try {
                        decoder(document.id, document.data ?: emptyMap())
                    } catch (_: RuntimeException) {
                        null
                    }
                } ?: emptyList()
                onValue(rows)
            }
    }

    fun setDocument(collection: String, id: String, fields: Map<String, Any?>, merge: Boolean) {
        val uid = currentUid()
        firestore.collection("users")
            .document(uid)
            .collection(collection)
            .document(id)
            .let { reference ->
                if (merge) reference.set(fields, com.google.firebase.firestore.SetOptions.merge())
                else reference.set(fields)
            }
    }

    fun deleteDocument(collection: String, id: String) {
        val uid = currentUid()
        firestore.collection("users")
            .document(uid)
            .collection(collection)
            .document(id)
            .delete()
    }

    fun createTask(id: String, title: String, description: String, dueDate: String?, dueAt: Timestamp?, timeZoneId: String?, priority: Priority, courseId: String?) {
        val model = Task(
            id = id,
            createdAt = Timestamp.now(),
            updatedAt = Timestamp.now(),
            title = title,
            description = description,
            dueAt = dueAt,
            dueDate = dueDate,
            timeZoneId = timeZoneId,
            priority = priority,
            courseId = courseId,
            completed = false,
            completedAt = null,
            sortOrder = Timestamp.now().seconds.toDouble(),
            deletionStatus = DeletionStatus.ACTIVE,
            deletionJobId = null,
            deletionStartedAt = null,
        )
        setDocument("tasks", id, CanonicalCodecs.encodeTaskCreate(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun updateTask(model: Task) {
        setDocument("tasks", model.id, CanonicalCodecs.encodeTaskUpdate(model).plus("updatedAt" to FieldValue.serverTimestamp()), merge = true)
    }

    fun createLesson(model: Lesson) {
        setDocument("lessons", model.id, CanonicalCodecs.encodeLesson(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun createMaterial(model: StudyMaterial) {
        setDocument("materials", model.id, CanonicalCodecs.encodeStudyMaterial(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun createEvent(model: ScheduleEvent) {
        setDocument("events", model.id, CanonicalCodecs.encodeScheduleEvent(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun createPlannerBlock(model: PlannerBlock) {
        setDocument("plannerBlocks", model.id, CanonicalCodecs.encodePlannerBlock(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun createFocusSession(model: FocusSession) {
        setDocument("focusSessions", model.id, CanonicalCodecs.encodeFocusSession(model).plus("createdAt" to FieldValue.serverTimestamp()).plus("updatedAt" to FieldValue.serverTimestamp()), merge = false)
    }

    fun savePreferences(model: UserPreferences) {
        val uid = currentUid()
        firestore.collection("users").document(uid).collection("settings").document("preferences")
            .set(CanonicalCodecs.encodeUserPreferences(model).plus("updatedAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge())
    }

    fun saveTimerPreferences(model: TimerPreferences) {
        val uid = currentUid()
        firestore.collection("users").document(uid).collection("settings").document("timerPreferences")
            .set(CanonicalCodecs.encodeTimerPreferences(model).plus("updatedAt" to FieldValue.serverTimestamp()), com.google.firebase.firestore.SetOptions.merge())
    }

    fun saveActiveFocusTimer(model: ActiveFocusTimer) {
        setDocument("focusTimer", "active", CanonicalCodecs.encodeActiveFocusTimer(model).plus("updatedAt" to FieldValue.serverTimestamp()), merge = true)
    }
}
