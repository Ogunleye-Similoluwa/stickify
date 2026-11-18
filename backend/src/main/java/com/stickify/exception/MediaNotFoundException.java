package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class MediaNotFoundException extends StickerException {

    public MediaNotFoundException(String message) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, message);
    }
}
