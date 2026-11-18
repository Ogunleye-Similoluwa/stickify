package com.stickify.model;

/**
 * What the user asked for: animated or still, which part of the clip to use, and how it fills the square.
 *
 * @param mode         animated or static sticker
 * @param startSeconds where in the source the sticker begins (for a still sticker, the frame to use)
 * @param seconds      how long an animated sticker runs
 * @param fit          crop to fill the square, or fit the whole picture inside it
 */
public record ConversionOptions(StickerMode mode, double startSeconds, double seconds, StickerFit fit) {

    public ConversionOptions {
        mode = mode == null ? StickerMode.ANIMATED : mode;
        startSeconds = Math.max(0, startSeconds);
        fit = fit == null ? StickerFit.FILL : fit;
    }

    public ConversionOptions(StickerMode mode, double startSeconds, double seconds) {
        this(mode, startSeconds, seconds, StickerFit.FILL);
    }

    public ConversionOptions withMode(StickerMode newMode) {
        return new ConversionOptions(newMode, startSeconds, seconds, fit);
    }
}
