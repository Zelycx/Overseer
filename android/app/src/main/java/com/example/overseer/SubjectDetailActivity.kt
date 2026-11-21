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

        card.setOnLongClickListener {
            showMaterialOptions(materialName)
            true
        }

        container.addView(card)
    }

    private fun showMaterialOptions(materialName: String) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(materialName)
            .setItems(arrayOf("Edit Material", "Delete Material")) { _, which ->
                when (which) {
                    0 -> showEditMaterialDialog(materialName)
                    1 -> deleteMaterial(materialName)
                }
            }
            .show()
    }

    private fun showEditMaterialDialog(oldMaterialName: String) {
        val materialInput = EditText(this)
        materialInput.setText(oldMaterialName)
        materialInput.selectAll()
        materialInput.hint = "Enter material title"

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Edit Material")
            .setMessage("Change the name of your study material.")
            .setView(materialInput)
            .setPositiveButton("Save") { _, _ ->
                val newMaterialName = materialInput.text.toString().trim()

                if (newMaterialName.isNotEmpty() &&
                    newMaterialName != oldMaterialName
                ) {

                    val sharedPreferences =
                        getSharedPreferences("overseer_materials", MODE_PRIVATE)

                    val savedMaterials =
                        sharedPreferences.getString(
                            "materials_${intent.getStringExtra("subject_name")}",
                            "[]"
                        )

                    val materialArray = JSONArray(savedMaterials)

                    for (i in 0 until materialArray.length()) {
                        if (materialArray.getString(i) == oldMaterialName) {
                            materialArray.put(i, newMaterialName)
                            break
                        }
                    }

                    val subjectName =
                        intent.getStringExtra("subject_name") ?: "My Subject"

                    sharedPreferences.edit()
                        .putString(
                            "materials_$subjectName",
                            materialArray.toString()
                        )
                        .apply()

                    Toast.makeText(
                        this,
                        "Material renamed to: $newMaterialName",
                        Toast.LENGTH_SHORT
                    ).show()

                    recreate()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun deleteMaterial(materialName: String) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Delete Material")
            .setMessage("Are you sure you want to delete \"$materialName\"?")
            .setPositiveButton("Delete") { _, _ ->

                val subjectName =
                    intent.getStringExtra("subject_name") ?: "My Subject"

                val sharedPreferences =
                    getSharedPreferences("overseer_materials", MODE_PRIVATE)

                val savedMaterials =
                    sharedPreferences.getString("materials_$subjectName", "[]")

                val materialArray = JSONArray(savedMaterials)

                for (i in 0 until materialArray.length()) {
                    if (materialArray.getString(i) == materialName) {
                        materialArray.remove(i)
                        break
                    }
                }

                sharedPreferences.edit()
                    .putString("materials_$subjectName", materialArray.toString())
                    .apply()

                Toast.makeText(
                    this,
                    "Material deleted: $materialName",
                    Toast.LENGTH_SHORT
                ).show()

                recreate()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

}