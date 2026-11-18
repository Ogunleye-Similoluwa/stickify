package com.stickify.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.stickify.config.StickerProperties;
import com.stickify.exception.ConversionException;
import com.stickify.model.ConversionOptions;
import com.stickify.model.StickerMode;
import com.stickify.model.StickerResult;

/**
 * Runs ffmpeg to turn any GIF, video or image into a WhatsApp sticker:
 * a 512x512 WebP with a transparent border, under WhatsApp's size limit.
 * It retries with lower quality and frame rate until the file fits.
 */
@Component
public class FfmpegConverter {

    private static final Logger log = LoggerFactory.getLogger(FfmpegConverter.class);

    static final int STICKER_SIZE = 512;

    /** Animated attempts, best quality first: {frames per second, WebP quality}. */
    static final int[][] ANIMATED_STEPS = {
            {15, 75}, {15, 60}, {15, 45}, {12, 40}, {10, 35}, {10, 25}, {8, 20}, {6, 12}
    };

    static final int[] STATIC_QUALITIES = {90, 75, 60, 45, 30, 15};

    private final StickerProperties properties;

    public FfmpegConverter(StickerProperties properties) {
        this.properties = properties;
    }

    public StickerResult convert(Path input, ConversionOptions options, Path workDir) {
        return options.mode() == StickerMode.STATIC
                ? convertStatic(input, options, workDir)
                : convertAnimated(input, options, workDir);
    }

    private StickerResult convertAnimated(Path input, ConversionOptions options, Path workDir) {
        Path output = workDir.resolve("sticker.webp");
        for (int[] step : ANIMATED_STEPS) {
            int fps = step[0];
            int quality = step[1];
            List<String> command = baseCommand(options, input);
            command.addAll(List.of(
                    "-t", String.valueOf(options.seconds()),
                    "-vf", "fps=" + fps + "," + scaleAndPadFilter(),
                    "-c:v", "libwebp_anim",
                    "-lossless", "0",
                    "-q:v", String.valueOf(quality),
                    "-compression_level", "6",
                    "-loop", "0",
                    "-an",
                    output.toString()));
            run(command, workDir);
            long size = sizeOf(output);
            log.debug("Animated attempt fps={} q={} -> {} bytes", fps, quality, size);
            if (size > 0 && size <= properties.maxAnimatedBytes()) {
                return new StickerResult(read(output), StickerMode.ANIMATED, quality);
            }
        }
        throw new ConversionException(
                "This clip is too detailed to fit WhatsApp's 500 KB sticker limit. Try a shorter clip.");
    }

    private StickerResult convertStatic(Path input, ConversionOptions options, Path workDir) {
        Path output = workDir.resolve("sticker.webp");
        for (int quality : STATIC_QUALITIES) {
            List<String> command = baseCommand(options, input);
            command.addAll(List.of(
                    "-frames:v", "1",
                    "-vf", scaleAndPadFilter(),
                    "-c:v", "libwebp",
                    "-q:v", String.valueOf(quality),
                    "-compression_level", "6",
                    "-an",
                    output.toString()));
            run(command, workDir);
            long size = sizeOf(output);
            if (size > 0 && size <= properties.maxStaticBytes()) {
                return new StickerResult(read(output), StickerMode.STATIC, quality);
            }
        }
        throw new ConversionException("Couldn't shrink this image under WhatsApp's 100 KB limit.");
    }

    private List<String> baseCommand(ConversionOptions options, Path input) {
        List<String> command = new ArrayList<>(List.of(
                properties.ffmpegPath(), "-hide_banner", "-loglevel", "error", "-y"));
        if (options.startSeconds() > 0) {
            command.addAll(List.of("-ss", String.format(Locale.ROOT, "%.2f", options.startSeconds())));
        }
        command.addAll(List.of("-i", input.toString()));
        return command;
    }

    /** Fit inside 512x512 keeping the aspect ratio, then pad the rest with transparency. */
    static String scaleAndPadFilter() {
        return "scale=" + STICKER_SIZE + ":" + STICKER_SIZE
                + ":force_original_aspect_ratio=decrease:flags=lanczos,"
                + "format=rgba,"
                + "pad=" + STICKER_SIZE + ":" + STICKER_SIZE + ":(ow-iw)/2:(oh-ih)/2:color=0x00000000";
    }

    private void run(List<String> command, Path workDir) {
        Path errorLog = workDir.resolve("ffmpeg.log");
        Process process;
        try {
            process = new ProcessBuilder(command)
                    .directory(workDir.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(errorLog.toFile())
                    .start();
        } catch (IOException e) {
            throw new ConversionException("The converter isn't available right now.", e);
        }
        try {
            boolean finished = process.waitFor(properties.jobTimeout().toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new ConversionException("Converting took too long. Try a shorter clip.");
            }
            if (process.exitValue() != 0) {
                log.info("ffmpeg exited with {}: {}", process.exitValue(), tail(errorLog));
                throw new ConversionException("We couldn't read that file. Make sure it's a GIF, video or image.");
            }
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new ConversionException("Conversion was interrupted.", e);
        }
    }

    private static long sizeOf(Path file) {
        try {
            return Files.exists(file) ? Files.size(file) : -1;
        } catch (IOException e) {
            return -1;
        }
    }

    private static byte[] read(Path file) {
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw new ConversionException("Couldn't read the finished sticker.", e);
        }
    }

    private static String tail(Path log) {
        try {
            String text = Files.readString(log, StandardCharsets.UTF_8);
            return text.length() > 500 ? text.substring(text.length() - 500) : text;
        } catch (IOException e) {
            return "(no log)";
        }
    }
}
