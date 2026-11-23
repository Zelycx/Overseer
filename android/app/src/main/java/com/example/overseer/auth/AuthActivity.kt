package com.example.overseer

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException

class AuthActivity : AppCompatActivity() {
    private var auth: FirebaseAuth? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_auth)

        val email = findViewById<EditText>(R.id.authEmail)
        val password = findViewById<EditText>(R.id.authPassword)
        val submit = findViewById<Button>(R.id.authSubmit)
        val reset = findViewById<Button>(R.id.authReset)
        val switchMode = findViewById<TextView>(R.id.authSwitchMode)
        val error = findViewById<TextView>(R.id.authError)
        val progress = findViewById<View>(R.id.authProgress)

        try {
            FirebaseApp.initializeApp(this)
            auth = FirebaseAuth.getInstance()
        } catch (cause: Exception) {
            showError(error, "Firebase is not configured. Place google-services.json in android/app.")
        }

        var registering = false
        fun setMode() {
            submit.text = if (registering) "Create account" else "Sign in"
            switchMode.text = if (registering) "Already have an account? Sign in" else "New to Overseer? Create an account"
            reset.visibility = if (registering) View.GONE else View.VISIBLE
        }
        setMode()

        switchMode.setOnClickListener {
            registering = !registering
            setMode()
            error.visibility = View.GONE
        }

        submit.setOnClickListener {
            val accountEmail = email.text.toString().trim()
            val accountPassword = password.text.toString()
            if (accountEmail.isEmpty() || accountPassword.length < 6) {
                showError(error, "Enter a valid email and a password with at least 6 characters.")
                return@setOnClickListener
            }
            val firebaseAuth = auth
            if (firebaseAuth == null) {
                showError(error, "Firebase Authentication is unavailable.")
                return@setOnClickListener
            }
            progress.visibility = View.VISIBLE
            submit.isEnabled = false
            val operation = if (registering) {
                firebaseAuth.createUserWithEmailAndPassword(accountEmail, accountPassword)
            } else {
                firebaseAuth.signInWithEmailAndPassword(accountEmail, accountPassword)
            }
            operation.addOnSuccessListener {
                progress.visibility = View.GONE
                startActivity(Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                })
                finish()
            }.addOnFailureListener { cause ->
                progress.visibility = View.GONE
                submit.isEnabled = true
                showError(error, authError(cause))
            }
        }

        reset.setOnClickListener {
            val accountEmail = email.text.toString().trim()
            if (accountEmail.isEmpty()) {
                showError(error, "Enter your email before requesting a password reset.")
                return@setOnClickListener
            }
            auth?.sendPasswordResetEmail(accountEmail)
                ?.addOnSuccessListener { showError(error, "Password reset email sent.", success = true) }
                ?.addOnFailureListener { showError(error, authError(it)) }
        }
    }

    private fun authError(cause: Exception): String = when (cause) {
        is FirebaseAuthInvalidCredentialsException -> "Email or password is incorrect."
        is FirebaseAuthInvalidUserException -> "No account exists for this email."
        is FirebaseAuthUserCollisionException -> "An account already exists for this email."
        else -> cause.localizedMessage ?: "Authentication failed."
    }

    private fun showError(view: TextView, message: String, success: Boolean = false) {
        view.text = message
        view.setTextColor(getColor(if (success) R.color.overseer_navy else android.R.color.holo_red_dark))
        view.visibility = View.VISIBLE
    }
}
