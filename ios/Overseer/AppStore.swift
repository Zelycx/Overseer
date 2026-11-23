import Foundation
import SwiftUI

struct StudyTask: Identifiable, Codable {
    var id: UUID = UUID()
    var title: String
    var detail: String
    var isComplete: Bool = false
}

struct StudySubject: Identifiable, Codable {
    var id: UUID = UUID()
    var name: String
    var detail: String
    var materials: [String] = []
}

final class AppStore: ObservableObject {
    @Published var tasks: [StudyTask] { didSet { save(tasks, key: "tasks") } }
    @Published var subjects: [StudySubject] { didSet { save(subjects, key: "subjects") } }

    init() {
        tasks = Self.load([StudyTask].self, key: "tasks") ?? [
            StudyTask(title: "Review database notes", detail: "Database Management · 30 min"),
            StudyTask(title: "Practice Swift functions", detail: "Programming · 45 min"),
            StudyTask(title: "Read chapter 4", detail: "Independent study · 20 min")
        ]
        subjects = Self.load([StudySubject].self, key: "subjects") ?? [
            StudySubject(name: "Database Management", detail: "Organize notes, readings, and class materials."),
            StudySubject(name: "Programming", detail: "Build your understanding one concept at a time.")
        ]
    }

    var completedCount: Int { tasks.filter(\.isComplete).count }
    func toggle(_ task: StudyTask) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index].isComplete.toggle()
    }
    func addSubject(_ name: String) {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        subjects.append(StudySubject(name: value, detail: "Your study space for \(value)."))
    }
    func addMaterial(_ title: String, to subjectID: UUID) {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, let index = subjects.firstIndex(where: { $0.id == subjectID }) else { return }
        subjects[index].materials.append(value)
    }
    private func save<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
    private static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
