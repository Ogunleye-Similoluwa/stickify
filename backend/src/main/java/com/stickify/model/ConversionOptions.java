package com.stickify.model;

/**
 * What the user asked for: animated or still, and which part of the clip to use.
 *
 * @param mode         animated or static sticker
 * @param startSeconds where in the source the sticker begins (for a still sticker, the frame to use)
 * @param seconds      how long an animated sticker runs
 */
public record ConversionOptions(StickerMode mode, double startSeconds, double seconds) {

    public ConversionOptions {
        mode = mode == null ? StickerMode.ANIMATED : mode;
        startSeconds = Math.max(0, startSeconds);
    }

    public ConversionOptions withMode(StickerMode newMode) {
        return new ConversionOptions(newMode, startSeconds, seconds);
    }
}
