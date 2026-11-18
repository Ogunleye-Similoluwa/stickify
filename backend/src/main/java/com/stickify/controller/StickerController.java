package com.stickify.controller;

import java.util.Map;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.stickify.model.LinkConversionRequest;
import com.stickify.model.LinkLookupRequest;
import com.stickify.model.MediaInfo;
import com.stickify.model.StickerFit;
import com.stickify.model.StickerMode;
import com.stickify.model.StickerResult;
import com.stickify.service.StickerService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
public class StickerController {

    static final MediaType WEBP = MediaType.parseMediaType("image/webp");

    private final StickerService stickerService;

    public StickerController(StickerService stickerService) {
        this.stickerService = stickerService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    /** Converts an uploaded GIF, video or image. */
    @PostMapping(value = "/stickers", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> fromUpload(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "mode", required = false) String mode,
            @RequestParam(value = "start", required = false) Double start,
            @RequestParam(value = "seconds", required = false) Double seconds,
            @RequestParam(value = "fit", required = false) String fit) {
        StickerResult result = stickerService.fromUpload(file, StickerMode.from(mode), start, seconds,
                StickerFit.from(fit));
        return asWebp(result);
    }

    /** Looks up the media in an X post so the browser can preview and trim it before converting. */
    @PostMapping(value = "/media/resolve", consumes = MediaType.APPLICATION_JSON_VALUE)
    public MediaInfo resolveLink(@Valid @RequestBody LinkLookupRequest request) {
        return stickerService.describeLink(request.url());
    }

    /** Converts the media attached to an X post. */
    @PostMapping(value = "/stickers/from-link", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> fromLink(@Valid @RequestBody LinkConversionRequest request) {
        return asWebp(stickerService.fromLink(request));
    }

    private static ResponseEntity<byte[]> asWebp(StickerResult result) {
        return ResponseEntity.ok()
                .contentType(WEBP)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("sticker.webp").build().toString())
                .header("X-Sticker-Bytes", String.valueOf(result.sizeBytes()))
                .header("X-Sticker-Mode", result.mode().value())
                .header("X-Sticker-Quality", String.valueOf(result.quality()))
                .body(result.data());
    }
}
