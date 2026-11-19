package com.example.overseer

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.TextView
import android.widget.LinearLayout
import android.widget.EditText
import android.widget.Toast
import com.google.android.material.button.MaterialButton
import org.json.JSONArray

class SubjectDetailActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_subject_detail)

        setContentView(R.layout.activity_subject_detail)



        val subjectName = intent.getStringExtra("subject_name") ?: "My Subject"

        val materialsContainer = findViewById<LinearLayout>(R.id.materialsContainer)

        val addMaterialButton = findViewById<MaterialButton>(R.id.addMaterialButton)

        // Load materials saved for this subject
        val sharedPreferences = getSharedPreferences("overseer_materials", MODE_PRIVATE)

        val savedMaterials = sharedPreferences.getString("materials_$subjectName", "[]")
        val materialArray = JSONArray(savedMaterials)

        for (i in 0 until materialArray.length()) {
            val materialName = materialArray.getString(i)
            addMaterialCard(materialName, materialsContainer)
        }

        addMaterialButton.setOnClickListener {

            val materialInput = EditText(this)
            materialInput.hint = "Enter material title"

            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Add Material")
                .setMessage("Enter the name of your study material.")
                .setView(materialInput)
                .setPositiveButton("Add") { _, _ ->

                    val materialName = materialInput.text.toString().trim()

                    if (materialName.isNotEmpty()) {

                        materialArray.put(materialName)

                        sharedPreferences.edit()
                            .putString("materials_$subjectName", materialArray.toString())
                            .apply()

                        addMaterialCard(materialName, materialsContainer)

                        Toast.makeText(
                            this,
                            "Material added: $materialName",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        val subjectTitle = findViewById<TextView>(R.id.detailSubjectTitle)

        subjectTitle.text = subjectName

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
    }

    private fun addMaterialCard(materialName: String, container: LinearLayout) {

        val card = com.google.android.material.card.MaterialCardView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = 12
            }

            radius = 16f * resources.displayMetrics.density
            cardElevation = 2f
            setCardBackgroundColor(getColor(R.color.overseer_white))
            strokeWidth = (1 * resources.displayMetrics.density).toInt()
            strokeColor = android.graphics.Color.parseColor("#E5E5E5")
        }

        val title = TextView(this).apply {
            text = materialName
            textSize = 16f
            setTextColor(getColor(R.color.overseer_navy))
            setPadding(18, 18, 18, 18)
        }

        card.addView(title)
        container.addView(card)
    }

}