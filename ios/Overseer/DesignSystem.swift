import SwiftUI

enum OverseerColor {
    static let navy = Color(red: 19/255, green: 29/255, blue: 68/255)
    static let strongNavy = Color(red: 16/255, green: 25/255, blue: 56/255)
    static let lime = Color(red: 193/255, green: 1, blue: 0)
    static let background = Color(red: 253/255, green: 248/255, blue: 1)
    static let muted = Color(red: 120/255, green: 128/255, blue: 154/255)
    static let border = Color(red: 233/255, green: 231/255, blue: 239/255)
}

struct PageBackground<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 20) { content }.padding(20) }
            .background(OverseerColor.background.ignoresSafeArea())
    }
}

struct SurfaceCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(OverseerColor.border, lineWidth: 1))
    }
}

struct SectionTitle: View {
    let title: String
    var action: (() -> Void)? = nil
    var actionTitle: String = ""
    var body: some View {
        HStack {
            Text(title).font(.title3.bold()).foregroundStyle(OverseerColor.navy)
            Spacer()
            if let action { Button(actionTitle, action: action).font(.subheadline.bold()).foregroundStyle(OverseerColor.navy) }
        }
    }
}

struct TaskRow: View {
    let task: StudyTask
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                    .font(.title2).foregroundStyle(task.isComplete ? OverseerColor.navy : OverseerColor.muted)
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.title).font(.subheadline.weight(.semibold)).foregroundStyle(OverseerColor.navy)
                        .strikethrough(task.isComplete)
                    Text(task.detail).font(.caption).foregroundStyle(OverseerColor.muted)
                }
                Spacer(minLength: 0)
            }.contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

struct ProgressBar: View {
    let progress: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.2))
                Capsule().fill(OverseerColor.lime).frame(width: geo.size.width * min(max(progress, 0), 1))
            }
        }.frame(height: 10)
    }
}

extension Date {
    var overseerDate: String { formatted(.dateTime.weekday(.wide).month(.wide).day()) }
}
