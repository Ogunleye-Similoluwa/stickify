package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class XMediaResolverTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {
            "https://x.com/someone/status/1790000000000000000",
            "https://twitter.com/someone/status/1790000000000000000?s=20",
            "http://mobile.twitter.com/someone/status/1790000000000000000",
            "https://www.x.com/someone/statuses/1790000000000000000/",
            "https://fxtwitter.com/someone/status/1790000000000000000",
            "https://x.com/i/status/1790000000000000000",
            "  https://x.com/someone/status/1790000000000000000#m  "
    })
    void extractsStatusIdFromSupportedLinks(String url) {
        assertThat(XMediaResolver.extractStatusId(url)).contains("1790000000000000000");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "not a link",
            "https://x.com/someone",
            "https://evil.com/someone/status/123",
            "https://x.com.evil.com/someone/status/123",
            "ftp://x.com/someone/status/123"
    })
    void rejectsUnsupportedLinks(String url) {
        assertThat(XMediaResolver.extractStatusId(url)).isEmpty();
    }

    @Test
    void prefersGifOverVideoAndPhoto() throws Exception {
        JsonNode media = mapper.readTree("""
                {"photos":[{"url":"https://pbs.twimg.com/media/a.jpg"}],
                 "videos":[{"type":"video","url":"https://video.twimg.com/v.mp4"},
                           {"type":"gif","url":"https://video.twimg.com/g.mp4"}]}
                """);
        assertThat(XMediaResolver.chooseMedia(media))
                .hasValueSatisfying(choice -> {
                    assertThat(choice.url()).endsWith("g.mp4");
                    assertThat(choice.photo()).isFalse();
                });
    }

    @Test
    void fallsBackToPhoto() throws Exception {
        JsonNode media = mapper.readTree("""
                {"photos":[{"url":"https://pbs.twimg.com/media/a.jpg"}]}
                """);
        assertThat(XMediaResolver.chooseMedia(media))
                .hasValueSatisfying(choice -> assertThat(choice.photo()).isTrue());
    }

    @Test
    void emptyWhenNoMedia() throws Exception {
        assertThat(XMediaResolver.chooseMedia(mapper.readTree("{}"))).isEmpty();
        assertThat(XMediaResolver.chooseMedia(null)).isEmpty();
    }
}
