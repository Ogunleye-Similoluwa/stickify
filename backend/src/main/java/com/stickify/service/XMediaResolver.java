package com.stickify.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stickify.config.StickerProperties;
import com.stickify.exception.InvalidInputException;
import com.stickify.exception.MediaNotFoundException;
import com.stickify.exception.UpstreamException;
import com.stickify.model.MediaInfo;
import com.stickify.model.SourceMedia;

/**
 * Finds and downloads the GIF, video or photo attached to an X (Twitter) post.
 * Post details come from a public embed API; media is only downloaded from X's own
 * media hosts so the server can't be pointed at arbitrary URLs.
 */
@Component
public class XMediaResolver {

    private static final Pattern STATUS_URL = Pattern.compile(
            "^https?://(?:www\\.|mobile\\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\\.com/"
                    + "(?:[A-Za-z0-9_]{1,15}|i(?:/web)?)/status(?:es)?/(\\d{1,25})(?:[/?#].*)?$",
            Pattern.CASE_INSENSITIVE);

    private static final String USER_AGENT = "stickify/1.0 (sticker converter)";

    private final StickerProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public XMediaResolver(StickerProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** Downloads the post's media so it can be converted. */
    public SourceMedia resolve(String postUrl) {
        return download(choose(postUrl));
    }

    /** Looks up the post's media without downloading it, so the browser can preview and trim it. */
    public MediaInfo describe(String postUrl) {
        MediaChoice choice = choose(postUrl);
        return new MediaInfo(choice.url(), choice.kind(), choice.durationSeconds(), choice.width(), choice.height());
    }

    private MediaChoice choose(String postUrl) {
        String statusId = extractStatusId(postUrl)
                .orElseThrow(() -> new InvalidInputException(
                        "That doesn't look like an X post link. It should look like https://x.com/user/status/123…"));

        JsonNode media;
        try {
            media = fetchPostMedia(statusId);
        } catch (UpstreamException primaryDown) {
            // fxtwitter is down or overloaded: ask X's own embed service instead.
            media = fetchFromSyndication(statusId).orElseThrow(() -> primaryDown);
        }
        MediaChoice choice = chooseMedia(media)
                .orElseThrow(() -> new MediaNotFoundException("That post has no GIF, video or photo to use."));
        if (!isXMediaHost(choice.url())) {
            throw new MediaNotFoundException("That post's media isn't hosted on X, so we can't fetch it.");
        }
        return choice;
    }

    static Optional<String> extractStatusId(String url) {
        if (url == null) {
            return Optional.empty();
        }
        Matcher matcher = STATUS_URL.matcher(url.trim());
        return matcher.matches() ? Optional.of(matcher.group(1)) : Optional.empty();
    }

    private JsonNode fetchPostMedia(String statusId) {
        URI uri = URI.create(properties.linkResolverBaseUrl() + "/status/" + statusId);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) {
                throw new MediaNotFoundException("We couldn't find that post. It may be private or deleted.");
            }
            if (response.statusCode() != 200) {
                throw new UpstreamException("X lookup failed right now. Try again, or upload the file instead.");
            }
            JsonNode tweet = objectMapper.readTree(response.body()).path("tweet");
            if (tweet.isMissingNode()) {
                throw new MediaNotFoundException("We couldn't find that post. It may be private or deleted.");
            }
            return tweet.path("media");
        } catch (IOException e) {
            throw new UpstreamException("X lookup failed right now. Try again, or upload the file instead.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UpstreamException("X lookup was interrupted.", e);
        }
    }

    /** X's embed service (used by embedded posts on websites). Answers servers, not browsers. */
    static final String SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result?id=%s&token=%s&lang=en";

    /** The token the embed widget sends; the service currently accepts any value, but send the real one. */
    static String syndicationToken(String statusId) {
        double value = (Double.parseDouble(statusId) / 1e15) * Math.PI;
        long whole = (long) value;
        StringBuilder token = new StringBuilder(Long.toString(whole, 36)).append('.');
        double fraction = value - whole;
        for (int i = 0; i < 10; i++) {
            fraction *= 36;
            int digit = (int) fraction;
            token.append(Character.forDigit(digit, 36));
            fraction -= digit;
        }
        return token.toString().replaceAll("(0+|\\.)", "");
    }

    private Optional<JsonNode> fetchFromSyndication(String statusId) {
        URI uri = URI.create(String.format(Locale.ROOT, SYNDICATION_URL, statusId, syndicationToken(statusId)));
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(syndicationToMedia(objectMapper.readTree(response.body()), objectMapper));
        } catch (IOException e) {
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    /** Reshapes the embed service's answer into the same form fxtwitter uses, so one chooser handles both. */
    static JsonNode syndicationToMedia(JsonNode post, ObjectMapper mapper) {
        ObjectNode media = mapper.createObjectNode();
        ArrayNode videos = media.putArray("videos");
        ArrayNode photos = media.putArray("photos");
        for (JsonNode item : post.path("mediaDetails")) {
            String type = item.path("type").asText();
            JsonNode size = item.path("original_info");
            if ("photo".equals(type)) {
                ObjectNode photo = photos.addObject();
                photo.put("url", item.path("media_url_https").asText());
                copyNumber(size, "width", photo);
                copyNumber(size, "height", photo);
                continue;
            }
            JsonNode info = item.path("video_info");
            ObjectNode video = videos.addObject();
            video.put("type", "animated_gif".equals(type) ? "gif" : "video");
            if (info.path("duration_millis").isNumber()) {
                video.put("duration", info.path("duration_millis").asDouble() / 1000.0);
            }
            copyNumber(size, "width", video);
            copyNumber(size, "height", video);
            ArrayNode variants = video.putArray("variants");
            String best = null;
            long bestRate = -1;
            for (JsonNode variant : info.path("variants")) {
                String contentType = variant.path("content_type").asText();
                String url = variant.path("url").asText();
                variants.addObject().put("content_type", contentType).put("url", url);
                long rate = variant.path("bitrate").asLong(0);
                if ("video/mp4".equals(contentType) && rate >= bestRate) {
                    best = url;
                    bestRate = rate;
                }
            }
            if (best != null) {
                video.put("url", best);
            }
        }
        return media;
    }

    private static void copyNumber(JsonNode from, String field, ObjectNode to) {
        if (from.path(field).isNumber()) {
            to.put(field, from.path(field).asInt());
        }
    }

    /** Prefer GIFs, then videos, then photos. */
    static Optional<MediaChoice> chooseMedia(JsonNode media) {
        if (media == null || media.isMissingNode()) {
            return Optional.empty();
        }
        MediaChoice video = null;
        for (JsonNode item : media.path("videos")) {
            String url = item.path("url").asText(null);
            if (url == null) {
                continue;
            }
            boolean gif = "gif".equalsIgnoreCase(item.path("type").asText());
            Integer width = intOrNull(item.path("width"));
            Integer height = intOrNull(item.path("height"));
            Variant smaller = smallestUsefulVariant(item.path("variants"));
            if (smaller != null) {
                url = smaller.url();
                width = smaller.width();
                height = smaller.height();
            }
            MediaChoice candidate = new MediaChoice(url, gif ? "gif" : "video",
                    positiveOrNull(item.path("duration")), width, height);
            if (gif) {
                return Optional.of(candidate);
            }
            if (video == null) {
                video = candidate;
            }
        }
        if (video != null) {
            return Optional.of(video);
        }
        for (JsonNode item : media.path("photos")) {
            String url = item.path("url").asText(null);
            if (url != null) {
                return Optional.of(new MediaChoice(url, "photo", null,
                        intOrNull(item.path("width")), intOrNull(item.path("height"))));
            }
        }
        return Optional.empty();
    }

    /** Smallest size that still fills a sticker; anything larger only slows conversion down. */
    static final int USEFUL_SIZE = 512;

    private static final Pattern VARIANT_SIZE = Pattern.compile("/(\\d+)x(\\d+)/");

    record Variant(String url, int width, int height) {
        int longSide() {
            return Math.max(width, height);
        }
    }

    /**
     * X keeps several MP4 copies of each video (for example 480x270, 640x360, 1280x720).
     * Picks the smallest one whose long side is at least {@link #USEFUL_SIZE}, or the largest if none are.
     */
    static Variant smallestUsefulVariant(JsonNode variants) {
        Variant best = null;
        Variant largest = null;
        for (JsonNode item : variants) {
            String url = item.path("url").asText("");
            if (!"video/mp4".equalsIgnoreCase(item.path("content_type").asText()) || url.isEmpty()) {
                continue;
            }
            Matcher size = VARIANT_SIZE.matcher(url);
            if (!size.find()) {
                continue;
            }
            Variant variant = new Variant(url, Integer.parseInt(size.group(1)), Integer.parseInt(size.group(2)));
            if (largest == null || variant.longSide() > largest.longSide()) {
                largest = variant;
            }
            if (variant.longSide() >= USEFUL_SIZE && (best == null || variant.longSide() < best.longSide())) {
                best = variant;
            }
        }
        return best != null ? best : largest;
    }

    private static Double positiveOrNull(JsonNode node) {
        return node.isNumber() && node.asDouble() > 0 ? node.asDouble() : null;
    }

    private static Integer intOrNull(JsonNode node) {
        return node.isNumber() ? node.asInt() : null;
    }

    static boolean isXMediaHost(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return "https".equalsIgnoreCase(uri.getScheme()) && (host.equals("twimg.com") || host.endsWith(".twimg.com"));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private SourceMedia download(MediaChoice choice) {
        URI uri = URI.create(choice.url());
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", USER_AGENT)
                .GET()
                .build();
        try {
            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() != 200) {
                    throw new UpstreamException("Couldn't download the media from X. Try again in a moment.");
                }
                byte[] data = readLimited(body, properties.maxDownloadBytes());
                String contentType = response.headers().firstValue("Content-Type").orElse(null);
                SourceMedia media = SourceMedia.of(data, contentType);
                return choice.photo() ? new SourceMedia(data, contentType, true) : media;
            }
        } catch (IOException e) {
            throw new UpstreamException("Couldn't download the media from X. Try again in a moment.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UpstreamException("Download was interrupted.", e);
        }
    }

    private static byte[] readLimited(InputStream in, long maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new MediaNotFoundException("That video is too large to turn into a sticker.");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    record MediaChoice(String url, String kind, Double durationSeconds, Integer width, Integer height) {

        boolean photo() {
            return "photo".equals(kind);
        }
    }
}
