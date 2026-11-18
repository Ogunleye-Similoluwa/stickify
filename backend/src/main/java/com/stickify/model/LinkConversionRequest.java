package com.stickify.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * JSON body for converting the media in an X post.
 *
 * @param url          link to the post, e.g. https://x.com/user/status/123
 * @param mode         "animated" (default) or "static"
 * @param startSeconds optional start offset in seconds
 * @param seconds      optional clip length in seconds
 */
public record LinkConversionRequest(
        @NotBlank(message = "Paste a link to an X post") @Size(max = 500) String url,
        StickerMode mode,
        Double startSeconds,
        Integer seconds) {
}
