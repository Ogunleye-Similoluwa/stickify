package com.stickify.service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Replies to messages sent to the Stickify WhatsApp number: "sticker K7Q2X" gets the sticker
 * made on the website back as a real WhatsApp sticker.
 */
@Component
public class WhatsAppBot {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppBot.class);

    /** "sticker K7Q2X" anywhere in the message, or a message that is only the code. */
    private static final Pattern AFTER_WORD = Pattern.compile(
            "\\bsticker\\s*[:#-]?\\s*([A-Za-z0-9]{" + HandoffStore.CODE_LENGTH + "})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ONLY_CODE = Pattern.compile("^([A-Za-z0-9]{" + HandoffStore.CODE_LENGTH + "})$");

    static final String WEBSITE = "https://stickify-wa.pages.dev";
    static final String SAVE_TIP = "Here's your sticker! Tap it, then choose \"Add to Favorites\" to keep it in your sticker tray.";
    static final String EXPIRED = "That code has expired or doesn't exist. Make the sticker again on " + WEBSITE
            + " and tap Send to WhatsApp.";
    static final String HELP = "Hi! Make a sticker on " + WEBSITE
            + " and tap Send to WhatsApp. Your sticker arrives here, ready to add to your stickers.";
    static final String FAILED = "Sorry, the sticker couldn't be sent just now. Please send the code again in a minute.";

    private final HandoffStore store;
    private final WhatsAppClient client;
    /** Meta can deliver the same message twice; remember recent message IDs. */
    private final Set<String> seen = Collections.newSetFromMap(new LinkedHashMap<String, Boolean>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
            return size() > 1000;
        }
    });

    public WhatsAppBot(HandoffStore store, WhatsAppClient client) {
        this.store = store;
        this.client = client;
    }

    /** Handles one webhook delivery from Meta (it can contain several messages). */
    public void handle(JsonNode payload) {
        for (JsonNode entry : payload.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                for (JsonNode message : change.path("value").path("messages")) {
                    String id = message.path("id").asText();
                    synchronized (seen) {
                        if (!id.isEmpty() && !seen.add(id)) {
                            continue;
                        }
                    }
                    reply(message.path("from").asText(), textOf(message));
                }
            }
        }
    }

    static String textOf(JsonNode message) {
        return switch (message.path("type").asText()) {
            case "text" -> message.path("text").path("body").asText("");
            case "button" -> message.path("button").path("text").asText("");
            default -> "";
        };
    }

    static Optional<String> codeIn(String text) {
        String trimmed = text == null ? "" : text.trim();
        Matcher matcher = AFTER_WORD.matcher(trimmed);
        if (!matcher.find()) {
            matcher = ONLY_CODE.matcher(trimmed);
            if (!matcher.find()) {
                return Optional.empty();
            }
        }
        String candidate = matcher.group(1).toUpperCase();
        return candidate.chars().allMatch(c -> HandoffStore.ALPHABET.indexOf(c) >= 0) ? Optional.of(candidate) : Optional.empty();
    }

    private void reply(String to, String text) {
        if (to.isBlank()) {
            return;
        }
        String who = "…" + to.substring(Math.max(0, to.length() - 4));
        try {
            Optional<String> code = codeIn(text);
            log.info("WhatsApp message from {}: code {}", who, code.orElse("none"));
            if (code.isEmpty()) {
                client.sendText(to, HELP);
                return;
            }
            Optional<HandoffStore.Handoff> handoff = store.find(code.get());
            if (handoff.isEmpty()) {
                client.sendText(to, EXPIRED);
                return;
            }
            String mediaId = client.uploadSticker(handoff.get().sticker());
            client.sendSticker(to, mediaId);
            client.sendText(to, SAVE_TIP);
            log.info("Sent sticker {} to {}", code.get(), who);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Couldn't reply on WhatsApp", e);
            try {
                client.sendText(to, FAILED);
            } catch (Exception ignored) {
                // nothing more we can do
            } 
        }
    }
}
