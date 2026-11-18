package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import com.stickify.config.WhatsAppProperties;

class HandoffStoreTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-18T12:00:00Z"));
    private final Clock clock = new Clock() {
        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    };

    private HandoffStore store(int max) {
        return new HandoffStore(new WhatsAppProperties("t", "p", "234800", "", "", "x", Duration.ofMinutes(30), max), clock);
    }

    @Test
    void givesAReadableCodeAndFindsTheSticker() {
        HandoffStore store = store(10);
        HandoffStore.Handoff handoff = store.put(new byte[] {1, 2, 3});
        assertThat(handoff.code()).hasSize(HandoffStore.CODE_LENGTH)
                .matches("[" + HandoffStore.ALPHABET + "]+");
        assertThat(store.find(handoff.code().toLowerCase())).hasValueSatisfying(h -> assertThat(h.sticker()).containsExactly(1, 2, 3));
        assertThat(store.find(handoff.code())).isPresent(); // still there for a resend
    }

    @Test
    void forgetsStickersAfterTheyExpire() {
        HandoffStore store = store(10);
        String code = store.put(new byte[] {1}).code();
        now.set(now.get().plus(Duration.ofMinutes(31)));
        assertThat(store.find(code)).isEmpty();
    }

    @Test
    void dropsTheOldestWhenFull() {
        HandoffStore store = store(2);
        String first = store.put(new byte[] {1}).code();
        store.put(new byte[] {2});
        store.put(new byte[] {3});
        assertThat(store.size()).isEqualTo(2);
        assertThat(store.find(first)).isEmpty();
    }
}
