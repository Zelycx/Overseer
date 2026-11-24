import SwiftUI
import FirebaseCore

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    private var progress: Double { store.tasks.isEmpty ? 0 : Double(store.completedCount) / Double(store.tasks.count) }
    var body: some View {
        PageBackground {
            VStack(alignment: .leading, spacing: 5) {
                Text("Good afternoon 👋").font(.title2.bold()).foregroundStyle(OverseerColor.navy)
                Text(Date.now.overseerDate).font(.subheadline).foregroundStyle(OverseerColor.muted)
            }
            SurfaceCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack { Label("TODAY'S PROGRESS", systemImage: "sparkles").font(.caption.bold()); Spacer(); Text("\(store.completedCount)/\(store.tasks.count)").font(.caption.bold()) }
                    Text("You're making progress.").font(.title3.bold())
                    ProgressBar(progress: progress)
                    Text("\(store.completedCount) of \(store.tasks.count) tasks completed").font(.caption).foregroundStyle(.white.opacity(0.8))
                }.foregroundStyle(.white)
            }.background(OverseerColor.navy, in: RoundedRectangle(cornerRadius: 20))
            SectionTitle(title: "Up next")
            NavigationLink { DayPlannerView() } label: {
                SurfaceCard {
                    HStack(spacing: 14) {
                        Image(systemName: "calendar.badge.clock").font(.title2).foregroundStyle(OverseerColor.navy)
                        VStack(alignment: .leading, spacing: 4) { Text("Plan your day").font(.headline).foregroundStyle(OverseerColor.navy); Text("See your schedule and priorities").font(.caption).foregroundStyle(OverseerColor.muted) }
                        Spacer(); Image(systemName: "chevron.right").foregroundStyle(OverseerColor.muted)
                    }
                }
            }.buttonStyle(.plain)
            HStack {
                SectionTitle(title: "Today's tasks")
                NavigationLink { TasksView() } label: { Text("See all").font(.subheadline.bold()).foregroundStyle(OverseerColor.navy) }
            }
            SurfaceCard { VStack(spacing: 18) { ForEach(store.tasks) { task in TaskRow(task: task) { store.toggle(task) } } } }
            NavigationLink { AssistantView() } label: {
                HStack { Image(systemName: "sparkles"); Text("Open Study Assistant").fontWeight(.semibold); Spacer(); Image(systemName: "arrow.up.right") }
                    .padding(17).foregroundStyle(OverseerColor.navy).background(OverseerColor.lime, in: RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain)
        }.navigationTitle("Home").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings") } }
    }
}

struct ScheduleView: View {
    @State private var selectedDate = Calendar.current.startOfDay(for: .now)
    private struct ClassItem { let title, time, location: String }
    private var classes: [ClassItem] {
        let weekday = Calendar.current.component(.weekday, from: selectedDate)
        switch weekday {
        case 5: return [ClassItem(title: "Database Management", time: "10:00 AM – 11:30 AM", location: "Room 204"), ClassItem(title: "Programming", time: "1:00 PM – 2:30 PM", location: "Room 301")]
        case 2: return [ClassItem(title: "Database Management", time: "10:00 AM – 11:30 AM", location: "Room 204")]
        case 3, 6: return [ClassItem(title: "Programming", time: "1:00 PM – 2:30 PM", location: "Room 301")]
        default: return []
        }
    }
    var body: some View {
        PageBackground {
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                Spacer()
                VStack(spacing: 4) { Text(selectedDate.formatted(.dateTime.weekday(.wide))).font(.title3.bold()); Text(selectedDate.formatted(.dateTime.month(.wide).day().year())).font(.caption).foregroundStyle(OverseerColor.muted) }
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
            }.foregroundStyle(OverseerColor.navy).padding(.vertical, 8)
            if classes.isEmpty {
                SurfaceCard { VStack(spacing: 12) { Image(systemName: "calendar").font(.largeTitle).foregroundStyle(OverseerColor.muted); Text("No classes today").font(.headline); Text("Enjoy the space in your schedule.").font(.subheadline).foregroundStyle(OverseerColor.muted) }.frame(maxWidth: .infinity).padding(.vertical, 25) }
            } else {
                ForEach(Array(classes.enumerated()), id: \.offset) { _, item in
                    SurfaceCard { HStack(spacing: 14) { RoundedRectangle(cornerRadius: 3).fill(OverseerColor.lime).frame(width: 5); VStack(alignment: .leading, spacing: 7) { Text(item.title).font(.headline); Label(item.time, systemImage: "clock").font(.subheadline).foregroundStyle(OverseerColor.muted); Label(item.location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(OverseerColor.muted) } }.foregroundStyle(OverseerColor.navy) }
                }
            }
        }.navigationTitle("Schedule").navigationBarTitleDisplayMode(.inline)
    }
    private func shift(_ days: Int) { selectedDate = Calendar.current.date(byAdding: .day, value: days, to: selectedDate) ?? selectedDate }
}

struct LibraryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showingAdd = false
    var body: some View {
        PageBackground {
            SectionTitle(title: "Your subjects", action: { showingAdd = true }, actionTitle: "+ Add subject")
            ForEach(store.subjects) { subject in
                NavigationLink { SubjectDetailView(subjectID: subject.id) } label: {
                    SurfaceCard { HStack(spacing: 14) { Image(systemName: "book.closed.fill").font(.title2).foregroundStyle(OverseerColor.navy).frame(width: 42, height: 42).background(OverseerColor.lime.opacity(0.35), in: RoundedRectangle(cornerRadius: 12)); VStack(alignment: .leading, spacing: 5) { Text(subject.name).font(.headline).foregroundStyle(OverseerColor.navy); Text(subject.detail).font(.caption).foregroundStyle(OverseerColor.muted).lineLimit(2) }; Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(OverseerColor.muted) } }
                }.buttonStyle(.plain)
            }
            NavigationLink { ImportMaterialView() } label: { Label("Import study material", systemImage: "square.and.arrow.down").font(.subheadline.bold()).foregroundStyle(OverseerColor.navy).frame(maxWidth: .infinity).padding() }.buttonStyle(.plain)
        }.navigationTitle("Library").sheet(isPresented: $showingAdd) { AddItemSheet(title: "Add subject", prompt: "Subject name", buttonTitle: "Add subject") { store.addSubject($0) } }
    }
}

struct SubjectDetailView: View {
    @EnvironmentObject private var store: AppStore
    let subjectID: UUID
    @State private var showingAdd = false
    private var subject: StudySubject? { store.subjects.first { $0.id == subjectID } }
    var body: some View {
        PageBackground {
            VStack(alignment: .leading, spacing: 6) { Text(subject?.name ?? "Subject").font(.largeTitle.bold()).foregroundStyle(OverseerColor.navy); Text("Your learning space.").font(.subheadline).foregroundStyle(OverseerColor.muted) }
            SectionTitle(title: "Study Materials", action: { showingAdd = true }, actionTitle: "+ Add material")
            if let items = subject?.materials, !items.isEmpty {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in SurfaceCard { Label(item, systemImage: "doc.text").font(.subheadline.weight(.medium)).foregroundStyle(OverseerColor.navy) } }
            } else {
                SurfaceCard { VStack(spacing: 10) { Image(systemName: "doc.text").font(.largeTitle).foregroundStyle(OverseerColor.muted); Text("No materials yet").font(.headline); Text("Add notes, readings, or links to keep everything together.").font(.subheadline).multilineTextAlignment(.center).foregroundStyle(OverseerColor.muted) }.frame(maxWidth: .infinity).padding(.vertical, 20) }
            }
        }.sheet(isPresented: $showingAdd) { AddItemSheet(title: "Add material", prompt: "Material title", buttonTitle: "Add material") { store.addMaterial($0, to: subjectID) } }
    }
}

struct AddItemSheet: View {
    let title, prompt, buttonTitle: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var value = ""
    var body: some View {
        NavigationStack {
            Form { TextField(prompt, text: $value) }
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(buttonTitle) { onSave(value); dismiss() }.disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) } }
        }.presentationDetents([.medium])
    }
}
