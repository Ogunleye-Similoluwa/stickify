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
    void readsDurationAndSize() throws Exception {
        JsonNode media = mapper.readTree("""
                {"videos":[{"type":"video","url":"https://video.twimg.com/v.mp4",
                            "duration":7.5,"width":1280,"height":720}]}
                """);
        assertThat(XMediaResolver.chooseMedia(media))
                .hasValueSatisfying(choice -> {
                    assertThat(choice.kind()).isEqualTo("video");
                    assertThat(choice.durationSeconds()).isEqualTo(7.5);
                    assertThat(choice.width()).isEqualTo(1280);
                    assertThat(choice.height()).isEqualTo(720);
                });
    }

    @Test
    void picksSmallestVideoCopyThatFillsASticker() throws Exception {
        JsonNode media = mapper.readTree("""
                {"videos":[{"type":"video","url":"https://video.twimg.com/vid/1920x1080/full.mp4",
                            "duration":9.3,"width":1920,"height":1080,
                            "variants":[
                              {"content_type":"application/x-mpegURL","url":"https://video.twimg.com/pl/a.m3u8"},
                              {"content_type":"video/mp4","url":"https://video.twimg.com/vid/480x270/a.mp4"},
                              {"content_type":"video/mp4","url":"https://video.twimg.com/vid/1280x720/b.mp4"},
                              {"content_type":"video/mp4","url":"https://video.twimg.com/vid/640x360/c.mp4?tag=14"},
                              {"content_type":"video/mp4","url":"https://video.twimg.com/vid/1920x1080/full.mp4"}]}]}
                """);
        assertThat(XMediaResolver.chooseMedia(media))
                .hasValueSatisfying(choice -> {
                    assertThat(choice.url()).isEqualTo("https://video.twimg.com/vid/640x360/c.mp4?tag=14");
                    assertThat(choice.width()).isEqualTo(640);
                    assertThat(choice.height()).isEqualTo(360);
                    assertThat(choice.durationSeconds()).isEqualTo(9.3);
                });
    }

    @Test
    void usesLargestCopyWhenAllAreSmall() throws Exception {
        JsonNode variants = mapper.readTree("""
                [{"content_type":"video/mp4","url":"https://video.twimg.com/vid/320x320/a.mp4"},
                 {"content_type":"video/mp4","url":"https://video.twimg.com/vid/480x480/b.mp4"}]
                """);
        assertThat(XMediaResolver.smallestUsefulVariant(variants).url())
                .isEqualTo("https://video.twimg.com/vid/480x480/b.mp4");
        assertThat(XMediaResolver.smallestUsefulVariant(mapper.readTree("[]"))).isNull();
    }

    @Test
    void portraitVideoUsesItsLongSide() throws Exception {
        JsonNode variants = mapper.readTree("""
                [{"content_type":"video/mp4","url":"https://video.twimg.com/vid/320x568/a.mp4"},
                 {"content_type":"video/mp4","url":"https://video.twimg.com/vid/720x1280/b.mp4"}]
                """);
        assertThat(XMediaResolver.smallestUsefulVariant(variants).url())
                .isEqualTo("https://video.twimg.com/vid/320x568/a.mp4");
    }

    @Test
    void readsXEmbedServiceAnswers() throws Exception {
        JsonNode post = mapper.readTree("""
                {"mediaDetails":[{"type":"video","original_info":{"width":1920,"height":1080},
                  "video_info":{"duration_millis":9301,"variants":[
                    {"content_type":"application/x-mpegURL","url":"https://video.twimg.com/pl/a.m3u8"},
                    {"content_type":"video/mp4","bitrate":832000,"url":"https://video.twimg.com/vid/640x360/c.mp4"},
                    {"content_type":"video/mp4","bitrate":10368000,"url":"https://video.twimg.com/vid/1920x1080/f.mp4"}]}}]}
                """);
        assertThat(XMediaResolver.chooseMedia(XMediaResolver.syndicationToMedia(post, mapper)))
                .hasValueSatisfying(choice -> {
                    assertThat(choice.kind()).isEqualTo("video");
                    assertThat(choice.url()).isEqualTo("https://video.twimg.com/vid/640x360/c.mp4");
                    assertThat(choice.durationSeconds()).isEqualTo(9.301);
                });
    }

    @Test
    void readsEmbedServiceGifsAndPhotos() throws Exception {
        JsonNode gif = mapper.readTree("""
                {"mediaDetails":[{"type":"animated_gif","video_info":{"variants":[
                    {"content_type":"video/mp4","bitrate":0,"url":"https://video.twimg.com/tweet_video/g.mp4"}]}}]}
                """);
        assertThat(XMediaResolver.chooseMedia(XMediaResolver.syndicationToMedia(gif, mapper)))
                .hasValueSatisfying(choice -> {
                    assertThat(choice.kind()).isEqualTo("gif");
                    assertThat(choice.url()).isEqualTo("https://video.twimg.com/tweet_video/g.mp4");
                });
        JsonNode photo = mapper.readTree("""
                {"mediaDetails":[{"type":"photo","media_url_https":"https://pbs.twimg.com/media/a.jpg"}]}
                """);
        assertThat(XMediaResolver.chooseMedia(XMediaResolver.syndicationToMedia(photo, mapper)))
                .hasValueSatisfying(choice -> assertThat(choice.photo()).isTrue());
    }

    @Test
    void makesTheEmbedToken() {
        assertThat(XMediaResolver.syndicationToken("1585341984679469056")).startsWith("3uchycv2wqc");
    }

    @Test
    void onlyTrustsXMediaHosts() {
        assertThat(XMediaResolver.isXMediaHost("https://video.twimg.com/a.mp4")).isTrue();
        assertThat(XMediaResolver.isXMediaHost("https://pbs.twimg.com/media/a.jpg")).isTrue();
        assertThat(XMediaResolver.isXMediaHost("http://video.twimg.com/a.mp4")).isFalse();
        assertThat(XMediaResolver.isXMediaHost("https://twimg.com.evil.com/a.mp4")).isFalse();
        assertThat(XMediaResolver.isXMediaHost("not a url")).isFalse();
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
