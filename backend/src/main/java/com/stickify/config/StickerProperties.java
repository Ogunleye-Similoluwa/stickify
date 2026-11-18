package com.stickify.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Tunable limits for sticker conversion, bound from the {@code stickify.*} properties.
 *
 * @param ffmpegPath          path or command name of the ffmpeg binary
 * @param maxAnimatedBytes    WhatsApp's size ceiling for animated stickers
 * @param maxStaticBytes      WhatsApp's size ceiling for static stickers
 * @param maxSeconds          longest clip a sticker may contain
 * @param defaultSeconds      clip length used when the client does not ask for one
 * @param maxDownloadBytes    largest source file fetched from a link
 * @param maxConcurrentJobs   ffmpeg processes allowed to run at once
 * @param jobTimeout          how long a single ffmpeg run may take
 * @param allowedOrigins      origins allowed to call the API from a browser
 * @param rateLimitRequests   requests one client may make per window
 * @param rateLimitWindow     length of the rate-limit window
 * @param linkResolverBaseUrl base URL of the public embed API used to look up X posts
 */
@ConfigurationProperties(prefix = "stickify")
public record StickerProperties(
        @DefaultValue("ffmpeg") String ffmpegPath,
        @DefaultValue("500000") long maxAnimatedBytes,
        @DefaultValue("100000") long maxStaticBytes,
        @DefaultValue("10") int maxSeconds,
        @DefaultValue("6") int defaultSeconds,
        @DefaultValue("26214400") long maxDownloadBytes,
        @DefaultValue("2") int maxConcurrentJobs,
        @DefaultValue("60s") Duration jobTimeout,
        @DefaultValue("*") List<String> allowedOrigins,
        @DefaultValue("30") int rateLimitRequests,
        @DefaultValue("10m") Duration rateLimitWindow,
        @DefaultValue("https://api.fxtwitter.com") String linkResolverBaseUrl) {
}
