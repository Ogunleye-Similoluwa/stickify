package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.stickify.config.WhatsAppProperties;

class WhatsAppStatusTest {

    private static WhatsAppProperties props(String mode, String secret, String token) {
        return new WhatsAppProperties(mode, secret, token, "p", "234800", "", "", "", "x", Duration.ofMinutes(30), 10);
    }

    @Test
    void cloudModeIsAvailableOnceConfigured() {
        assertThat(new WhatsAppStatus(props("cloud", "", "t")).available()).isTrue();
        assertThat(new WhatsAppStatus(props("cloud", "", "")).available()).isFalse();
    }

    @Test
    void linkedModeNeedsARecentBridgeHeartbeat() {
        AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-18T22:00:00Z"));
        Clock clock = new Clock() {
            public ZoneOffset getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId zone) { return this; }
            public Instant instant() { return now.get(); }
        };
        WhatsAppStatus status = new WhatsAppStatus(props("linked", "s3cret", ""), clock);
        assertThat(status.available()).isFalse();

        status.bridgeConnected();
        assertThat(status.available()).isTrue();

        now.set(now.get().plus(WhatsAppStatus.BRIDGE_TIMEOUT).plusSeconds(1));
        assertThat(status.available()).isFalse();
    }

    @Test
    void linkedModeNeedsTheBridgeSecret() {
        WhatsAppStatus status = new WhatsAppStatus(props("linked", "", ""));
        status.bridgeConnected();
        assertThat(status.available()).isFalse();
    }
}
