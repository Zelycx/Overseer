import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import FirebaseFunctions
import Foundation
import Security
import SwiftUI
import UIKit

enum GoogleIntegrationProvider: String, Hashable {
    case calendar
    case classroom

    var title: String { self == .calendar ? "Google Calendar" : "Google Classroom" }
    var callbackPath: String { "/oauth/ios" }
    var dataFunction: String { self == .calendar ? "getGoogleCalendarEvents" : "getGoogleClassroomData" }
}

enum NativeGoogleOAuth {
    struct Callback {
        let state: String
        let code: String?
        let error: String?
    }

    static func verifier() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return Data(bytes).base64URLEncodedString()
    }

    static func challenge(_ verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
    }

    static func callback(_ url: URL, expectedHost: String, expectedPath: String = "/oauth/ios") -> Callback? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "https", components.host == expectedHost,
              components.path == expectedPath, components.user == nil, components.password == nil,
              components.fragment == nil, components.port == nil || components.port == 443 else { return nil }
        let items = components.queryItems ?? []
        func single(_ name: String) -> String? {
            let values = items.filter { $0.name == name }
            return values.count == 1 ? values.first?.value : nil
        }
        guard let state = single("state"), !state.isEmpty else { return nil }
        let code = single("code")?.nilIfEmpty
        let error = single("error")?.nilIfEmpty
        guard (code == nil) != (error == nil) else { return nil }
        return Callback(state: state, code: code, error: error)
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

@MainActor
final class GoogleIntegrationsStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var connection: [GoogleIntegrationProvider: String] = [:]
    @Published private(set) var data: [GoogleIntegrationProvider: String] = [:]
    @Published private(set) var loading: Set<GoogleIntegrationProvider> = []
    @Published var message: String?

    private var functions: Functions? {
        guard FirebaseApp.app() != nil else { return nil }
        return Functions.functions(region: "us-central1")
    }
    private var isSignedIn: Bool { FirebaseApp.app() != nil && Auth.auth().currentUser != nil }
    private var callbackHost: String {
        Bundle.main.object(forInfoDictionaryKey: "GOOGLE_OAUTH_HOST") as? String ?? "oauth.example.invalid"
    }
    private var pending: (provider: GoogleIntegrationProvider, state: String, verifier: String)?
    private var webSession: ASWebAuthenticationSession?

    func refreshStatus(for provider: GoogleIntegrationProvider) {
        guard isSignedIn else {
            connection[provider] = "Sign in to Overseer to connect Google services."
            return
        }
        loading.insert(provider)
        call("getGoogleIntegrationStatus", ["provider": provider.rawValue]) { [weak self] result, error in
            guard let self else { return }
            self.loading.remove(provider)
            let values = result as? [String: Any]
            self.connection[provider] = error == nil && (values?["connected"] as? Bool == true)
                ? "Connected" : (error == nil ? "Not connected" : "Connection status unavailable. Retry shortly.")
        }
    }

    func connect(_ provider: GoogleIntegrationProvider) {
        guard isSignedIn else {
            message = "Sign in to Overseer before connecting a Google account."
            return
        }
        guard let verifier = NativeGoogleOAuth.verifier() else {
            message = "Secure authorization could not be initialized. Please retry."
            return
        }
        loading.insert(provider)
        call("beginNativeGoogleAuthorization", ["provider": provider.rawValue, "platform": "ios", "codeChallenge": NativeGoogleOAuth.challenge(verifier)]) { [weak self] result, error in
            guard let self else { return }
            self.loading.remove(provider)
            guard error == nil, let result = result as? [String: Any],
                  let authorization = result["authorizationUrl"] as? String,
                  let state = result["state"] as? String, !state.isEmpty,
                  let redirect = result["redirectUri"] as? String,
                  let redirectURL = URL(string: redirect), redirectURL.scheme == "https",
                  redirectURL.host == self.callbackHost, redirectURL.path == provider.callbackPath,
                  redirectURL.user == nil, redirectURL.password == nil, redirectURL.fragment == nil,
                  redirectURL.query == nil, redirectURL.port == nil || redirectURL.port == 443,
                  let authURL = URL(string: authorization), authURL.scheme == "https", authURL.host == "accounts.google.com",
                  authURL.user == nil, let authComponents = URLComponents(url: authURL, resolvingAgainstBaseURL: false) else {
                self.message = "Google authorization is not configured for this iOS app."
                return
            }
            let authItems = authComponents.queryItems ?? []
            func uniqueQuery(_ key: String) -> String? {
                let found = authItems.filter { $0.name == key }
                return found.count == 1 ? found.first?.value : nil
            }
            guard uniqueQuery("state") == state,
                  uniqueQuery("code_challenge") == NativeGoogleOAuth.challenge(verifier),
                  uniqueQuery("code_challenge_method") == "S256",
                  uniqueQuery("redirect_uri") == redirect else {
                self.message = "Google authorization response did not match the requested security parameters."
                return
            }
            self.pending = (provider, state, verifier)
            let session = ASWebAuthenticationSession(url: authURL, callback: .https(host: self.callbackHost, path: provider.callbackPath)) { [weak self] url, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let url { self.handleCallback(url) }
                    else if error != nil { self.fail(provider, "Google authorization was cancelled or could not be completed.") }
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.webSession = session
            if !session.start() {
                self.fail(provider, "A secure browser session could not be started.")
            }
        }
    }

    func handleCallback(_ url: URL) {
        guard let callback = NativeGoogleOAuth.callback(url, expectedHost: callbackHost),
              let attempt = pending, callback.state == attempt.state else { return }
        guard callback.error == nil, let code = callback.code else {
            fail(attempt.provider, "Google authorization was cancelled or denied.")
            return
        }
        pending = nil
        loading.insert(attempt.provider)
        call("completeNativeGoogleAuthorization", [
            "provider": attempt.provider.rawValue, "platform": "ios", "state": callback.state,
            "code": code, "codeVerifier": attempt.verifier
        ]) { [weak self] result, error in
            guard let self else { return }
            self.loading.remove(attempt.provider)
            guard error == nil else {
                self.message = "Google could not complete the connection. Start a new attempt."
                return
            }
            let account = (result as? [String: Any])?["accountEmail"] as? String
            self.message = account.map { "\(attempt.provider.title) connected for \($0)." } ?? "\(attempt.provider.title) connected."
            self.refreshStatus(for: attempt.provider)
        }
        webSession = nil
    }

    func load(_ provider: GoogleIntegrationProvider) {
        guard isSignedIn else { message = "Sign in to Overseer to load Google data."; return }
        loading.insert(provider)
        var args: [String: Any] = [:]
        if provider == .calendar {
            args["timeMin"] = ISO8601DateFormatter().string(from: Date.now.addingTimeInterval(-7 * 86_400))
            args["timeMax"] = ISO8601DateFormatter().string(from: Date.now.addingTimeInterval(31 * 86_400))
        }
        call(provider.dataFunction, args) { [weak self] result, error in
            guard let self else { return }
            self.loading.remove(provider)
            guard error == nil, let result else {
                self.data[provider] = "Google data could not be loaded. Check the connection and try again."
                return
            }
            self.data[provider] = self.render(result, provider: provider)
        }
    }

    func disconnect(_ provider: GoogleIntegrationProvider) {
        call("disconnectGoogleIntegration", ["provider": provider.rawValue]) { [weak self] _, error in
            guard let self else { return }
            self.message = error == nil ? "\(provider.title) disconnected from Overseer." : "Could not disconnect. Please retry."
            self.refreshStatus(for: provider)
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }

    private func fail(_ provider: GoogleIntegrationProvider, _ text: String) {
        pending = nil
        webSession = nil
        loading.remove(provider)
        message = text
    }

    private func render(_ result: Any, provider: GoogleIntegrationProvider) -> String {
        guard let payload = result as? [String: Any] else { return "No Google data was returned." }
        if provider == .calendar {
            let calendars = payload["calendars"] as? [[String: Any]] ?? []
            let rows = calendars.flatMap { calendar -> [String] in
                let name = calendar["calendarName"] as? String ?? "Google Calendar"
                let events = calendar["events"] as? [[String: Any]] ?? []
                return events.map { event in
                    let title = event["summary"] as? String ?? "Untitled event"
                    let start = event["start"] as? [String: Any] ?? [:]
                    let time = start["dateTime"] as? String ?? start["date"] as? String ?? "Time not provided"
                    return "Google Calendar · \(name)\n\(title) · \(time)"
                }
            }
            return rows.isEmpty ? "No Google Calendar events found in this date range." : rows.prefix(50).joined(separator: "\n\n")
        }
        let records = payload["courses"] as? [[String: Any]] ?? []
        let rows = records.map { record -> String in
            let course = record["course"] as? [String: Any] ?? [:]
            let name = course["name"] as? String ?? "Google Classroom course"
            let work = record["courseWork"] as? [[String: Any]] ?? []
            let announcements = record["announcements"] as? [[String: Any]] ?? []
            let workTitles = work.prefix(3).compactMap { $0["title"] as? String }
            let announcementTitles = announcements.prefix(3).compactMap { $0["text"] as? String }
            let workText = workTitles.isEmpty ? "No coursework" : "Coursework: " + workTitles.joined(separator: ", ")
            let announcementText = announcementTitles.isEmpty ? "No announcements" : "Announcements: " + announcementTitles.joined(separator: " · ")
            return "Google Classroom · \(name)\n\(workText)\n\(announcementText)"
        }
        return rows.isEmpty ? "No active Google Classroom courses found." : rows.prefix(50).joined(separator: "\n\n")
    }

    private func call(_ name: String, _ payload: [String: Any], completion: @escaping (Any?, Error?) -> Void) {
        guard let functions else {
            completion(nil, NSError(domain: "Overseer.Firebase", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase is not configured."]))
            return
        }
        functions.httpsCallable(name).call(payload) { result, error in completion(result?.data, error) }
    }
}

struct GoogleIntegrationPanel: View {
    @EnvironmentObject private var integrations: GoogleIntegrationsStore
    let provider: GoogleIntegrationProvider

    var body: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(provider.title).font(.headline).foregroundStyle(OverseerColor.navy)
                Text(integrations.connection[provider] ?? "Checking connection…")
                    .font(.caption).foregroundStyle(OverseerColor.muted)
                if integrations.loading.contains(provider) { ProgressView() }
                HStack {
                    Button("Connect / Reconnect") { integrations.connect(provider) }
                    Button("Refresh") { integrations.load(provider) }
                }.font(.caption.bold())
                Button("Disconnect") { integrations.disconnect(provider) }
                    .font(.caption).foregroundStyle(.red)
                if let data = integrations.data[provider] {
                    Text(data).font(.system(.caption2, design: .monospaced)).textSelection(.enabled).lineLimit(18)
                }
                if let message = integrations.message {
                    Text(message).font(.caption).foregroundStyle(OverseerColor.muted)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.onAppear { integrations.refreshStatus(for: provider) }
    }
}
