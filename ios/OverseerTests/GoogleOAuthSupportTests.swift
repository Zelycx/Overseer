import XCTest
@testable import Overseer

final class GoogleOAuthSupportTests: XCTestCase {
    func testVerifierAndChallengeUseUrlSafeS256() {
        let verifier = try XCTUnwrap(NativeGoogleOAuth.verifier())
        XCTAssertEqual(verifier.count, 43)
        XCTAssertTrue(verifier.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil)
        XCTAssertEqual(NativeGoogleOAuth.challenge(verifier).count, 43)
    }

    func testCallbackRequiresConfiguredHttpsHostExactPathAndSingleResult() throws {
        let good = try XCTUnwrap(URL(string: "https://oauth.example.invalid/oauth/ios?state=abc&code=xyz"))
        XCTAssertEqual(NativeGoogleOAuth.callback(good, expectedHost: "oauth.example.invalid")?.state, "abc")
        XCTAssertNil(NativeGoogleOAuth.callback(URL(string: "http://oauth.example.invalid/oauth/ios?state=abc&code=xyz")!, expectedHost: "oauth.example.invalid"))
        XCTAssertNil(NativeGoogleOAuth.callback(URL(string: "https://evil.invalid/oauth/ios?state=abc&code=xyz")!, expectedHost: "oauth.example.invalid"))
        XCTAssertNil(NativeGoogleOAuth.callback(URL(string: "https://oauth.example.invalid/oauth/ios/extra?state=abc&code=xyz")!, expectedHost: "oauth.example.invalid"))
        XCTAssertNil(NativeGoogleOAuth.callback(URL(string: "https://oauth.example.invalid/oauth/ios?state=abc&code=xyz&error=denied")!, expectedHost: "oauth.example.invalid"))
        XCTAssertNil(NativeGoogleOAuth.callback(URL(string: "https://oauth.example.invalid/oauth/ios?state=abc&state=other&code=xyz")!, expectedHost: "oauth.example.invalid"))
    }
}
