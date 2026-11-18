package com.stickify.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.stickify.config.WhatsAppProperties;
import com.stickify.service.HandoffStore;
import com.stickify.service.WhatsAppStatus;

/**
 * Used only by the linked-number bridge running in the same container. Every call must carry
 * the shared secret the container generates at startup.
 */
@RestController
@RequestMapping("/api/internal")
public class BridgeController {

    static final String SECRET_HEADER = "X-Bridge-Secret";

    private final WhatsAppProperties properties;
    private final HandoffStore store;
    private final WhatsAppStatus status;

    public BridgeController(WhatsAppProperties properties, HandoffStore store, WhatsAppStatus status) {
        this.properties = properties;
        this.store = store;
        this.status = status;
    }

    /** The sticker waiting under a code, or 404 if it expired or never existed. */
    @GetMapping(value = "/handoff/{code}", produces = "image/webp")
    public ResponseEntity<byte[]> sticker(@PathVariable String code,
            @RequestHeader(value = SECRET_HEADER, required = false) String secret) {
        if (!allowed(secret)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return store.find(code)
                .map(handoff -> ResponseEntity.ok().contentType(MediaType.parseMediaType("image/webp")).body(handoff.sticker()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** The bridge calls this every few seconds while it is connected to WhatsApp. */
    @PostMapping("/bridge/heartbeat")
    public ResponseEntity<Void> heartbeat(@RequestHeader(value = SECRET_HEADER, required = false) String secret) {
        if (!allowed(secret)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        status.bridgeConnected();
        return ResponseEntity.noContent().build();
    }

    private boolean allowed(String secret) {
        String expected = properties.bridgeSecret();
        return properties.linked() && !expected.isBlank() && secret != null
                && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), secret.getBytes(StandardCharsets.UTF_8));
    }
}
