package com.example.overseer

import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.util.Base64

class GoogleOAuthSupportTest {
    @Test fun pkceChallengeIsSha256AndVerifierIsUrlSafe() {
        val verifier = GoogleOAuthSupport.newVerifier()
        assertTrue(verifier.matches(Regex("[A-Za-z0-9_-]{43}")))
        val expected = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        assertEquals(expected, GoogleOAuthSupport.challenge(verifier))
    }

    @Test fun callbackRequiresConfiguredHttpsHostExactPathAndOneResult() {
        val valid = "https://oauth.example.invalid/oauth/android?state=s&code=c"
        assertEquals("s", GoogleOAuthSupport.parseCallback(valid, "oauth.example.invalid")?.state)
        assertNull(GoogleOAuthSupport.parseCallback("http://oauth.example.invalid/oauth/android?state=s&code=c", "oauth.example.invalid"))
        assertNull(GoogleOAuthSupport.parseCallback("https://evil.invalid/oauth/android?state=s&code=c", "oauth.example.invalid"))
        assertNull(GoogleOAuthSupport.parseCallback("https://oauth.example.invalid/oauth/android/extra?state=s&code=c", "oauth.example.invalid"))
        assertNull(GoogleOAuthSupport.parseCallback("https://oauth.example.invalid/oauth/android?state=s&code=c&error=denied", "oauth.example.invalid"))
        assertNull(GoogleOAuthSupport.parseCallback("https://oauth.example.invalid/oauth/android?state=s&code=c&error=denied&error=cancelled", "oauth.example.invalid"))
    }
}
