package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class ConversionException extends StickerException {

    public ConversionException(String message) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }

    public ConversionException(String message, Throwable cause) {
        super(HttpStatus.INTERNAL_SERVER_ERROR, message, cause);
    }
}
