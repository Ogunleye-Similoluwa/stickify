package com.stickify.model;

/**
 * What an X post contains, returned before conversion so the browser can preview and trim it.
 *
 * @param mediaUrl        direct link to the GIF/video (MP4) or photo on X's media servers
 * @param kind            "gif", "video" or "photo"
 * @param durationSeconds clip length in seconds, or null for photos or when unknown
 * @param width           width in pixels, if known
 * @param height          height in pixels, if known
 */
public record MediaInfo(String mediaUrl, String kind, Double durationSeconds, Integer width, Integer height) {
}
