package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.junit.jupiter.api.io.TempDir;

import com.stickify.config.StickerProperties;
import com.stickify.model.ConversionOptions;
import com.stickify.model.StickerMode;
import com.stickify.model.StickerResult;

@EnabledIf("ffmpegAvailable")
class FfmpegConverterTest {

    @TempDir
    static Path sharedDir;

    static Path sampleVideo;

    private final FfmpegConverter converter = new FfmpegConverter(new StickerProperties(
            "ffmpeg", 500_000, 100_000, 10, 6, 25L * 1024 * 1024, 2, Duration.ofSeconds(60),
            List.of("*"), 30, Duration.ofMinutes(10), "https://api.fxtwitter.com"));

    static boolean ffmpegAvailable() {
        try {
            return new ProcessBuilder("ffmpeg", "-version").start().waitFor() == 0;
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    @BeforeAll
    static void createSample() throws Exception {
        sampleVideo = sharedDir.resolve("sample.mp4");
        Process process = new ProcessBuilder("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4",
                "-pix_fmt", "yuv420p", sampleVideo.toString())
                .redirectErrorStream(true)
                .start();
        assertThat(process.waitFor()).isZero();
    }

    @Test
    void makesAnimatedStickerUnderWhatsAppLimit(@TempDir Path workDir) {
        StickerResult result = converter.convert(sampleVideo,
                new ConversionOptions(StickerMode.ANIMATED, 0, 3), workDir);

        assertThat(result.mode()).isEqualTo(StickerMode.ANIMATED);
        assertThat(result.sizeBytes()).isPositive().isLessThanOrEqualTo(500_000);
        assertWebp(result.data());
        assertThat(new String(result.data(), StandardCharsets.ISO_8859_1)).contains("ANIM");
    }

    @Test
    void makesStaticStickerUnderWhatsAppLimit(@TempDir Path workDir) {
        StickerResult result = converter.convert(sampleVideo,
                new ConversionOptions(StickerMode.STATIC, 1, 6), workDir);

        assertThat(result.mode()).isEqualTo(StickerMode.STATIC);
        assertThat(result.sizeBytes()).isPositive().isLessThanOrEqualTo(100_000);
        assertWebp(result.data());
    }

    private static void assertWebp(byte[] data) {
        assertThat(new String(Arrays.copyOfRange(data, 0, 4), StandardCharsets.US_ASCII)).isEqualTo("RIFF");
        assertThat(new String(Arrays.copyOfRange(data, 8, 12), StandardCharsets.US_ASCII)).isEqualTo("WEBP");
    }

    @Test
    void sampleExists() throws IOException {
        assertThat(Files.size(sampleVideo)).isPositive();
    }
}
