package com.stickify.model;

/**
 * Raw media ready for conversion.
 *
 * @param data        file contents
 * @param contentType MIME type reported by the source, may be null
 * @param stillImage  true when the source is a photo rather than a GIF or video
 */
public record SourceMedia(byte[] data, String contentType, boolean stillImage) {

    public static SourceMedia of(byte[] data, String contentType) {
        boolean still = contentType != null
                && contentType.startsWith("image/")
                && !contentType.equalsIgnoreCase("image/gif")
                && !contentType.equalsIgnoreCase("image/webp");
        return new SourceMedia(data, contentType, still);
    }
}
