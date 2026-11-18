package com.stickify.model;

/**
 * A finished sticker.
 *
 * @param data    WebP bytes, 512x512
 * @param mode    animated or static
 * @param quality WebP quality setting that made it fit WhatsApp's size limit
 */
public record StickerResult(byte[] data, StickerMode mode, int quality) {

    public long sizeBytes() {
        return data.length;
    }
}
