package com.stickify.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.stickify.config.WhatsAppProperties;

/**
 * Holds finished stickers for a short while under a short code, until the person sends that
 * code to the Stickify WhatsApp number. Kept in memory: the codes are short-lived and the API
 * runs as a single instance.
 */
@Component
public class HandoffStore {

    /** No 0/O, 1/I/L: easy to read and type. */
    static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    static final int CODE_LENGTH = 5;

    public record Handoff(String code, byte[] sticker, Instant expiresAt) {}

    private final WhatsAppProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final LinkedHashMap<String, Handoff> waiting = new LinkedHashMap<>();

    @Autowired
    public HandoffStore(WhatsAppProperties properties) {
        this(properties, Clock.systemUTC());
    }

    HandoffStore(WhatsAppProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public synchronized Handoff put(byte[] sticker) {
        dropExpired();
        while (waiting.size() >= properties.maxHandoffs()) {
            Iterator<Map.Entry<String, Handoff>> oldest = waiting.entrySet().iterator();
            oldest.next();
            oldest.remove();
        }
        String code;
        do {
            code = newCode();
        } while (waiting.containsKey(code));
        Handoff handoff = new Handoff(code, sticker, clock.instant().plus(properties.handoffTtl()));
        waiting.put(code, handoff);
        return handoff;
    }

    /** The sticker for a code, if it hasn't expired. It stays available until then, so a resend works. */
    public synchronized Optional<Handoff> find(String code) {
        dropExpired();
        return Optional.ofNullable(waiting.get(code.toUpperCase()));
    }

    synchronized int size() {
        dropExpired();
        return waiting.size();
    }

    private void dropExpired() {
        Instant now = clock.instant();
        waiting.values().removeIf(h -> h.expiresAt().isBefore(now));
    }

    private String newCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
