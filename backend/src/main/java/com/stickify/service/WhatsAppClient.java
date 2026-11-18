package com.stickify.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stickify.config.WhatsAppProperties;

/** Talks to the WhatsApp Cloud API: uploads a sticker and sends messages. */
@Component
public class WhatsAppClient {

    private final WhatsAppProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public WhatsAppClient(WhatsAppProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    /** Uploads the sticker to WhatsApp and returns its media ID. */
    public String uploadSticker(byte[] sticker) throws IOException, InterruptedException {
        String boundary = "stickify-" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        field(body, boundary, "messaging_product", "whatsapp");
        field(body, boundary, "type", "image/webp");
        body.write(("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"sticker.webp\"\r\n"
                + "Content-Type: image/webp\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(sticker);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder(URI.create(properties.graphBaseUrl() + "/" + properties.phoneNumberId() + "/media"))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer " + properties.token())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                .build();
        JsonNode reply = send(request);
        String id = reply.path("id").asText("");
        if (id.isEmpty()) {
            throw new IOException("WhatsApp didn't return a media id: " + reply);
        }
        return id;
    }

    public void sendSticker(String to, String mediaId) throws IOException, InterruptedException {
        ObjectNode message = base(to, "sticker");
        message.putObject("sticker").put("id", mediaId);
        post(message);
    }

    public void sendText(String to, String text) throws IOException, InterruptedException {
        ObjectNode message = base(to, "text");
        message.putObject("text").put("body", text).put("preview_url", false);
        post(message);
    }

    private ObjectNode base(String to, String type) {
        ObjectNode message = mapper.createObjectNode();
        message.put("messaging_product", "whatsapp");
        message.put("recipient_type", "individual");
        message.put("to", to);
        message.put("type", type);
        return message;
    }

    private void post(ObjectNode message) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(properties.graphBaseUrl() + "/" + properties.phoneNumberId() + "/messages"))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + properties.token())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(message)))
                .build();
        send(request);
    }

    private JsonNode send(HttpRequest request) throws IOException, InterruptedException {
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("WhatsApp API " + response.statusCode() + ": " + response.body());
        }
        return mapper.readTree(response.body());
    }

    private static void field(ByteArrayOutputStream body, String boundary, String name, String value) throws IOException {
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n")
                .getBytes(StandardCharsets.UTF_8));
    }
}
