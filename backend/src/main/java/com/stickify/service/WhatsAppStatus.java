package com.stickify.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.stickify.config.WhatsAppProperties;

/**
 * Whether the website should offer "Send to WhatsApp" right now. With a linked number that also
 * means the bridge has checked in recently, so people are never sent to a number nobody answers.
 */
@Component
public class WhatsAppStatus {

    static final Duration BRIDGE_TIMEOUT = Duration.ofSeconds(90);

    private final WhatsAppProperties properties;
    private final Clock clock;
    private volatile Instant lastBridgeBeat = Instant.MIN;

    @Autowired
    public WhatsAppStatus(WhatsAppProperties properties) {
        this(properties, Clock.systemUTC());
    }

    WhatsAppStatus(WhatsAppProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /** Called by the linked-number bridge while it is connected to WhatsApp. */
    public void bridgeConnected() {
        lastBridgeBeat = clock.instant();
    }

    public boolean available() {
        if (!properties.enabled()) {
            return false;
        }
        if (!properties.linked()) {
            return true;
        }
        return lastBridgeBeat.isAfter(clock.instant().minus(BRIDGE_TIMEOUT));
    }
}
