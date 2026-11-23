import Foundation

// This value is the SDK-independent representation of a Firestore Timestamp.
// An eventual Firebase adapter must bridge to/from Timestamp.seconds and
// Timestamp.nanoseconds; converting through Date is presentation-only.
struct FirestoreInstant: Codable, Equatable, Comparable {
    let seconds: Int64
    let nanoseconds: Int32

    init(seconds: Int64, nanoseconds: Int32) throws {
        guard (0..<1_000_000_000).contains(nanoseconds) else {
            throw CanonicalFirestoreError.invalidTimestamp
        }
        self.seconds = seconds
        self.nanoseconds = nanoseconds
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            seconds: values.decode(Int64.self, forKey: .seconds),
            nanoseconds: values.decode(Int32.self, forKey: .nanoseconds)
        )
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(seconds, forKey: .seconds)
        try values.encode(nanoseconds, forKey: .nanoseconds)
    }

    var dateForPresentation: Date {
        Date(timeIntervalSince1970: Double(seconds) + Double(nanoseconds) / 1_000_000_000)
    }

    static func < (lhs: FirestoreInstant, rhs: FirestoreInstant) -> Bool {
        lhs.seconds == rhs.seconds
            ? lhs.nanoseconds < rhs.nanoseconds
            : lhs.seconds < rhs.seconds
    }

    private enum CodingKeys: String, CodingKey { case seconds, nanoseconds }
}

enum CanonicalFirestoreError: Error, Equatable {
    case invalidDocumentID
    case unexpectedFields
    case invalidTimestamp
    case invalidDocument
    case invalidDateOnly
}

enum CanonicalPriority: String, Codable { case low = "Low", medium = "Medium", high = "High" }
enum CanonicalCourseTint: String, Codable { case lavender, mint, sand }
enum CanonicalEventType: String, Codable { case `class`, study, personal, other }
enum CanonicalEventColor: String, Codable { case navy, lime, blue, amber }
enum CanonicalFocusMode: String, Codable { case focus, shortBreak, longBreak }
enum CanonicalTimerStatus: String, Codable { case idle, running, paused }
enum CanonicalDeletionStatus: String, Codable { case active, deleting }
enum CanonicalEndpointDisambiguation: String, Codable { case earlier, later }
enum CanonicalTimeFormat: String, Codable { case twelveHour = "12h", twentyFourHour = "24h" }

struct CanonicalDocument<Model: Codable> {
    // Firestore path identity is kept outside the encoded document body.
    let id: String
    let value: Model

    init(id: String, value: Model) throws {
        guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !id.contains("/") else {
            throw CanonicalFirestoreError.invalidDocumentID
        }
        self.id = id
        self.value = value
    }
}

protocol CanonicalFirestoreModel: Codable {
    static var schemaVersion: Int { get }
    static var fieldNames: Set<String> { get }
    static var timestampFieldNames: Set<String> { get }
    func validateCanonicalFields() -> Bool
}

struct CanonicalFirestoreCodec {
    /// `timestampValue` adapts the platform SDK Timestamp to exact seconds and nanoseconds.
    /// The decoder rejects unknown/missing fields before decoding enum and value types.
    static func decode<Model: CanonicalFirestoreModel>(
        id: String,
        fields: [String: Any],
        timestampValue: (Any) -> FirestoreInstant?
    ) throws -> CanonicalDocument<Model> {
        guard Set(fields.keys) == Model.fieldNames else {
            throw CanonicalFirestoreError.unexpectedFields
        }
        var normalized = fields
        for name in Model.timestampFieldNames {
            guard let raw = fields[name], !(raw is NSNull) else { continue }
            guard let instant = timestampValue(raw) else {
                throw CanonicalFirestoreError.invalidTimestamp
            }
            normalized[name] = ["seconds": instant.seconds, "nanoseconds": instant.nanoseconds]
        }
        let data = try JSONSerialization.data(withJSONObject: normalized, options: [.fragmentsAllowed])
        let value = try JSONDecoder().decode(Model.self, from: data)
        guard value.validateCanonicalFields() else { throw CanonicalFirestoreError.invalidDocument }
        return try CanonicalDocument(id: id, value: value)
    }

    /// Returns an SDK-independent representation; callers must adapt timestamp maps to
    /// native Firestore Timestamp objects before writing. The model has no document ID.
    static func encode<Model: CanonicalFirestoreModel>(
        _ document: CanonicalDocument<Model>
    ) throws -> [String: Any] {
        guard document.value.validateCanonicalFields() else {
            throw CanonicalFirestoreError.invalidDocument
        }
        let data = try JSONEncoder().encode(document.value)
        let object = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        guard let fields = object as? [String: Any], Set(fields.keys) == Model.fieldNames else {
            throw CanonicalFirestoreError.unexpectedFields
        }
        return fields
    }

    static func encodeClientUpdate<Model: CanonicalFirestoreModel>(
        collection: String,
        document: CanonicalDocument<Model>
    ) throws -> [String: Any] {
        CanonicalClientWritePolicy.updateFields(
            collection: collection,
            candidate: try encode(document)
        )
    }

    /// Returns only caller-owned create fields. The Firebase adapter must add the
    /// schema version, server timestamps, and active deletion lifecycle itself.
    static func encodeClientCreate<Model: CanonicalFirestoreModel>(
        collection: String,
        document: CanonicalDocument<Model>
    ) throws -> [String: Any] {
        CanonicalClientWritePolicy.createFields(
            collection: collection,
            candidate: try encode(document)
        )
    }
}

struct CanonicalMetadata: Codable, Equatable {
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant

    func isValid(version: Int) -> Bool {
        schemaVersion == version
    }
}

struct CanonicalUserProfile: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "displayName"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let displayName: String
    func validateCanonicalFields() -> Bool { schemaVersion == Self.schemaVersion }
}

struct CanonicalCourse: CanonicalFirestoreModel {
    static let schemaVersion = 2
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "name", "code", "description", "instructor", "tint", "sortOrder", "deletionStatus", "deletionJobId", "deletionStartedAt"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "deletionStartedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let name: String
    let code: String
    let description: String
    let instructor: String
    let tint: CanonicalCourseTint
    let sortOrder: Double
    let deletionStatus: CanonicalDeletionStatus
    let deletionJobId: String?
    let deletionStartedAt: FirestoreInstant?
    func validateCanonicalFields() -> Bool {
        schemaVersion == Self.schemaVersion
            && ((deletionStatus == .active && deletionJobId == nil && deletionStartedAt == nil)
                || (deletionStatus == .deleting && !(deletionJobId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && deletionStartedAt != nil))
    }
}

struct CanonicalLesson: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "courseId", "title", "description", "content", "completed", "sortOrder"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let courseId: String
    let title: String
    let description: String
    let content: String
    let completed: Bool
    let sortOrder: Double
    func validateCanonicalFields() -> Bool { schemaVersion == Self.schemaVersion && !courseId.isEmpty }
}

struct CanonicalStudyMaterial: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "title", "content", "fileName", "courseId", "sortOrder"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let title: String
    let content: String
    let fileName: String
    let courseId: String?
    let sortOrder: Double
    func validateCanonicalFields() -> Bool { schemaVersion == Self.schemaVersion }
}

struct CanonicalTask: CanonicalFirestoreModel {
    static let schemaVersion = 2
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "title", "description", "dueAt", "dueDate", "timeZoneId", "priority", "courseId", "completed", "completedAt", "sortOrder", "deletionStatus", "deletionJobId", "deletionStartedAt"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "dueAt", "completedAt", "deletionStartedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let title: String
    let description: String
    let dueAt: FirestoreInstant?
    let dueDate: String?
    let timeZoneId: String?
    let priority: CanonicalPriority
    let courseId: String?
    let completed: Bool
    let completedAt: FirestoreInstant?
    let sortOrder: Double
    let deletionStatus: CanonicalDeletionStatus
    let deletionJobId: String?
    let deletionStartedAt: FirestoreInstant?
    func validateCanonicalFields() -> Bool {
        guard schemaVersion == Self.schemaVersion,
              validDateOnly(dueDate),
              (dueAt == nil && timeZoneId == nil) || (dueAt != nil && validNonEmpty(timeZoneId)),
              !(dueAt != nil && dueDate != nil) else { return false }
        return (deletionStatus == .active && deletionJobId == nil && deletionStartedAt == nil)
            || (deletionStatus == .deleting && validNonEmpty(deletionJobId) && deletionStartedAt != nil)
    }
}

struct CanonicalEvent: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "title", "description", "startAt", "endAt", "timeZoneId", "type", "courseId", "location", "color", "startTimeDisambiguation", "endTimeDisambiguation"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "startAt", "endAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let title: String
    let description: String
    let startAt: FirestoreInstant
    let endAt: FirestoreInstant
    let timeZoneId: String
    let type: CanonicalEventType
    let courseId: String?
    let location: String
    let color: CanonicalEventColor
    let startTimeDisambiguation: CanonicalEndpointDisambiguation?
    let endTimeDisambiguation: CanonicalEndpointDisambiguation?
    func validateCanonicalFields() -> Bool {
        schemaVersion == Self.schemaVersion && endAt > startAt && validNonEmpty(timeZoneId)
    }
}

struct CanonicalPlannerBlock: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "title", "startAt", "endAt", "timeZoneId", "taskId", "courseId", "completed", "sortOrder"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "startAt", "endAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let title: String
    let startAt: FirestoreInstant
    let endAt: FirestoreInstant
    let timeZoneId: String
    let taskId: String?
    let courseId: String?
    let completed: Bool
    let sortOrder: Double
    func validateCanonicalFields() -> Bool { schemaVersion == Self.schemaVersion && endAt > startAt && validNonEmpty(timeZoneId) }
}

struct CanonicalFocusSession: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "mode", "startedAt", "endedAt", "durationSeconds", "courseId", "taskId", "completed"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "startedAt", "endedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let mode: CanonicalFocusMode
    let startedAt: FirestoreInstant
    let endedAt: FirestoreInstant
    let durationSeconds: Int
    let courseId: String?
    let taskId: String?
    let completed: Bool
    func validateCanonicalFields() -> Bool { schemaVersion == Self.schemaVersion && durationSeconds > 0 && completed }
}

struct CanonicalUserPreferences: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "displayName", "timeFormat", "firstDayOfWeek", "timeZoneId", "aiWorkspaceContextConsent", "consentedAt", "revokedAt", "consentVersion"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "consentedAt", "revokedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let displayName: String
    let timeFormat: CanonicalTimeFormat
    let firstDayOfWeek: Int
    let timeZoneId: String
    let aiWorkspaceContextConsent: Bool
    let consentedAt: FirestoreInstant?
    let revokedAt: FirestoreInstant?
    let consentVersion: String?
    func validateCanonicalFields() -> Bool {
        schemaVersion == Self.schemaVersion && (firstDayOfWeek == 0 || firstDayOfWeek == 1)
            && validNonEmpty(timeZoneId)
    }
}

struct CanonicalTimerPreferences: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "focusDurationSeconds", "shortBreakDurationSeconds", "longBreakDurationSeconds"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let focusDurationSeconds: Int
    let shortBreakDurationSeconds: Int
    let longBreakDurationSeconds: Int
    func validateCanonicalFields() -> Bool {
        schemaVersion == Self.schemaVersion && focusDurationSeconds > 0
            && shortBreakDurationSeconds > 0 && longBreakDurationSeconds > 0
    }
}

struct CanonicalActiveFocusTimer: CanonicalFirestoreModel {
    static let schemaVersion = 1
    static let fieldNames: Set<String> = ["schemaVersion", "createdAt", "updatedAt", "status", "mode", "durationSeconds", "remainingSeconds", "elapsedSeconds", "generation", "writeGeneration", "startedAt", "segmentStartedAt", "endsAt", "courseId", "taskId", "runId"]
    static let timestampFieldNames: Set<String> = ["createdAt", "updatedAt", "startedAt", "segmentStartedAt", "endsAt"]
    let schemaVersion: Int
    let createdAt: FirestoreInstant
    let updatedAt: FirestoreInstant
    let status: CanonicalTimerStatus
    let mode: CanonicalFocusMode
    let durationSeconds: Int
    let remainingSeconds: Int
    let elapsedSeconds: Int
    let generation: Int
    let writeGeneration: Int
    let startedAt: FirestoreInstant?
    let segmentStartedAt: FirestoreInstant?
    let endsAt: FirestoreInstant?
    let courseId: String?
    let taskId: String?
    let runId: String?
    func validateCanonicalFields() -> Bool {
        schemaVersion == Self.schemaVersion && durationSeconds > 0 && remainingSeconds >= 0
            && elapsedSeconds >= 0 && generation >= 0 && writeGeneration >= 0
    }
}

enum CanonicalClientWritePolicy {
    // Creation lifecycle is always initialized by the adapter; caller-provided
    // lifecycle values and metadata are never used to form a create/update patch.
    static let immutableMetadata: Set<String> = ["createdAt", "schemaVersion"]
    static let trustedLifecycle: Set<String> = ["deletionStatus", "deletionJobId", "deletionStartedAt"]
    static let mutableFieldsByCollection: [String: Set<String>] = [
        "courses": ["name", "code", "description", "instructor", "tint", "sortOrder", "updatedAt"],
        "lessons": ["courseId", "title", "description", "content", "completed", "sortOrder", "updatedAt"],
        "materials": ["title", "content", "fileName", "courseId", "sortOrder", "updatedAt"],
        "tasks": ["title", "description", "dueAt", "dueDate", "timeZoneId", "priority", "courseId", "completed", "completedAt", "sortOrder", "updatedAt"],
        "events": ["title", "description", "startAt", "endAt", "timeZoneId", "type", "courseId", "location", "color", "startTimeDisambiguation", "endTimeDisambiguation", "updatedAt"],
        "plannerBlocks": ["title", "startAt", "endAt", "timeZoneId", "taskId", "courseId", "completed", "sortOrder", "updatedAt"],
        "settings/preferences": ["displayName", "timeFormat", "firstDayOfWeek", "timeZoneId", "aiWorkspaceContextConsent", "consentedAt", "revokedAt", "consentVersion", "updatedAt"],
        "settings/timerPreferences": ["focusDurationSeconds", "shortBreakDurationSeconds", "longBreakDurationSeconds", "updatedAt"],
        "settings/focusTimer": ["status", "mode", "durationSeconds", "remainingSeconds", "elapsedSeconds", "writeGeneration", "startedAt", "segmentStartedAt", "endsAt", "courseId", "taskId", "runId", "updatedAt"],
    ]
    static let createFieldsByCollection: [String: Set<String>] = [
        "courses": ["name", "code", "description", "instructor", "tint", "sortOrder"],
        "lessons": ["courseId", "title", "description", "content", "completed", "sortOrder"],
        "materials": ["title", "content", "fileName", "courseId", "sortOrder"],
        "tasks": ["title", "description", "dueAt", "dueDate", "timeZoneId", "priority", "courseId", "completed", "completedAt", "sortOrder"],
        "events": ["title", "description", "startAt", "endAt", "timeZoneId", "type", "courseId", "location", "color", "startTimeDisambiguation", "endTimeDisambiguation"],
        "plannerBlocks": ["title", "startAt", "endAt", "timeZoneId", "taskId", "courseId", "completed", "sortOrder"],
        "focusSessions": ["mode", "startedAt", "endedAt", "durationSeconds", "courseId", "taskId", "completed"],
        "settings/preferences": ["displayName", "timeFormat", "firstDayOfWeek", "timeZoneId", "aiWorkspaceContextConsent", "consentedAt", "revokedAt", "consentVersion"],
        "settings/timerPreferences": ["focusDurationSeconds", "shortBreakDurationSeconds", "longBreakDurationSeconds"],
        "settings/focusTimer": ["status", "mode", "durationSeconds", "remainingSeconds", "elapsedSeconds", "generation", "writeGeneration", "startedAt", "segmentStartedAt", "endsAt", "courseId", "taskId", "runId"],
    ]

    static func updateFields(collection: String, candidate: [String: Any]) -> [String: Any] {
        guard let allowed = mutableFieldsByCollection[collection] else { return [:] }
        return candidate.filter { allowed.contains($0.key) }
    }

    static func createFields(collection: String, candidate: [String: Any]) -> [String: Any] {
        guard let allowed = createFieldsByCollection[collection] else { return [:] }
        return candidate.filter { allowed.contains($0.key) }
    }
}

private func validNonEmpty(_ value: String?) -> Bool {
    guard let value else { return false }
    return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

private func validDateOnly(_ value: String?) -> Bool {
    guard let value else { return true }
    let pieces = value.split(separator: "-", omittingEmptySubsequences: false)
    guard pieces.count == 3, pieces[0].count == 4, pieces[1].count == 2, pieces[2].count == 2,
          let year = Int(pieces[0]), let month = Int(pieces[1]), let day = Int(pieces[2]),
          year > 0, (1...12).contains(month) else { return false }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return (1...(days[month - 1])).contains(day)
}
