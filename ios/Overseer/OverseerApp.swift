import SwiftUI
import FirebaseCore

@main
struct OverseerApp: App {
    @StateObject private var store = AppStore()

    init() {
        guard FirebaseApp.app() == nil,
              Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else { return }
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(store)
                .tint(OverseerColor.navy)
        }
    }
}

struct RootTabView: View {
    var body: some View {
        TabView {
            NavigationStack { HomeView() }
                .tabItem { Label("Home", systemImage: "house.fill") }
            NavigationStack { ScheduleView() }
                .tabItem { Label("Schedule", systemImage: "calendar") }
            NavigationStack { LibraryView() }
                .tabItem { Label("Library", systemImage: "books.vertical") }
            NavigationStack { FocusView() }
                .tabItem { Label("Focus", systemImage: "timer") }
            NavigationStack { ProgressViewScreen() }
                .tabItem { Label("Progress", systemImage: "chart.bar.fill") }
        }
    }
}
