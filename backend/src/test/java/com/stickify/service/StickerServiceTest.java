package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.stickify.config.StickerProperties;
import com.stickify.model.ConversionOptions;
import com.stickify.model.StickerMode;

class StickerServiceTest {

    private final StickerService service = new StickerService(
            mock(FfmpegConverter.class),
            mock(XMediaResolver.class),
            new StickerProperties("ffmpeg", 500_000, 100_000, 10, 6, 25L * 1024 * 1024, 2,
                    Duration.ofSeconds(60), List.of("*"), 30, Duration.ofMinutes(10), "https://api.fxtwitter.com"));

    @Test
    void defaultsToTheWholeClipUpToTheMaximum() {
        ConversionOptions options = service.options(StickerMode.ANIMATED, null, null);
        assertThat(options.seconds()).isEqualTo(10.0);
        assertThat(options.startSeconds()).isZero();
    }

    @Test
    void keepsFractionalTrimValues() {
        ConversionOptions options = service.options(StickerMode.ANIMATED, 1.25, 3.4);
        assertThat(options.startSeconds()).isEqualTo(1.25);
        assertThat(options.seconds()).isEqualTo(3.4);
    }

    @Test
    void clampsLengthToWhatsAppLimits() {
        assertThat(service.options(StickerMode.ANIMATED, 0.0, 42.0).seconds()).isEqualTo(10.0);
        assertThat(service.options(StickerMode.ANIMATED, 0.0, 0.1).seconds()).isEqualTo(StickerService.MIN_SECONDS);
        assertThat(service.options(StickerMode.ANIMATED, -3.0, 2.0).startSeconds()).isZero();
    }
}
