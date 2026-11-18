package com.ogunleye.stickify

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Sticker packs kept in the app's private storage. WhatsApp needs 3–30 stickers per pack, all
 * animated or all still, so animated and still stickers go into separate packs, and a pack with
 * fewer than 3 stickers is padded by repeating them.
 */
class StickerStore(private val context: Context) {

    data class Pack(
        val id: String,
        val name: String,
        val animated: Boolean,
        val stickers: MutableList<String>,
        var version: Int,
    ) {
        val full get() = stickers.size >= MAX_STICKERS
    }

    class StickerProblem(message: String) : Exception(message)

    private val root = File(context.filesDir, "packs").apply { mkdirs() }
    private val index = File(root, "packs.json")

    fun packs(): List<Pack> {
        if (!index.exists()) return emptyList()
        val array = JSONArray(index.readText())
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            val files = o.getJSONArray("stickers")
            Pack(
                id = o.getString("id"),
                name = o.getString("name"),
                animated = o.getBoolean("animated"),
                stickers = (0 until files.length()).map { files.getString(it) }.toMutableList(),
                version = o.getInt("version"),
            )
        }
    }

    fun pack(id: String): Pack? = packs().firstOrNull { it.id == id }

    private fun save(packs: List<Pack>) {
        val array = JSONArray()
        packs.forEach { p ->
            array.put(
                JSONObject()
                    .put("id", p.id)
                    .put("name", p.name)
                    .put("animated", p.animated)
                    .put("stickers", JSONArray(p.stickers))
                    .put("version", p.version),
            )
        }
        index.writeText(array.toString())
    }

    fun folder(packId: String) = File(root, packId).apply { mkdirs() }

    /** Adds a sticker (any image; non-WebP or wrongly sized images become still stickers). Returns the pack it went into. */
    @Synchronized
    fun add(bytes: ByteArray): Pack {
        val info = WebpInfo.parse(bytes)
        val sticker: ByteArray
        val animated: Boolean
        if (info != null && info.width == SIZE && info.height == SIZE) {
            animated = info.animated
            val limit = if (animated) MAX_ANIMATED_BYTES else MAX_STATIC_BYTES
            if (bytes.size > limit) {
                throw StickerProblem(
                    if (animated) "This sticker is over WhatsApp's 500 KB limit. Make it shorter on the website."
                    else "This sticker is over WhatsApp's 100 KB limit.",
                )
            }
            sticker = bytes
        } else {
            if (info?.animated == true) throw StickerProblem("Animated stickers must be 512 × 512. Make it on the Stickify website first.")
            sticker = stillSticker(bytes)
            animated = false
        }

        val all = packs().toMutableList()
        val pack = all.lastOrNull { it.animated == animated && !it.full } ?: newPack(all, animated).also { all += it }
        val name = "sticker_${System.currentTimeMillis()}.webp"
        File(folder(pack.id), name).writeBytes(sticker)
        pack.stickers += name
        pack.version++
        writeTrayIcon(pack)
        save(all)
        return pack
    }

    @Synchronized
    fun remove(packId: String, sticker: String) {
        val all = packs().toMutableList()
        val pack = all.firstOrNull { it.id == packId } ?: return
        pack.stickers.remove(sticker)
        File(folder(pack.id), sticker).delete()
        if (pack.stickers.isEmpty()) {
            folder(pack.id).deleteRecursively()
            all.remove(pack)
        } else {
            pack.version++
            writeTrayIcon(pack)
        }
        save(all)
    }

    private fun newPack(existing: List<Pack>, animated: Boolean): Pack {
        val sameKind = existing.count { it.animated == animated }
        val base = if (animated) "Stickify" else "Stickify Stills"
        return Pack(
            id = (if (animated) "stickify_animated_" else "stickify_still_") + System.currentTimeMillis(),
            name = if (sameKind == 0) base else "$base ${sameKind + 1}",
            animated = animated,
            stickers = mutableListOf(),
            version = 0,
        )
    }

    /**
     * The sticker names WhatsApp sees: at least 3, repeating stickers when the pack has fewer.
     * Repeats get a "~n" suffix and point at the same file.
     */
    fun namesForWhatsApp(pack: Pack): List<String> {
        val names = pack.stickers.toMutableList()
        var copy = 1
        while (names.size < MIN_STICKERS && pack.stickers.isNotEmpty()) {
            val original = pack.stickers[(names.size) % pack.stickers.size]
            names += original.removeSuffix(".webp") + "~$copy.webp"
            copy++
        }
        return names
    }

    /** Maps a (possibly repeated) name back to the real file. */
    fun fileFor(packId: String, name: String): File? {
        val pack = pack(packId) ?: return null
        if (name == TRAY_ICON) return File(folder(packId), TRAY_ICON).takeIf { it.exists() }
        val real = if ('~' in name) name.substringBefore('~') + ".webp" else name
        return if (real in pack.stickers) File(folder(packId), real).takeIf { it.exists() } else null
    }

    fun decodePreview(file: File): Bitmap? = try {
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            BitmapFactory.decodeFile(file.path)
        }
    } catch (e: Exception) {
        null
    }

    /** WhatsApp shows this small PNG in its sticker tray. */
    private fun writeTrayIcon(pack: Pack) {
        val first = pack.stickers.firstOrNull() ?: return
        val bitmap = decodePreview(File(folder(pack.id), first)) ?: return
        val tray = Bitmap.createScaledBitmap(bitmap, TRAY_SIZE, TRAY_SIZE, true)
        File(folder(pack.id), TRAY_ICON).outputStream().use { tray.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Turns any picture into a 512×512 still WebP under 100 KB, keeping the whole picture. */
    private fun stillSticker(bytes: ByteArray): ByteArray {
        val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw StickerProblem("That file isn't a picture Stickify can use.")
        val canvasBitmap = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
        val scale = minOf(SIZE.toFloat() / source.width, SIZE.toFloat() / source.height)
        val w = (source.width * scale).toInt()
        val h = (source.height * scale).toInt()
        val left = (SIZE - w) / 2
        val top = (SIZE - h) / 2
        Canvas(canvasBitmap).drawBitmap(source, null, Rect(left, top, left + w, top + h), Paint(Paint.FILTER_BITMAP_FLAG))
        for (quality in intArrayOf(90, 75, 60, 45, 30)) {
            val out = ByteArrayOutputStream()
            @Suppress("DEPRECATION")
            val format = if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
            canvasBitmap.compress(format, quality, out)
            if (out.size() <= MAX_STATIC_BYTES) return out.toByteArray()
        }
        throw StickerProblem("Couldn't shrink this picture under WhatsApp's 100 KB limit.")
    }

    companion object {
        const val SIZE = 512
        const val TRAY_SIZE = 96
        const val TRAY_ICON = "tray.png"
        const val MIN_STICKERS = 3
        const val MAX_STICKERS = 30
        const val MAX_ANIMATED_BYTES = 500 * 1024
        const val MAX_STATIC_BYTES = 100 * 1024
    }
}
