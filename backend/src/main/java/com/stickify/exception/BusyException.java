package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class BusyException extends StickerException {

    public BusyException(String message) {
        super(HttpStatus.SERVICE_UNAVAILABLE, message);
    }
}
