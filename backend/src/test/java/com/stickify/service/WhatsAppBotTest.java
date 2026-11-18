package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class WhatsAppBotTest {

    private final HandoffStore store = mock(HandoffStore.class);
    private final WhatsAppClient client = mock(WhatsAppClient.class);
    private final WhatsAppBot bot = new WhatsAppBot(store, client);
    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode message(String id, String text) throws Exception {
        return mapper.readTree("""
                {"entry":[{"changes":[{"value":{"messages":[
                  {"id":"%s","from":"2348012345678","type":"text","text":{"body":"%s"}}]}}]}]}
                """.formatted(id, text));
    }

    @Test
    void findsTheCodeInWhatPeopleSend() {
        assertThat(WhatsAppBot.codeIn("sticker K7Q2X")).contains("K7Q2X");
        assertThat(WhatsAppBot.codeIn("Sticker: k7q2x")).contains("K7Q2X");
        assertThat(WhatsAppBot.codeIn("k7q2x")).contains("K7Q2X");
        assertThat(WhatsAppBot.codeIn("hi there")).isEmpty(); // ordinary words aren't codes
        assertThat(WhatsAppBot.codeIn("there")).contains("THERE"); // ...unless the whole message looks like one
        assertThat(WhatsAppBot.codeIn("")).isEmpty();
    }

    @Test
    void sendsTheStickerBack() throws Exception {
        when(store.find("K7Q2X")).thenReturn(Optional.of(new HandoffStore.Handoff("K7Q2X", new byte[] {9}, Instant.MAX)));
        when(client.uploadSticker(any())).thenReturn("media-1");

        bot.handle(message("m1", "sticker K7Q2X"));

        verify(client).sendSticker("2348012345678", "media-1");
        verify(client).sendText("2348012345678", WhatsAppBot.SAVE_TIP);
    }

    @Test
    void explainsExpiredCodesAndHelpsOtherwise() throws Exception {
        when(store.find(anyString())).thenReturn(Optional.empty());
        bot.handle(message("m2", "sticker ABCDE"));
        verify(client).sendText("2348012345678", WhatsAppBot.EXPIRED);

        bot.handle(message("m3", "hi"));
        verify(client).sendText("2348012345678", WhatsAppBot.HELP);
        verify(client, never()).sendSticker(anyString(), anyString());
    }

    @Test
    void ignoresRepeatedDeliveries() throws Exception {
        when(store.find(anyString())).thenReturn(Optional.empty());
        bot.handle(message("same", "sticker ABCDE"));
        bot.handle(message("same", "sticker ABCDE"));
        verify(client, times(1)).sendText(eq("2348012345678"), anyString());
    }
}
