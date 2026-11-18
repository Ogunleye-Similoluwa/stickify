package com.stickify.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import com.stickify.exception.MediaNotFoundException;
import com.stickify.model.LinkConversionRequest;
import com.stickify.model.MediaInfo;
import com.stickify.model.StickerMode;
import com.stickify.model.StickerResult;
import com.stickify.service.StickerService;

@WebMvcTest(StickerController.class)
class StickerControllerTest {

    private static final byte[] FAKE_WEBP = "RIFF0000WEBPVP8X".getBytes();

    @Autowired
    private MockMvc mvc;

    @MockBean
    private StickerService stickerService;

    @Test
    void healthIsOk() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void uploadReturnsWebpSticker() throws Exception {
        when(stickerService.fromUpload(any(), eq(StickerMode.ANIMATED), any(), any()))
                .thenReturn(new StickerResult(FAKE_WEBP, StickerMode.ANIMATED, 60));

        MockMultipartFile file = new MockMultipartFile("file", "cat.gif", "image/gif", new byte[] {1, 2, 3});

        mvc.perform(multipart("/api/stickers").file(file).param("mode", "animated"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/webp"))
                .andExpect(header().string("X-Sticker-Mode", "animated"))
                .andExpect(header().string("X-Sticker-Bytes", String.valueOf(FAKE_WEBP.length)))
                .andExpect(content().bytes(FAKE_WEBP));
    }

    @Test
    void invalidModeIsBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "cat.gif", "image/gif", new byte[] {1});

        mvc.perform(multipart("/api/stickers").file(file).param("mode", "sideways"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("mode must be 'animated' or 'static'"));
    }

    @Test
    void linkWithoutUrlIsBadRequest() throws Exception {
        mvc.perform(post("/api/stickers/from-link")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Paste a link to an X post"));
    }

    @Test
    void linkWithoutMediaIsUnprocessable() throws Exception {
        when(stickerService.fromLink(any(LinkConversionRequest.class)))
                .thenThrow(new MediaNotFoundException("That post has no GIF, video or photo to use."));

        mvc.perform(post("/api/stickers/from-link")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://x.com/a/status/1\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("That post has no GIF, video or photo to use."));
    }

    @Test
    void resolveReturnsMediaInfo() throws Exception {
        when(stickerService.describeLink("https://x.com/a/status/1"))
                .thenReturn(new MediaInfo("https://video.twimg.com/g.mp4", "gif", 4.2, 480, 270));

        mvc.perform(post("/api/media/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://x.com/a/status/1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mediaUrl").value("https://video.twimg.com/g.mp4"))
                .andExpect(jsonPath("$.kind").value("gif"))
                .andExpect(jsonPath("$.durationSeconds").value(4.2));
    }

    @Test
    void corsAllowsBrowserCalls() throws Exception {
        mvc.perform(get("/api/health").header("Origin", "https://example.github.io"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://example.github.io"));
    }
}
