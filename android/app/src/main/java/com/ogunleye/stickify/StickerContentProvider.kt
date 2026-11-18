package com.ogunleye.stickify

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor

/**
 * Serves sticker packs to WhatsApp. The URI paths and column names below are fixed by WhatsApp
 * (see github.com/WhatsApp/stickers) and must not change.
 */
class StickerContentProvider : ContentProvider() {

    private lateinit var store: StickerStore
    private val authority = BuildConfig.CONTENT_PROVIDER_AUTHORITY

    private val matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
        addURI(authority, METADATA, CODE_ALL_PACKS)
        addURI(authority, "$METADATA/*", CODE_ONE_PACK)
        addURI(authority, "$STICKERS/*", CODE_STICKERS)
        addURI(authority, "$STICKERS_ASSET/*/*", CODE_ASSET)
    }

    override fun onCreate(): Boolean {
        store = StickerStore(context!!)
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor {
        val cursor = when (matcher.match(uri)) {
            CODE_ALL_PACKS -> packsCursor(store.packs())
            CODE_ONE_PACK -> packsCursor(store.packs().filter { it.id == uri.lastPathSegment })
            CODE_STICKERS -> stickersCursor(uri.lastPathSegment.orEmpty())
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
        cursor.setNotificationUri(context!!.contentResolver, uri)
        return cursor
    }

    private fun packsCursor(packs: List<StickerStore.Pack>): Cursor {
        val cursor = MatrixCursor(
            arrayOf(
                "sticker_pack_identifier", "sticker_pack_name", "sticker_pack_publisher", "sticker_pack_icon",
                "android_play_store_link", "ios_app_download_link", "sticker_pack_publisher_email",
                "sticker_pack_publisher_website", "sticker_pack_privacy_policy_website",
                "sticker_pack_license_agreement_website", "image_data_version",
                "whatsapp_will_not_cache_stickers", "animated_sticker_pack",
            ),
        )
        packs.filter { it.stickers.isNotEmpty() }.forEach { p ->
            cursor.addRow(
                arrayOf<Any>(
                    p.id, p.name, PUBLISHER, StickerStore.TRAY_ICON,
                    "", "", "", WEBSITE, "", "",
                    p.version.toString(), 0, if (p.animated) 1 else 0,
                ),
            )
        }
        return cursor
    }

    private fun stickersCursor(packId: String): Cursor {
        val cursor = MatrixCursor(arrayOf("sticker_file_name", "sticker_emoji", "sticker_accessibility_text"))
        val pack = store.pack(packId) ?: return cursor
        store.namesForWhatsApp(pack).forEach { name -> cursor.addRow(arrayOf<Any>(name, EMOJI, "Sticker")) }
        return cursor
    }

    override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor? {
        if (matcher.match(uri) != CODE_ASSET) return null
        val segments = uri.pathSegments
        if (segments.size != 3) throw IllegalArgumentException("Bad sticker URI: $uri")
        val file = store.fileFor(segments[1], segments[2]) ?: return null
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        return AssetFileDescriptor(pfd, 0, AssetFileDescriptor.UNKNOWN_LENGTH)
    }

    override fun getType(uri: Uri): String = when (matcher.match(uri)) {
        CODE_ALL_PACKS -> "vnd.android.cursor.dir/vnd.$authority.$METADATA"
        CODE_ONE_PACK -> "vnd.android.cursor.item/vnd.$authority.$METADATA"
        CODE_STICKERS -> "vnd.android.cursor.dir/vnd.$authority.$STICKERS"
        CODE_ASSET -> if (uri.lastPathSegment == StickerStore.TRAY_ICON) "image/png" else "image/webp"
        else -> throw IllegalArgumentException("Unknown URI: $uri")
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = throw UnsupportedOperationException()
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int =
        throw UnsupportedOperationException()

    companion object {
        private const val METADATA = "metadata"
        private const val STICKERS = "stickers"
        private const val STICKERS_ASSET = "stickers_asset"
        private const val CODE_ALL_PACKS = 1
        private const val CODE_ONE_PACK = 2
        private const val CODE_STICKERS = 3
        private const val CODE_ASSET = 4
        private const val PUBLISHER = "Stickify"
        private const val WEBSITE = "https://stickify-wa.pages.dev"
        private const val EMOJI = "😀"
    }
}
