package com.stickify.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.stickify.service.HandoffStore;
import com.stickify.service.StickerService;
import com.stickify.service.WhatsAppStatus;

@WebMvcTest({BridgeController.class, StickerController.class})
@Import(WhatsAppStatus.class)
@TestPropertySource(properties = {
        "whatsapp.mode=linked",
        "whatsapp.bridge-secret=bridge-secret",
        "whatsapp.number=+234 801 234 5678"
})
class BridgeControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private HandoffStore store;

    @MockBean
    private StickerService stickerService;

    @Test
    void givesTheStickerToTheBridge() throws Exception {
        byte[] sticker = {1, 2, 3};
        when(store.find("ABCDE")).thenReturn(Optional.of(new HandoffStore.Handoff("ABCDE", sticker, Instant.MAX)));

        mvc.perform(get("/api/internal/handoff/ABCDE").header("X-Bridge-Secret", "bridge-secret"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(sticker));
    }

    @Test
    void unknownCodeIsNotFound() throws Exception {
        when(store.find("ZZZZZ")).thenReturn(Optional.empty());
        mvc.perform(get("/api/internal/handoff/ZZZZZ").header("X-Bridge-Secret", "bridge-secret"))
                .andExpect(status().isNotFound());
    }

    @Test
    void refusesCallsWithoutTheSecret() throws Exception {
        mvc.perform(get("/api/internal/handoff/ABCDE")).andExpect(status().isForbidden());
        mvc.perform(get("/api/internal/handoff/ABCDE").header("X-Bridge-Secret", "guess")).andExpect(status().isForbidden());
        mvc.perform(post("/api/internal/bridge/heartbeat")).andExpect(status().isForbidden());
    }

    @Test
    void heartbeatTurnsWhatsAppOnInHealth() throws Exception {
        mvc.perform(get("/api/health")).andExpect(jsonPath("$.whatsapp").value(false));
        mvc.perform(post("/api/internal/bridge/heartbeat").header("X-Bridge-Secret", "bridge-secret"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/health")).andExpect(jsonPath("$.whatsapp").value(true));
    }
}
