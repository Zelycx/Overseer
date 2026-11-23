import SwiftUI

struct FocusView: View {
    @State private var selectedMinutes = 25
    @State private var remainingSeconds = 25 * 60
    @State private var isRunning = false
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private var timeText: String { String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60) }
    var body: some View {
        PageBackground {
            SurfaceCard {
                VStack(spacing: 22) {
                    Text("A little focus goes a long way.").font(.subheadline).foregroundStyle(OverseerColor.muted)
                    Text(timeText).font(.system(size: 64, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(OverseerColor.navy)
                    if !isRunning {
                        Picker("Duration", selection: $selectedMinutes) { ForEach([15, 25, 45, 60], id: \.self) { Text("\($0) min").tag($0) } }.pickerStyle(.segmented).onChange(of: selectedMinutes) { _, value in remainingSeconds = value * 60 }
                    }
                    Button { if isRunning { isRunning = false } else { if remainingSeconds == 0 { remainingSeconds = selectedMinutes * 60 }; isRunning = true } } label: {
                        Label(isRunning ? "Stop session" : "Start focus", systemImage: isRunning ? "stop.fill" : "play.fill").font(.headline).foregroundStyle(OverseerColor.navy).frame(maxWidth: .infinity).padding(16).background(OverseerColor.lime, in: RoundedRectangle(cornerRadius: 15))
                    }.buttonStyle(.plain)
                    Text("Keep this screen open for the most reliable countdown.").font(.caption).foregroundStyle(OverseerColor.muted).multilineTextAlignment(.center)
                }.frame(maxWidth: .infinity)
            }
        }.navigationTitle("Focus").onReceive(ticker) { _ in if isRunning { if remainingSeconds > 0 { remainingSeconds -= 1 } else { isRunning = false } } }
    }
}

struct ProgressViewScreen: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        PageBackground {
            Text("Your effort adds up.").font(.title2.bold()).foregroundStyle(OverseerColor.navy)
            Text("Sample data · Personal insights will appear as you use Overseer.").font(.caption).foregroundStyle(OverseerColor.muted)
            HStack(spacing: 12) {
                metric("Tasks done", value: "\(store.completedCount)", icon: "checkmark.circle")
                metric("Focus time", value: "0 min", icon: "timer")
            }
            SurfaceCard {
                VStack(alignment: .leading, spacing: 17) {
                    Text("Weekly activity").font(.headline).foregroundStyle(OverseerColor.navy)
                    HStack(alignment: .bottom, spacing: 12) { ForEach(Array(zip(["M", "T", "W", "T", "F", "S", "S"], [0.45, 0.75, 0.3, 0.85, 0.55, 0.2, 0.1])), id: \.0) { day, height in VStack(spacing: 7) { Capsule().fill(OverseerColor.lime).frame(height: 90 * height); Text(day).font(.caption2).foregroundStyle(OverseerColor.muted) }.frame(maxWidth: .infinity) } }
                }
            }
            SurfaceCard { VStack(alignment: .leading, spacing: 8) { Label("Learning progress", systemImage: "chart.line.uptrend.xyaxis").font(.headline).foregroundStyle(OverseerColor.navy); Text("Subject insights will show here once progress tracking is connected.").font(.subheadline).foregroundStyle(OverseerColor.muted) } }
        }.navigationTitle("Progress")
    }
    private func metric(_ title: String, value: String, icon: String) -> some View {
        SurfaceCard { VStack(alignment: .leading, spacing: 12) { Image(systemName: icon).foregroundStyle(OverseerColor.navy); Text(value).font(.title2.bold()).foregroundStyle(OverseerColor.navy); Text(title).font(.caption).foregroundStyle(OverseerColor.muted) } }.frame(maxWidth: .infinity)
    }
}

struct DayPlannerView: View {
    var body: some View {
        PageBackground {
            Text(Date.now.overseerDate).font(.title2.bold()).foregroundStyle(OverseerColor.navy)
            SurfaceCard { VStack(alignment: .leading, spacing: 8) { Label("Day Planner", systemImage: "calendar.day.timeline.left").font(.headline); Text("Your daily plan will bring classes and tasks together here.").font(.subheadline).foregroundStyle(OverseerColor.muted) } }
            NavigationLink("View schedule", destination: ScheduleView()).foregroundStyle(OverseerColor.navy)
            NavigationLink("View tasks", destination: TasksView()).foregroundStyle(OverseerColor.navy)
        }.navigationTitle("Day Planner")
    }
}

struct TasksView: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        PageBackground {
            Text("Your tasks for today").font(.title2.bold()).foregroundStyle(OverseerColor.navy)
            SurfaceCard { VStack(spacing: 20) { ForEach(store.tasks) { task in TaskRow(task: task) { store.toggle(task) } } } }
            Text("Task creation will be available in a future update.").font(.caption).foregroundStyle(OverseerColor.muted)
        }.navigationTitle("Tasks")
    }
}

struct AssistantView: View {
    var body: some View { PlaceholderScreen(icon: "sparkles", title: "Study Assistant", message: "AI study support is not connected yet. Your materials and learning context will be available here in a future update.").navigationTitle("Study Assistant") }
}

struct SettingsView: View {
    var body: some View { PlaceholderScreen(icon: "gearshape", title: "Settings", message: "Account preferences and sync settings are not connected yet.").navigationTitle("Settings") }
}

struct ImportMaterialView: View {
    var body: some View { PlaceholderScreen(icon: "square.and.arrow.down", title: "Import Material", message: "Importing files and links is not connected yet. You can add material titles from a subject page.").navigationTitle("Import Material") }
}

struct PlaceholderScreen: View {
    let icon, title, message: String
    var body: some View {
        PageBackground {
            SurfaceCard { VStack(spacing: 14) { Image(systemName: icon).font(.largeTitle).foregroundStyle(OverseerColor.navy); Text(title).font(.title2.bold()).foregroundStyle(OverseerColor.navy); Text(message).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(OverseerColor.muted) }.frame(maxWidth: .infinity).padding(.vertical, 25) }
        }
    }
}
