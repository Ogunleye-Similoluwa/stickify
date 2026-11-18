package com.stickify.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.stickify.service.HandoffStore;
import com.stickify.service.WhatsAppBot;

@WebMvcTest(WhatsAppController.class)
@TestPropertySource(properties = {
        "whatsapp.token=test-token",
        "whatsapp.phone-number-id=123",
        "whatsapp.number=+234 801 234 5678",
        "whatsapp.verify-token=let-me-in",
})
class WhatsAppControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private HandoffStore store;

    @MockBean
    private WhatsAppBot bot;

    private static byte[] sticker() {
        byte[] b = new byte[2000];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, b, 0, 4);
        System.arraycopy("WEBPVP8X".getBytes(StandardCharsets.US_ASCII), 0, b, 8, 8);
        b[16] = 10;
        b[20] = 0x12;
        b[24] = (byte) 0xff;
        b[25] = 0x01;
        b[27] = (byte) 0xff;
        b[28] = 0x01;
        return b;
    }

    @Test
    void handsBackACodeAndAWhatsAppLink() throws Exception {
        when(store.put(any())).thenReturn(new HandoffStore.Handoff("K7Q2X", sticker(), Instant.MAX));
        mvc.perform(multipart("/api/handoff").file(new MockMultipartFile("sticker", "s.webp", "image/webp", sticker())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("K7Q2X"))
                .andExpect(jsonPath("$.link").value("https://wa.me/2348012345678?text=sticker%20K7Q2X"));
    }

    @Test
    void rejectsFilesThatArentStickers() throws Exception {
        mvc.perform(multipart("/api/handoff").file(new MockMultipartFile("sticker", "x.png", "image/png", new byte[100])))
                .andExpect(status().isBadRequest());
    }

    @Test
    void answersMetasWebhookCheck() throws Exception {
        mvc.perform(get("/api/whatsapp/webhook").param("hub.mode", "subscribe").param("hub.verify_token", "let-me-in")
                        .param("hub.challenge", "12345"))
                .andExpect(status().isOk())
                .andExpect(content().string("12345"));
        mvc.perform(get("/api/whatsapp/webhook").param("hub.mode", "subscribe").param("hub.verify_token", "wrong")
                        .param("hub.challenge", "12345"))
                .andExpect(status().isForbidden());
    }

    @Test
    void acceptsWebhookDeliveries() throws Exception {
        mvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content("{\"entry\":[]}"))
                .andExpect(status().isOk());
    }

    @Test
    void checksMetasSignature() throws Exception {
        String body = "{\"entry\":[]}";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String good = "sha256=" + HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        byte[] raw = body.getBytes(StandardCharsets.UTF_8);
        assertThat(WhatsAppController.validSignature(raw, good, "secret")).isTrue();
        assertThat(WhatsAppController.validSignature(raw, "sha256=00", "secret")).isFalse();
        assertThat(WhatsAppController.validSignature(raw, null, "secret")).isFalse();
        assertThat(WhatsAppController.validSignature(raw, null, "")).isTrue();
    }

    @Test
    void checksSignaturesOnNonEnglishNames() throws Exception {
        String body = "{\"contacts\":[{\"profile\":{\"name\":\"Similolúwa 😎\"}}]}";
        byte[] raw = body.getBytes(StandardCharsets.UTF_8);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String header = "sha256=" + HexFormat.of().formatHex(mac.doFinal(raw));
        assertThat(WhatsAppController.validSignature(raw, header, "secret")).isTrue();
        mvc.perform(post("/api/whatsapp/webhook").contentType(MediaType.APPLICATION_JSON).content(raw)
                        .header("X-Hub-Signature-256", header))
                .andExpect(status().isOk());
    }
}
