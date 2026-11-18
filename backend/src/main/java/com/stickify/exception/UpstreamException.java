package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class UpstreamException extends StickerException {

    public UpstreamException(String message) {
        super(HttpStatus.BAD_GATEWAY, message);
    }

    public UpstreamException(String message, Throwable cause) {
        super(HttpStatus.BAD_GATEWAY, message, cause);
    }
}
