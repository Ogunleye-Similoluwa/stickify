package com.stickify.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.stickify.config.WhatsAppProperties;

/** On startup, makes sure Meta delivers incoming WhatsApp messages to this app. */
@Component
public class WhatsAppSubscriber {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppSubscriber.class);

    private final WhatsAppProperties properties;
    private final WhatsAppClient client;

    public WhatsAppSubscriber(WhatsAppProperties properties, WhatsAppClient client) {
        this.properties = properties;
        this.client = client;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void subscribe() {
        if (!properties.enabled() || properties.businessAccountId().isBlank()) {
            return;
        }
        Thread.startVirtualThread(() -> {
            try {
                client.subscribeApp();
                log.info("Subscribed to WhatsApp Business Account {}", properties.businessAccountId());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                log.warn("Couldn't subscribe to the WhatsApp Business Account: {}", e.getMessage());
            }
        });
    }
}
