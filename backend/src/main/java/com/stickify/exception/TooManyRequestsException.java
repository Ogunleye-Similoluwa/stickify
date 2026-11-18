package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class TooManyRequestsException extends StickerException {

    public TooManyRequestsException(String message) {
        super(HttpStatus.TOO_MANY_REQUESTS, message);
    }
}
