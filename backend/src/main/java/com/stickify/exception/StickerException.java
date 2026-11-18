package com.stickify.exception;

import org.springframework.http.HttpStatus;

/** Base type for errors that should reach the user with a clear message and status. */
public abstract class StickerException extends RuntimeException {

    private final HttpStatus status;

    protected StickerException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    protected StickerException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
