package com.stickify.service;

import java.nio.charset.StandardCharsets;

import com.stickify.exception.InvalidInputException;

/** Checks an uploaded sticker against WhatsApp's rules before it's sent. */
public final class StickerFileCheck {

    static final int SIZE = 512;
    static final int MAX_ANIMATED_BYTES = 500 * 1024;
    static final int MAX_STATIC_BYTES = 100 * 1024;

    private StickerFileCheck() {
    }

    public record Info(int width, int height, boolean animated) {}

    public static Info check(byte[] bytes) {
        Info info = parse(bytes);
        if (info == null) {
            throw new InvalidInputException("That isn't a WebP sticker.");
        }
        if (info.width() != SIZE || info.height() != SIZE) {
            throw new InvalidInputException("Stickers must be 512 × 512.");
        }
        int limit = info.animated() ? MAX_ANIMATED_BYTES : MAX_STATIC_BYTES;
        if (bytes.length > limit) {
            throw new InvalidInputException(info.animated()
                    ? "Animated stickers must be 500 KB or less."
                    : "Still stickers must be 100 KB or less.");
        }
        return info;
    }

    static Info parse(byte[] b) {
        if (b == null || b.length < 30 || !"RIFF".equals(ascii(b, 0)) || !"WEBP".equals(ascii(b, 8))) {
            return null;
        }
        return switch (ascii(b, 12)) {
            case "VP8X" -> new Info(u24(b, 24) + 1, u24(b, 27) + 1, (b[20] & 0x02) != 0);
            case "VP8 " -> new Info(u16(b, 26) & 0x3fff, u16(b, 28) & 0x3fff, false);
            case "VP8L" -> {
                int b0 = b[21] & 0xff, b1 = b[22] & 0xff, b2 = b[23] & 0xff, b3 = b[24] & 0xff;
                yield new Info(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), false);
            }
            default -> null;
        };
    }

    private static String ascii(byte[] b, int at) {
        return new String(b, at, 4, StandardCharsets.US_ASCII);
    }

    private static int u24(byte[] b, int at) {
        return (b[at] & 0xff) | ((b[at + 1] & 0xff) << 8) | ((b[at + 2] & 0xff) << 16);
    }

    private static int u16(byte[] b, int at) {
        return (b[at] & 0xff) | ((b[at + 1] & 0xff) << 8);
    }
}
