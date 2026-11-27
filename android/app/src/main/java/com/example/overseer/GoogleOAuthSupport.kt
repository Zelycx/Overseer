package com.example.overseer

import java.net.URI
import java.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

internal object GoogleOAuthSupport {
    data class Callback(val state: String, val code: String?, val error: String?)

    fun newVerifier(): String {
        val bytes = ByteArray(32).also(SecureRandom()::nextBytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun challenge(verifier: String): String = Base64.getUrlEncoder().withoutPadding().encodeToString(
        MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

    fun parseCallback(value: String?, expectedHost: String): Callback? {
        val raw = value ?: return null
        val uri = runCatching { URI(raw) }.getOrNull() ?: return null
        if (uri.scheme != "https" || uri.host != expectedHost || uri.path != "/oauth/android" || uri.rawUserInfo != null || uri.fragment != null || (uri.port != -1 && uri.port != 443)) return null
        val params = uri.rawQuery.orEmpty().split('&').mapNotNull { part ->
            val pieces = part.split('=', limit = 2)
            if (pieces.size != 2) null else java.net.URLDecoder.decode(pieces[0], Charsets.UTF_8.name()) to java.net.URLDecoder.decode(pieces[1], Charsets.UTF_8.name())
        }.groupBy({ it.first }, { it.second })
        if ((params["code"]?.size ?: 0) > 1 || (params["error"]?.size ?: 0) > 1) return null
        val state = params["state"]?.singleOrNull()?.takeIf(String::isNotBlank) ?: return null
        val code = params["code"]?.singleOrNull()?.takeIf(String::isNotBlank)
        val error = params["error"]?.singleOrNull()?.takeIf(String::isNotBlank)
        if ((code == null) == (error == null)) return null
        return Callback(state, code, error)
    }
}
