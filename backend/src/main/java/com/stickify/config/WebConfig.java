package com.stickify.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.stickify.web.RateLimitInterceptor;

@Configuration
@EnableConfigurationProperties({StickerProperties.class, WhatsAppProperties.class})
public class WebConfig implements WebMvcConfigurer {

    private final StickerProperties properties;

    public WebConfig(StickerProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(properties.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("Content-Disposition", "X-Sticker-Bytes", "X-Sticker-Mode", "X-Sticker-Quality")
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RateLimitInterceptor(properties.rateLimitRequests(), properties.rateLimitWindow()))
                .addPathPatterns("/api/stickers/**", "/api/media/**", "/api/handoff");
    }
}
