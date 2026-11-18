package com.stickify;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import com.stickify.controller.WhatsAppController;
import com.stickify.service.HandoffStore;

/** Starts the whole application, so wiring mistakes fail the build instead of the deploy. */
@SpringBootTest
class StickifyApplicationTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void startsWithAllComponents() {
        assertThat(context.getBean(HandoffStore.class)).isNotNull();
        assertThat(context.getBean(WhatsAppController.class)).isNotNull();
    }
}
