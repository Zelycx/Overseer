package com.example.overseer

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/** Mirrors the Web placeholder without implying that an AI service is connected. */
class AssistantActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val body = WorkspaceUi.screen(this, "Study assistant", "Learn with your course context.")
        body.addView(WorkspaceUi.card(this, WorkspaceUi.column(this, 20).apply {
            addView(WorkspaceUi.text(this@AssistantActivity, "STUDY ASSISTANT", 12f, WorkspaceUi.MUTED, true))
            addView(WorkspaceUi.text(this@AssistantActivity, "The study assistant is planned for a future AI integration phase.", 20f, WorkspaceUi.NAVY, true).apply { setPadding(0, 8, 0, 8) })
            addView(WorkspaceUi.text(this@AssistantActivity, "AI features are not connected yet. This page does not generate answers or simulate an assistant. You can organize courses, lessons, materials, and tasks in your local study library.", 14f, WorkspaceUi.MUTED))
        }))
        body.addView(WorkspaceUi.button(this, "Open study library", R.drawable.ic_book_open) { startActivity(Intent(this, StudyActivity::class.java)) })
    }
}
