package com.ogunleye.stickify

/** Reads just enough of a WebP header to check WhatsApp's rules (size, animation). */
data class WebpInfo(val width: Int, val height: Int, val animated: Boolean) {
    companion object {
        private fun fourCC(b: ByteArray, at: Int) = String(b, at, 4, Charsets.US_ASCII)
        private fun u24(b: ByteArray, at: Int) =
            (b[at].toInt() and 0xff) or ((b[at + 1].toInt() and 0xff) shl 8) or ((b[at + 2].toInt() and 0xff) shl 16)
        private fun u16(b: ByteArray, at: Int) = (b[at].toInt() and 0xff) or ((b[at + 1].toInt() and 0xff) shl 8)

        fun parse(bytes: ByteArray): WebpInfo? {
            if (bytes.size < 30 || fourCC(bytes, 0) != "RIFF" || fourCC(bytes, 8) != "WEBP") return null
            return when (fourCC(bytes, 12)) {
                // Extended format: canvas size and the animation flag are in the header.
                "VP8X" -> WebpInfo(
                    width = u24(bytes, 24) + 1,
                    height = u24(bytes, 27) + 1,
                    animated = (bytes[20].toInt() and 0x02) != 0,
                )
                // Simple lossy: 14-bit sizes after the frame tag.
                "VP8 " -> WebpInfo(u16(bytes, 26) and 0x3fff, u16(bytes, 28) and 0x3fff, false)
                // Simple lossless: 14-bit sizes packed after the signature byte.
                "VP8L" -> {
                    val b0 = bytes[21].toInt() and 0xff
                    val b1 = bytes[22].toInt() and 0xff
                    val b2 = bytes[23].toInt() and 0xff
                    val b3 = bytes[24].toInt() and 0xff
                    WebpInfo(1 + (((b1 and 0x3f) shl 8) or b0), 1 + (((b3 and 0x0f) shl 10) or (b2 shl 2) or ((b1 and 0xc0) shr 6)), false)
                }
                else -> null
            }
        }
    }
}
