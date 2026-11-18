package com.stickify.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** JSON body for looking up the media in an X post. */
public record LinkLookupRequest(
        @NotBlank(message = "Paste a link to an X post") @Size(max = 500) String url) {
}
