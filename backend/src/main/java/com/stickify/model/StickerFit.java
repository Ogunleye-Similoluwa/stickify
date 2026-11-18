package com.stickify.model;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.stickify.exception.InvalidInputException;

/** How the picture fills the square sticker. */
public enum StickerFit {
    /** Crop to a square so the picture fills the whole sticker. */
    FILL,
    /** Keep the whole picture and add transparent space around it. */
    FIT;

    @JsonCreator
    public static StickerFit from(String value) {
        if (value == null || value.isBlank()) {
            return FILL;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvalidInputException("fit must be 'fill' or 'fit'");
        }
    }

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
