package com.example.overseer

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
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
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.card.MaterialCardView
import com.google.android.material.button.MaterialButton
import com.google.android.material.bottomnavigation.BottomNavigationView
import kotlin.math.roundToInt

/** Small native view helpers shared by the full-screen study tools. */
object WorkspaceUi {
    private data class Palette(
        val dark: Boolean,
        val background: Int,
        val surface: Int,
        val subtle: Int,
        val text: Int,
        val secondary: Int,
        val muted: Int,
        val border: Int,
        val brand: Int,
        val onBrand: Int,
        val accent: Int,
        val accentSoft: Int,
        val onAccent: Int,
    )

    private data class BasePalette(
        val background: Int,
        val surface: Int,
        val subtle: Int,
        val text: Int,
        val secondary: Int,
        val muted: Int,
        val border: Int,
        val brand: Int,
        val onBrand: Int,
    )

    private data class Margins(val start: Int?, val end: Int?, val left: Int, val right: Int, val top: Int, val bottom: Int)
    private data class ViewSpacing(
        val left: Int,
        val top: Int,
        val right: Int,
        val bottom: Int,
        var margins: Margins?,
    )

    private enum class ColorRole { TEXT, ACCENT_TEXT, FILL }

    private val backgroundColors = setOf(0x00FDF8FF, 0x00101521, 0x00F0F3F3, 0x000C141B, 0x00F1EBDC, 0x00211F1A, 0x00050807)
    private val surfaceColors = setOf(0x00FFFFFF, 0x001B2333, 0x00FBFCFA, 0x00121D25, 0x00FAF6EC, 0x002D2922, 0x000B1110)
    private val subtleColors = setOf(0x00ECEAF1, 0x00F5F2F8, 0x00293348, 0x00E7EDEC, 0x00202F37, 0x00EEE6D5, 0x00403A2F, 0x00F0F2F1, 0x001D2925)
    private val borderColors = setOf(0x00E5E2EA, 0x00374157, 0x00D9E2E0, 0x002E4048, 0x00DFD6C5, 0x00544A39, 0x008A9691, 0x009AAFA6)
    private val brandColors = setOf(0x00131D44, 0x00142630, 0x00071017, 0x0038362F, 0x00171713, 0x0010221E, 0x00020504)
    private val primaryTextColors = setOf(0x00131D44, 0x00EAF0FF, 0x0018272E, 0x00E6ECE9, 0x00332F29, 0x00F1EBDC, 0x00101918, 0x00FFFFFF)
    private val secondaryTextColors = setOf(0x00515B78, 0x00B4BED3, 0x004F6166, 0x00BDC9C8, 0x005F574C, 0x00D6CDBD, 0x00253330, 0x00EDF5F1)
    private val mutedTextColors = setOf(0x00777777, 0x0068718A, 0x00718186, 0x009CAAAA, 0x007D7467, 0x00B6AA98, 0x0046534F, 0x00D0DFD8)
    private val onBrandTextColors = setOf(0x00FDF8FF, 0x00FDFEFC, 0x00F5F7F5, 0x00FAF6EC, 0x00FFFAF0)
    private val accentColors = setOf(
        0x00C1FF00, 0x007DA9C1, 0x008BBBD5, 0x00D59679, 0x00E0A187,
        0x00AA9ACB, 0x00B8A6DC, 0x0078B2A2, 0x0085C3B1,
    )
    private val accentForegroundColors = setOf(0x00131D44, 0x00173445, 0x0014222A, 0x0045271D, 0x00271A16, 0x00342A48, 0x00201A2C, 0x00173C35, 0x0017231F)
    private val accentSoftColors = setOf(
        0x00F1F8D8, 0x00303A28, 0x00E5EFF3, 0x00243744, 0x00F6E9E1,
        0x003C2C28, 0x00EEEAF5, 0x00332C40, 0x00E4F0EB, 0x00243A35,
    )

    @Volatile private var compactDensity = false
    @Volatile private var palette = paletteFor("studio", "olive", false)

    val NAVY: Int get() = palette.text
    val PAPER: Int get() = palette.background
    val SURFACE: Int get() = palette.surface
    val SUBTLE: Int get() = palette.subtle
    val LIME: Int get() = palette.accent
    val ACCENT_SOFT: Int get() = palette.accentSoft
    val ACCENT_ON: Int get() = palette.onAccent
    val BRAND: Int get() = palette.brand
    val MUTED: Int get() = palette.muted
    val LINE: Int get() = palette.border

    fun configure(preferences: WorkspacePreferences, dark: Boolean) {
        palette = paletteFor(preferences.appearancePreset, preferences.accentColor, dark)
        compactDensity = preferences.density == "compact"
    }

    fun dp(context: Context, value: Int): Int {
        val density = context.resources.displayMetrics.density
        val compactScale = if (compactDensity) 0.88f else 1f
        return (value * density * compactScale).roundToInt().let { if (value > 0) it.coerceAtLeast(1) else it }
    }

    /** Recolors XML layouts whose original values use the shared Overseer color resources. */
    fun applyAppearance(activity: Activity) {
        val active = palette
        activity.window.statusBarColor = active.background
        activity.window.navigationBarColor = active.background
        val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        controller.isAppearanceLightStatusBars = !active.dark
        controller.isAppearanceLightNavigationBars = !active.dark
        applyAppearance(activity.window.decorView)
    }

    private fun applyAppearance(view: View) {
        val active = palette

        (view.background as? ColorDrawable)?.let { drawable ->
            val parentIsContent = (view.parent as? View)?.id == android.R.id.content
            val replacement = if (parentIsContent) active.background else remapColor(drawable.color, ColorRole.FILL)
            if (replacement != drawable.color) view.setBackgroundColor(replacement)
        }
        view.backgroundTintList = remapColors(view.backgroundTintList, ColorRole.FILL)

        if (view is TextView) {
            val textRole = if (view is MaterialButton && hasAccentBackground(view)) ColorRole.ACCENT_TEXT else ColorRole.TEXT
            view.setTextColor(remapColors(view.textColors, textRole) ?: view.textColors)
            view.setHintTextColor(remapColors(view.hintTextColors, ColorRole.TEXT) ?: view.hintTextColors)
            view.compoundDrawableTintList = remapColors(view.compoundDrawableTintList, ColorRole.TEXT)
        }
        if (view is ImageView) view.imageTintList = remapColors(view.imageTintList, ColorRole.TEXT)
        if (view is MaterialButton) view.iconTint?.let {
            val role = if (hasAccentBackground(view)) ColorRole.ACCENT_TEXT else ColorRole.TEXT
            view.iconTint = remapColors(it, role)
        }
        if (view is MaterialCardView) {
            view.setCardBackgroundColor(remapColors(view.cardBackgroundColor, ColorRole.FILL) ?: view.cardBackgroundColor)
            view.setStrokeColor(remapColor(view.strokeColor, ColorRole.FILL))
        }
        if (view is BottomNavigationView) {
            val colors = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
                intArrayOf(active.accent, active.secondary),
            )
            view.itemIconTintList = colors
            view.itemTextColor = colors
        }
        if (view is android.widget.CompoundButton) {
            view.buttonTintList = ColorStateList.valueOf(active.accent)
        }
        if (view is android.widget.ProgressBar) {
            view.progressTintList = remapColors(view.progressTintList, ColorRole.FILL)
            view.progressBackgroundTintList = remapColors(view.progressBackgroundTintList, ColorRole.FILL)
            view.indeterminateTintList = remapColors(view.indeterminateTintList, ColorRole.FILL)
        }
        if (view is android.widget.EditText) {
            view.backgroundTintList = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()),
                intArrayOf(active.accent, active.border),
            )
        }
        if (view.id == R.id.profileAvatar) {
            view.backgroundTintList = ColorStateList.valueOf(active.accent)
            if (view is TextView) view.setTextColor(active.onAccent)
        }

        applySpacing(view)
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) applyAppearance(view.getChildAt(index))
        }
    }

    fun styleView(view: View) = applyAppearance(view)

    private fun hasAccentBackground(button: MaterialButton): Boolean =
        button.backgroundTintList?.defaultColor?.let { (it and 0x00FFFFFF) in accentColors } == true

    private fun applySpacing(view: View) {
        val spacing = (view.getTag(R.id.appearanceViewSpacing) as? ViewSpacing)
            ?: ViewSpacing(view.paddingLeft, view.paddingTop, view.paddingRight, view.paddingBottom, captureMargins(view)).also {
                view.setTag(R.id.appearanceViewSpacing, it)
            }
        val params = view.layoutParams as? ViewGroup.MarginLayoutParams
        if (spacing.margins == null && params != null) spacing.margins = captureMargins(params)

        view.setPadding(spacing.left, spacing.top, spacing.right, spacing.bottom)
        if (params != null) {
            spacing.margins?.let { margins ->
                if (params.isMarginRelative && margins.start != null && margins.end != null) {
                    params.setMarginStart(margins.start)
                    params.setMarginEnd(margins.end)
                } else {
                    params.leftMargin = margins.left
                    params.rightMargin = margins.right
                }
                params.topMargin = margins.top
                params.bottomMargin = margins.bottom
            }

            if (compactDensity) {
                fun compact(value: Int) = (value * 0.88f).roundToInt()
                view.setPadding(compact(spacing.left), compact(spacing.top), compact(spacing.right), compact(spacing.bottom))
                if (params.isMarginRelative && spacing.margins?.start != null && spacing.margins?.end != null) {
                    params.setMarginStart(compact(spacing.margins!!.start!!))
                    params.setMarginEnd(compact(spacing.margins!!.end!!))
                } else {
                    params.leftMargin = compact(spacing.margins?.left ?: params.leftMargin)
                    params.rightMargin = compact(spacing.margins?.right ?: params.rightMargin)
                }
                params.topMargin = compact(spacing.margins?.top ?: params.topMargin)
                params.bottomMargin = compact(spacing.margins?.bottom ?: params.bottomMargin)
            }
            view.layoutParams = params
        } else if (compactDensity) {
            fun compact(value: Int) = (value * 0.88f).roundToInt()
            view.setPadding(compact(spacing.left), compact(spacing.top), compact(spacing.right), compact(spacing.bottom))
        }
    }

    private fun captureMargins(view: View): Margins? = (view.layoutParams as? ViewGroup.MarginLayoutParams)?.let(::captureMargins)

    private fun captureMargins(params: ViewGroup.MarginLayoutParams): Margins = Margins(
        start = params.marginStart.takeIf { params.isMarginRelative && it >= 0 },
        end = params.marginEnd.takeIf { params.isMarginRelative && it >= 0 },
        left = params.leftMargin,
        right = params.rightMargin,
        top = params.topMargin,
        bottom = params.bottomMargin,
    )

    private fun remapColors(colors: ColorStateList?, role: ColorRole): ColorStateList? {
        if (colors == null) return null
        val stateEnabled = android.R.attr.state_enabled
        val statePressed = android.R.attr.state_pressed
        val stateChecked = android.R.attr.state_checked
        val stateSelected = android.R.attr.state_selected
        val stateActivated = android.R.attr.state_activated
        val stateFocused = android.R.attr.state_focused
        val states = arrayOf(
            intArrayOf(-stateEnabled),
            intArrayOf(stateEnabled, statePressed), intArrayOf(statePressed),
            intArrayOf(stateEnabled, stateChecked), intArrayOf(stateChecked),
            intArrayOf(stateEnabled, stateSelected), intArrayOf(stateSelected),
            intArrayOf(stateEnabled, stateActivated), intArrayOf(stateActivated),
            intArrayOf(stateEnabled, stateFocused), intArrayOf(stateFocused),
            intArrayOf(stateEnabled), intArrayOf(),
        )
        val mapped = states.map { state ->
            remapColor(colors.getColorForState(state, colors.defaultColor), role)
        }.toIntArray()
        return ColorStateList(states, mapped)
    }

    private fun remapColor(color: Int, role: ColorRole): Int {
        val rgb = color and 0x00FFFFFF
        val active = palette
        val replacement = when (role) {
            ColorRole.TEXT -> when {
                rgb in primaryTextColors -> active.text
                rgb in secondaryTextColors -> active.secondary
                rgb in mutedTextColors -> active.muted
                rgb in onBrandTextColors -> active.onBrand
                rgb in accentColors -> active.accent
                else -> return color
            }
            ColorRole.ACCENT_TEXT -> when {
                rgb in accentForegroundColors || rgb in primaryTextColors -> active.onAccent
                rgb in accentColors -> active.accent
                else -> return remapColor(color, ColorRole.TEXT)
            }
            ColorRole.FILL -> when {
                rgb in backgroundColors -> active.background
                rgb in surfaceColors -> active.surface
                rgb in subtleColors -> active.subtle
                rgb in borderColors -> active.border
                rgb in brandColors -> active.brand
                rgb in accentColors -> active.accent
                rgb in accentSoftColors -> active.accentSoft
                else -> return color
            }
        }
        return (color and 0xFF000000.toInt()) or (replacement and 0x00FFFFFF)
    }

    private fun paletteFor(preset: String, accent: String, dark: Boolean): Palette {
        val base = when (preset) {
            "midnight" -> if (dark) BasePalette(
                background = 0xFF0C141B.toInt(), surface = 0xFF121D25.toInt(), subtle = 0xFF202F37.toInt(),
                text = 0xFFE6ECE9.toInt(), secondary = 0xFFBDC9C8.toInt(), muted = 0xFF9CAAAA.toInt(),
                border = 0xFF2E4048.toInt(), brand = 0xFF071017.toInt(), onBrand = 0xFFF5F7F5.toInt(),
            ) else BasePalette(
                background = 0xFFF0F3F3.toInt(), surface = 0xFFFBFCFA.toInt(), subtle = 0xFFE7EDEC.toInt(),
                text = 0xFF18272E.toInt(), secondary = 0xFF4F6166.toInt(), muted = 0xFF718186.toInt(),
                border = 0xFFD9E2E0.toInt(), brand = 0xFF142630.toInt(), onBrand = 0xFFFDFEFC.toInt(),
            )
            "paper" -> if (dark) BasePalette(
                background = 0xFF211F1A.toInt(), surface = 0xFF2D2922.toInt(), subtle = 0xFF403A2F.toInt(),
                text = 0xFFF1EBDC.toInt(), secondary = 0xFFD6CDBD.toInt(), muted = 0xFFB6AA98.toInt(),
                border = 0xFF544A39.toInt(), brand = 0xFF171713.toInt(), onBrand = 0xFFFAF6EC.toInt(),
            ) else BasePalette(
                background = 0xFFF1EBDC.toInt(), surface = 0xFFFAF6EC.toInt(), subtle = 0xFFEEE6D5.toInt(),
                text = 0xFF332F29.toInt(), secondary = 0xFF5F574C.toInt(), muted = 0xFF7D7467.toInt(),
                border = 0xFFDFD6C5.toInt(), brand = 0xFF38362F.toInt(), onBrand = 0xFFFFFAF0.toInt(),
            )
            "high-contrast" -> if (dark) BasePalette(
                background = 0xFF050807.toInt(), surface = 0xFF0B1110.toInt(), subtle = 0xFF1D2925.toInt(),
                text = Color.WHITE, secondary = 0xFFEDF5F1.toInt(), muted = 0xFFD0DFD8.toInt(),
                border = 0xFF9AAFA6.toInt(), brand = 0xFF020504.toInt(), onBrand = Color.WHITE,
            ) else BasePalette(
                background = Color.WHITE, surface = Color.WHITE, subtle = 0xFFF0F2F1.toInt(),
                text = 0xFF101918.toInt(), secondary = 0xFF253330.toInt(), muted = 0xFF46534F.toInt(),
                border = 0xFF8A9691.toInt(), brand = 0xFF10221E.toInt(), onBrand = Color.WHITE,
            )
            else -> if (dark) BasePalette(
                background = 0xFF101521.toInt(), surface = 0xFF1B2333.toInt(), subtle = 0xFF293348.toInt(),
                text = 0xFFEAF0FF.toInt(), secondary = 0xFFB4BED3.toInt(), muted = 0xFFB4BED3.toInt(),
                border = 0xFF374157.toInt(), brand = 0xFF131D44.toInt(), onBrand = 0xFFFDF8FF.toInt(),
            ) else BasePalette(
                background = 0xFFFDF8FF.toInt(), surface = Color.WHITE, subtle = 0xFFECEAF1.toInt(),
                text = 0xFF131D44.toInt(), secondary = 0xFF515B78.toInt(), muted = 0xFF68718A.toInt(),
                border = 0xFFE5E2EA.toInt(), brand = 0xFF131D44.toInt(), onBrand = 0xFFFDF8FF.toInt(),
            )
        }

        val accentColors = when (accent) {
            "blue" -> if (dark) intArrayOf(0xFF8BBBD5.toInt(), 0xFF243744.toInt(), 0xFF14222A.toInt()) else intArrayOf(0xFF7DA9C1.toInt(), 0xFFE5EFF3.toInt(), 0xFF173445.toInt())
            "terracotta" -> if (dark) intArrayOf(0xFFE0A187.toInt(), 0xFF3C2C28.toInt(), 0xFF271A16.toInt()) else intArrayOf(0xFFD59679.toInt(), 0xFFF6E9E1.toInt(), 0xFF45271D.toInt())
            "violet" -> if (dark) intArrayOf(0xFFB8A6DC.toInt(), 0xFF332C40.toInt(), 0xFF201A2C.toInt()) else intArrayOf(0xFFAA9ACB.toInt(), 0xFFEEEAF5.toInt(), 0xFF342A48.toInt())
            "teal" -> if (dark) intArrayOf(0xFF85C3B1.toInt(), 0xFF243A35.toInt(), 0xFF17231F.toInt()) else intArrayOf(0xFF78B2A2.toInt(), 0xFFE4F0EB.toInt(), 0xFF173C35.toInt())
            else -> if (dark) intArrayOf(0xFFC1FF00.toInt(), 0xFF303A28.toInt(), 0xFF131D44.toInt()) else intArrayOf(0xFFC1FF00.toInt(), 0xFFF1F8D8.toInt(), 0xFF131D44.toInt())
        }
        return Palette(
            dark = dark,
            background = base.background,
            surface = base.surface,
            subtle = base.subtle,
            text = base.text,
            secondary = base.secondary,
            muted = base.muted,
            border = base.border,
            brand = base.brand,
            onBrand = base.onBrand,
            accent = accentColors[0],
            accentSoft = accentColors[1],
            onAccent = accentColors[2],
        )
    }

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
        setTextColor(ACCENT_ON)
        backgroundTintList = android.content.res.ColorStateList.valueOf(LIME)
        iconRes?.let { icon = context.getDrawable(it) }
        iconTint = android.content.res.ColorStateList.valueOf(ACCENT_ON)
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
        val list = object : ArrayAdapter<String>(context, android.R.layout.simple_spinner_item, items) {
            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
                (super.getView(position, convertView, parent) as TextView).apply { setTextColor(NAVY) }

            override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View =
                (super.getDropDownView(position, convertView, parent) as TextView).apply {
                    setTextColor(NAVY)
                    setBackgroundColor(SURFACE)
                    setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10))
                }
        }
        list.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        adapter = list
        backgroundTintList = ColorStateList.valueOf(LINE)
        setSelection(selected.coerceIn(0, (items.size - 1).coerceAtLeast(0)))
    }.also { styleView(it) }

    fun editText(context: Context): android.widget.EditText = android.widget.EditText(context).also { styleView(it) }

    fun checkBox(context: Context): android.widget.CheckBox = android.widget.CheckBox(context).also { styleView(it) }

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
