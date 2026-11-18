package com.ogunleye.stickify

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.IntentCompat
import java.io.File
import kotlin.concurrent.thread

/**
 * The whole app: stickers shared from the Stickify website (or opened from Downloads) are added
 * to a pack here, and "Add to WhatsApp" hands the pack to WhatsApp's sticker tray.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var store: StickerStore
    private lateinit var packList: LinearLayout
    private lateinit var empty: View
    private lateinit var banner: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = StickerStore(this)
        packList = findViewById(R.id.packs)
        empty = findViewById(R.id.empty)
        banner = findViewById(R.id.banner)
        findViewById<Button>(R.id.importButton).setOnClickListener { pickFile() }
        findViewById<Button>(R.id.websiteButton).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEBSITE)))
        }
        render()
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** Stickers arriving from the share menu or "Open with". */
    private fun handle(intent: Intent?) {
        val uris: List<Uri> = when (intent?.action) {
            Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            Intent.ACTION_SEND_MULTIPLE ->
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            Intent.ACTION_VIEW -> listOfNotNull(intent.data)
            else -> emptyList()
        }
        if (uris.isNotEmpty()) addStickers(uris)
        setIntent(Intent(this, MainActivity::class.java)) // don't re-add on rotation
    }

    private fun pickFile() {
        val pick = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        @Suppress("DEPRECATION")
        startActivityForResult(pick, PICK_FILE)
    }

    private fun addStickers(uris: List<Uri>) {
        banner.text = getString(R.string.adding)
        banner.visibility = View.VISIBLE
        thread {
            var lastPack: StickerStore.Pack? = null
            var problem: String? = null
            for (uri in uris) {
                try {
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw StickerStore.StickerProblem(getString(R.string.cant_read))
                    lastPack = store.add(bytes)
                } catch (e: StickerStore.StickerProblem) {
                    problem = e.message
                } catch (e: Exception) {
                    problem = getString(R.string.cant_read)
                }
            }
            runOnUiThread {
                render()
                val pack = lastPack
                when {
                    pack != null -> {
                        banner.text = getString(R.string.added_to, pack.name)
                        // Straight to WhatsApp: that's what the user came for.
                        addToWhatsApp(pack)
                    }
                    else -> banner.text = problem ?: getString(R.string.cant_read)
                }
            }
        }
    }

    private fun render() {
        packList.removeAllViews()
        val packs = store.packs()
        empty.visibility = if (packs.isEmpty()) View.VISIBLE else View.GONE
        packs.reversed().forEach { pack -> packList.addView(packView(pack)) }
    }

    private fun packView(pack: StickerStore.Pack): View {
        val view = layoutInflater.inflate(R.layout.item_pack, packList, false)
        view.findViewById<TextView>(R.id.packName).text = pack.name
        val count = pack.stickers.size
        view.findViewById<TextView>(R.id.packInfo).text = buildString {
            append(resources.getQuantityString(R.plurals.sticker_count, count, count))
            append(if (pack.animated) " · animated" else " · still")
            if (count < StickerStore.MIN_STICKERS) append(" · ").append(getString(R.string.repeats_note))
        }
        val row = view.findViewById<LinearLayout>(R.id.stickerRow)
        val size = (88 * resources.displayMetrics.density).toInt()
        pack.stickers.forEach { name ->
            val file = File(store.folder(pack.id), name)
            val image = ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(size, size).apply { marginEnd = size / 8 }
                setBackgroundResource(R.drawable.sticker_bg)
                contentDescription = getString(R.string.sticker)
                setOnLongClickListener { confirmRemove(pack, name); true }
            }
            showSticker(image, file)
            row.addView(image)
        }
        view.findViewById<Button>(R.id.addButton).setOnClickListener { addToWhatsApp(pack) }
        return view
    }

    private fun showSticker(image: ImageView, file: File) {
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                val drawable = ImageDecoder.decodeDrawable(ImageDecoder.createSource(file))
                image.setImageDrawable(drawable)
                if (drawable is AnimatedImageDrawable) drawable.start()
                return
            } catch (_: Exception) {
            }
        }
        store.decodePreview(file)?.let { image.setImageBitmap(it) }
    }

    private fun confirmRemove(pack: StickerStore.Pack, name: String) {
        AlertDialog.Builder(this)
            .setMessage(R.string.remove_question)
            .setPositiveButton(R.string.remove) { _, _ ->
                store.remove(pack.id, name)
                render()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun addToWhatsApp(pack: StickerStore.Pack) {
        val intent = Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK").apply {
            putExtra("sticker_pack_id", pack.id)
            putExtra("sticker_pack_authority", BuildConfig.CONTENT_PROVIDER_AUTHORITY)
            putExtra("sticker_pack_name", pack.name)
        }
        val installed = listOf(WHATSAPP, WHATSAPP_BUSINESS).filter { isInstalled(it) }
        try {
            @Suppress("DEPRECATION")
            when (installed.size) {
                0 -> Toast.makeText(this, R.string.no_whatsapp, Toast.LENGTH_LONG).show()
                1 -> startActivityForResult(intent.setPackage(installed[0]), ADD_PACK)
                else -> startActivityForResult(Intent.createChooser(intent, getString(R.string.add_to_whatsapp)), ADD_PACK)
            }
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.update_whatsapp, Toast.LENGTH_LONG).show()
        }
    }

    private fun isInstalled(pkg: String) = try {
        packageManager.getPackageInfo(pkg, 0)
        true
    } catch (e: Exception) {
        false
    }

    @Deprecated("Uses the platform result API to stay dependency-free")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            PICK_FILE -> if (resultCode == Activity.RESULT_OK && data != null) {
                val uris = data.clipData?.let { clip -> (0 until clip.itemCount).map { clip.getItemAt(it).uri } }
                    ?: listOfNotNull(data.data)
                addStickers(uris)
            }
            ADD_PACK -> {
                val error = data?.getStringExtra("validation_error")
                banner.visibility = View.VISIBLE
                banner.text = when {
                    resultCode == Activity.RESULT_OK -> getString(R.string.in_whatsapp)
                    error != null -> getString(R.string.whatsapp_said, error)
                    else -> getString(R.string.not_added)
                }
            }
        }
    }

    companion object {
        private const val PICK_FILE = 1
        private const val ADD_PACK = 2
        private const val WHATSAPP = "com.whatsapp"
        private const val WHATSAPP_BUSINESS = "com.whatsapp.w4b"
        private const val WEBSITE = "https://stickify-wa.pages.dev"
    }
}
