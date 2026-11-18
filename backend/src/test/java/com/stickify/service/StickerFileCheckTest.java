package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.stickify.exception.InvalidInputException;

class StickerFileCheckTest {

    /** A minimal extended WebP header (VP8X) with the given canvas and animation flag. */
    static byte[] webp(int width, int height, boolean animated, int totalSize) {
        byte[] b = new byte[Math.max(totalSize, 40)];
        put(b, 0, "RIFF");
        put(b, 8, "WEBP");
        put(b, 12, "VP8X");
        b[16] = 10;
        b[20] = (byte) (animated ? 0x12 : 0x10);
        u24(b, 24, width - 1);
        u24(b, 27, height - 1);
        return b;
    }

    private static void put(byte[] b, int at, String s) {
        for (int i = 0; i < 4; i++) {
            b[at + i] = (byte) s.charAt(i);
        }
    }

    private static void u24(byte[] b, int at, int v) {
        b[at] = (byte) v;
        b[at + 1] = (byte) (v >> 8);
        b[at + 2] = (byte) (v >> 16);
    }

    @Test
    void acceptsAWhatsAppSizedSticker() {
        assertThat(StickerFileCheck.check(webp(512, 512, true, 400_000)).animated()).isTrue();
        assertThat(StickerFileCheck.check(webp(512, 512, false, 90_000)).animated()).isFalse();
    }

    @Test
    void rejectsWrongSizeOrTooBig() {
        assertThatThrownBy(() -> StickerFileCheck.check(webp(640, 360, true, 1000))).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> StickerFileCheck.check(webp(512, 512, true, 600_000))).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> StickerFileCheck.check(webp(512, 512, false, 200_000))).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> StickerFileCheck.check(new byte[50])).isInstanceOf(InvalidInputException.class);
    }
}
