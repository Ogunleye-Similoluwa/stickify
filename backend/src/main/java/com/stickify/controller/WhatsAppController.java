package com.stickify.controller;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stickify.config.WhatsAppProperties;
import com.stickify.exception.BusyException;
import com.stickify.exception.InvalidInputException;
import com.stickify.service.HandoffStore;
import com.stickify.service.StickerFileCheck;
import com.stickify.service.WhatsAppBot;
import com.stickify.service.WhatsAppStatus;

/**
 * Hands a finished sticker to WhatsApp: the website uploads it and gets a code plus a wa.me link;
 * the person sends the code to the Stickify number, and Meta's webhook lets us reply with the sticker.
 */
@RestController
@RequestMapping("/api")
public class WhatsAppController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppController.class);

    private final WhatsAppProperties properties;
    private final HandoffStore store;
    private final WhatsAppBot bot;
    private final ObjectMapper mapper;
    private final WhatsAppStatus status;
    /** Reply after acknowledging Meta's call, so it never waits on our uploads. */
    private final ExecutorService replies = Executors.newFixedThreadPool(2);

    public WhatsAppController(WhatsAppProperties properties, HandoffStore store, WhatsAppBot bot, ObjectMapper mapper,
            WhatsAppStatus status) {
        this.properties = properties;
        this.store = store;
        this.bot = bot;
        this.mapper = mapper;
        this.status = status;
    }

    public record HandoffResponse(String code, String link, long expiresInSeconds) {}

    @PostMapping(value = "/handoff", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public HandoffResponse handoff(@RequestPart("sticker") MultipartFile sticker) throws IOException {
        if (!status.available()) {
            throw new BusyException("Sending to WhatsApp isn't available right now. Download the sticker instead.");
        }
        if (sticker == null || sticker.isEmpty()) {
            throw new InvalidInputException("Attach the sticker to send.");
        }
        byte[] bytes = sticker.getBytes();
        StickerFileCheck.check(bytes);
        HandoffStore.Handoff handoff = store.put(bytes);
        log.info("Sticker waiting for WhatsApp under code {} ({} bytes)", handoff.code(), bytes.length);
        String text = URLEncoder.encode("sticker " + handoff.code(), StandardCharsets.UTF_8).replace("+", "%20");
        return new HandoffResponse(handoff.code(), "https://wa.me/" + properties.waNumber() + "?text=" + text,
                properties.handoffTtl().toSeconds());
    }

    /** Meta calls this once when the webhook is registered and expects the challenge echoed back. */
    @GetMapping(value = "/whatsapp/webhook", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> verify(
            @RequestParam(value = "hub.mode", required = false) String mode,
            @RequestParam(value = "hub.verify_token", required = false) String token,
            @RequestParam(value = "hub.challenge", required = false) String challenge) {
        boolean ok = "subscribe".equals(mode) && !properties.verifyToken().isBlank()
                && MessageDigest.isEqual(properties.verifyToken().getBytes(StandardCharsets.UTF_8),
                        String.valueOf(token).getBytes(StandardCharsets.UTF_8));
        return ok ? ResponseEntity.ok(challenge) : ResponseEntity.status(HttpStatus.FORBIDDEN).body("forbidden");
    }

    /** Incoming WhatsApp messages. The raw bytes are kept as-is so Meta's signature can be checked exactly. */
    @PostMapping("/whatsapp/webhook")
    public ResponseEntity<Map<String, String>> receive(
            @RequestBody byte[] body,
            @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature) throws IOException {
        if (!validSignature(body, signature, properties.appSecret())) {
            log.warn("Rejected a webhook call with a missing or wrong signature ({} bytes)", body.length);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("status", "bad signature"));
        }
        var payload = mapper.readTree(body);
        log.info("WhatsApp webhook received ({} bytes)", body.length);
        if (properties.enabled() && !properties.linked()) {
            replies.submit(() -> bot.handle(payload));
        }
        return ResponseEntity.ok(Map.of("status", "received"));
    }

    /** Meta signs each call with the app secret (HMAC-SHA256 of the raw body). */
    static boolean validSignature(byte[] body, String header, String appSecret) {
        if (appSecret == null || appSecret.isBlank()) {
            return true; // not configured yet (e.g. while testing); set WHATSAPP_APP_SECRET in production
        }
        if (header == null || !header.startsWith("sha256=")) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(body);
            byte[] given = HexFormat.of().parseHex(header.substring("sha256=".length()));
            return MessageDigest.isEqual(expected, given);
        } catch (NoSuchAlgorithmException | InvalidKeyException | IllegalArgumentException e) {
            return false;
        }
    }
}
