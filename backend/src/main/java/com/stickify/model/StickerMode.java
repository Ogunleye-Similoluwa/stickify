package com.stickify.model;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.stickify.exception.InvalidInputException;

public enum StickerMode {
    ANIMATED,
    STATIC;

    @JsonCreator
    public static StickerMode from(String value) {
        if (value == null || value.isBlank()) {
            return ANIMATED;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvalidInputException("mode must be 'animated' or 'static'");
        }
    }

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
