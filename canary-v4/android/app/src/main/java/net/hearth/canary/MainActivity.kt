package net.hearth.canary

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val title = TextView(this).apply {
            text = getString(R.string.placeholder_title)
            textSize = 28f
            gravity = Gravity.CENTER
        }

        val version = TextView(this).apply {
            text = getString(R.string.placeholder_version)
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 0)
        }

        container.addView(title)
        container.addView(version)
        setContentView(container)
    }
}
