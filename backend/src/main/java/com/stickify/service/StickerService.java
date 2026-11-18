package com.stickify.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.stickify.config.StickerProperties;
import com.stickify.exception.BusyException;
import com.stickify.exception.ConversionException;
import com.stickify.exception.InvalidInputException;
import com.stickify.model.ConversionOptions;
import com.stickify.model.LinkConversionRequest;
import com.stickify.model.MediaInfo;
import com.stickify.model.SourceMedia;
import com.stickify.model.StickerFit;
import com.stickify.model.StickerMode;
import com.stickify.model.StickerResult;

/**
 * Coordinates a conversion: gets the source media, applies limits, runs ffmpeg
 * in an isolated temp folder and cleans up afterwards.
 */
@Service
public class StickerService {

    private final FfmpegConverter converter;
    private final XMediaResolver resolver;
    private final StickerProperties properties;
    private final Semaphore jobs;

    public StickerService(FfmpegConverter converter, XMediaResolver resolver, StickerProperties properties) {
        this.converter = converter;
        this.resolver = resolver;
        this.properties = properties;
        this.jobs = new Semaphore(Math.max(1, properties.maxConcurrentJobs()), true);
    }

    public StickerResult fromUpload(MultipartFile file, StickerMode mode, Double startSeconds, Double seconds,
            StickerFit fit) {
        if (file == null || file.isEmpty()) {
            throw new InvalidInputException("Choose a GIF, video or image to upload");
        }
        try {
            SourceMedia media = SourceMedia.of(file.getBytes(), file.getContentType());
            return convert(media, options(mode, startSeconds, seconds, fit));
        } catch (IOException e) {
            throw new InvalidInputException("We couldn't read that upload. Please try again.");
        }
    }

    public StickerResult fromLink(LinkConversionRequest request) {
        SourceMedia media = resolver.resolve(request.url());
        return convert(media, options(request.mode(), request.startSeconds(), request.seconds(), request.fit()));
    }

    public MediaInfo describeLink(String url) {
        return resolver.describe(url);
    }

    /**
     * Without an explicit length the sticker uses the whole clip, up to WhatsApp's maximum;
     * ffmpeg simply stops at the end of shorter clips.
     */
    ConversionOptions options(StickerMode mode, Double startSeconds, Double seconds) {
        return options(mode, startSeconds, seconds, StickerFit.FILL);
    }

    ConversionOptions options(StickerMode mode, Double startSeconds, Double seconds, StickerFit fit) {
        double requested = seconds == null || seconds.isNaN() ? properties.maxSeconds() : seconds;
        double clamped = Math.min(Math.max(requested, MIN_SECONDS), properties.maxSeconds());
        double start = startSeconds == null || startSeconds.isNaN() ? 0 : startSeconds;
        return new ConversionOptions(mode, start, clamped, fit);
    }

    static final double MIN_SECONDS = 0.5;

    private StickerResult convert(SourceMedia media, ConversionOptions options) {
        ConversionOptions effective = media.stillImage() ? options.withMode(StickerMode.STATIC) : options;
        acquireSlot();
        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("stickify-");
            Path input = workDir.resolve("input");
            Files.write(input, media.data());
            return converter.convert(input, effective, workDir);
        } catch (IOException e) {
            throw new ConversionException("Couldn't prepare the file for conversion.", e);
        } finally {
            jobs.release();
            deleteQuietly(workDir);
        }
    }

    private void acquireSlot() {
        try {
            if (!jobs.tryAcquire(20, TimeUnit.SECONDS)) {
                throw new BusyException("Lots of people are making stickers right now. Try again in a moment.");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusyException("Request was interrupted. Try again.");
        }
    }

    private static void deleteQuietly(Path dir) {
        if (dir == null) {
            return;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException ignored) {
            // temp files are cleaned up by the OS eventually
        }
    }
}
