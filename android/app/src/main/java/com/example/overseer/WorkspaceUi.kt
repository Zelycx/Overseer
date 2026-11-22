package com.example.overseer

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.card.MaterialCardView
import com.google.android.material.button.MaterialButton

/** Small native view helpers shared by the full-screen study tools. */
object WorkspaceUi {
    @Volatile private var darkMode = false
    val NAVY: Int get() = if (darkMode) 0xFFEAF0FF.toInt() else 0xFF131D44.toInt()
    val PAPER: Int get() = if (darkMode) 0xFF101521.toInt() else 0xFFFDF8FF.toInt()
    val SURFACE: Int get() = if (darkMode) 0xFF1B2333.toInt() else Color.WHITE
    val SUBTLE: Int get() = if (darkMode) 0xFF293348.toInt() else 0xFFECEAF1.toInt()
    val LIME: Int get() = 0xFFC1FF00.toInt()
    val MUTED: Int get() = if (darkMode) 0xFFB4BED3.toInt() else 0xFF68718A.toInt()
    val LINE: Int get() = if (darkMode) 0xFF374157.toInt() else 0xFFE5E2EA.toInt()

    fun setDarkMode(enabled: Boolean) { darkMode = enabled }

    fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    fun screen(activity: AppCompatActivity, title: String, subtitle: String): LinearLayout {
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(PAPER)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(activity, 18), dp(activity, 12), dp(activity, 18), dp(activity, 8))
        }
        val back = iconButton(activity, R.drawable.ic_chevron_left, "Back") { activity.finish() }
        val titles = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(activity, 8), 0, 0, 0) }
        titles.addView(text(activity, title, 23f, NAVY, true))
        titles.addView(text(activity, subtitle, 13f, MUTED, false).apply { setPadding(0, dp(activity, 2), 0, 0) })
        header.addView(back)
        header.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(header)
        val scroll = ScrollView(activity).apply { clipToPadding = false; isFillViewport = true }
        val body = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 20), dp(activity, 12), dp(activity, 20), dp(activity, 30))
        }
        scroll.addView(body, android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        activity.setContentView(root)
        return body
    }

    fun text(context: Context, value: String, size: Float = 15f, color: Int = NAVY, bold: Boolean = false): TextView = TextView(context).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    fun section(context: Context, label: String): TextView = text(context, label.uppercase(), 12f, NAVY, true).apply {
        letterSpacing = 0.08f
        setPadding(0, dp(context, 20), 0, dp(context, 8))
    }

    fun button(context: Context, label: String, iconRes: Int? = null, onClick: () -> Unit): Button = MaterialButton(context).apply {
        text = label
        setTextColor(NAVY)
        backgroundTintList = android.content.res.ColorStateList.valueOf(LIME)
        iconRes?.let { icon = context.getDrawable(it) }
        iconTint = android.content.res.ColorStateList.valueOf(NAVY)
        iconGravity = MaterialButton.ICON_GRAVITY_TEXT_START
        iconPadding = dp(context, 8)
        minHeight = dp(context, 46)
        setOnClickListener { onClick() }
    }

    fun subtleButton(context: Context, label: String, iconRes: Int? = null, onClick: () -> Unit): Button = MaterialButton(context).apply {
        text = label
        setTextColor(NAVY)
        backgroundTintList = android.content.res.ColorStateList.valueOf(SUBTLE)
        iconRes?.let { icon = context.getDrawable(it) }
        iconTint = android.content.res.ColorStateList.valueOf(NAVY)
        iconGravity = MaterialButton.ICON_GRAVITY_TEXT_START
        iconPadding = dp(context, 6)
        minHeight = dp(context, 42)
        setOnClickListener { onClick() }
    }

    fun iconButton(context: Context, iconRes: Int, description: String, onClick: () -> Unit): ImageButton = ImageButton(context).apply {
        setImageResource(iconRes)
        imageTintList = android.content.res.ColorStateList.valueOf(NAVY)
        contentDescription = description
        scaleType = ImageView.ScaleType.CENTER
        setPadding(dp(context, 10), dp(context, 10), dp(context, 10), dp(context, 10))
        backgroundTintList = android.content.res.ColorStateList.valueOf(SUBTLE)
        minimumWidth = dp(context, 44)
        minimumHeight = dp(context, 44)
        setOnClickListener { onClick() }
    }

    fun toolCard(context: Context, label: String, iconRes: Int, onClick: () -> Unit): MaterialCardView {
        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(context, 8), dp(context, 8), dp(context, 8), dp(context, 8))
        }
        content.addView(ImageView(context).apply {
            setImageResource(iconRes)
            imageTintList = android.content.res.ColorStateList.valueOf(NAVY)
            contentDescription = null
        }, LinearLayout.LayoutParams(dp(context, 24), dp(context, 24)))
        content.addView(text(context, label, 13f, NAVY, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(context, 6), 0, 0)
        })
        return card(context, content).apply {
            isClickable = true
            isFocusable = true
            minimumHeight = dp(context, 76)
            setOnClickListener { onClick() }
        }
    }

    fun card(context: Context, content: View): MaterialCardView = MaterialCardView(context).apply {
        radius = dp(context, 16).toFloat()
        cardElevation = dp(context, 1).toFloat()
        strokeWidth = dp(context, 1)
        strokeColor = LINE
        setCardBackgroundColor(SURFACE)
        val params = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        params.bottomMargin = dp(context, 10)
        layoutParams = params
        addView(content)
    }

    fun column(context: Context, padding: Int = 16): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(context, padding), dp(context, padding), dp(context, padding), dp(context, padding))
    }

    fun row(context: Context): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

    fun spinner(context: Context, items: List<String>, selected: Int = 0): Spinner = Spinner(context).apply {
        adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, items)
        setSelection(selected.coerceIn(0, (items.size - 1).coerceAtLeast(0)))
    }

    fun divider(context: Context): View = View(context).apply {
        setBackgroundColor(LINE)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(context, 1)).apply {
            topMargin = dp(context, 8); bottomMargin = dp(context, 8)
        }
    }

    fun spacer(context: Context, height: Int = 8): View = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(1, dp(context, height))
    }
}
