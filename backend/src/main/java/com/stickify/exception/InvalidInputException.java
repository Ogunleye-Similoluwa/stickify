package com.stickify.exception;

import org.springframework.http.HttpStatus;

public class InvalidInputException extends StickerException {

    public InvalidInputException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
