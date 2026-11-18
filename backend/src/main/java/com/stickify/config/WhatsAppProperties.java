package com.stickify.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Settings for the Stickify WhatsApp number, which sends stickers back to people who message it
 * their code. Everything comes from environment variables; the feature is off until the token,
 * phone number ID and number are set.
 *
 * @param token          WhatsApp Cloud API access token
 * @param phoneNumberId  ID of the sending number in the Cloud API
 * @param number         the number people message, digits only with country code (used in wa.me links)
 * @param verifyToken    shared secret Meta echoes when the webhook is registered
 * @param appSecret      Meta app secret, used to check that webhook calls really come from Meta
 * @param businessAccountId WhatsApp Business Account ID; the app subscribes to it on startup so messages are delivered
 * @param graphBaseUrl   Graph API base URL
 * @param handoffTtl     how long a sticker waits for its code to be sent
 * @param maxHandoffs    how many stickers can wait at once
 */
@ConfigurationProperties(prefix = "whatsapp")
public record WhatsAppProperties(
        @DefaultValue("") String token,
        @DefaultValue("") String phoneNumberId,
        @DefaultValue("") String number,
        @DefaultValue("") String verifyToken,
        @DefaultValue("") String appSecret,
        @DefaultValue("") String businessAccountId,
        @DefaultValue("https://graph.facebook.com/v25.0") String graphBaseUrl,
        @DefaultValue("30m") Duration handoffTtl,
        @DefaultValue("300") int maxHandoffs) {

    public boolean enabled() {
        return !token.isBlank() && !phoneNumberId.isBlank() && !number.isBlank();
    }

    /** Digits only, as wa.me expects. */
    public String waNumber() {
        return number.replaceAll("\\D", "");
    }
}
