package com.stickify.web;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.web.servlet.HandlerInterceptor;

import com.stickify.exception.TooManyRequestsException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Fixed-window rate limiter keyed by client IP. Good enough for a single instance;
 * swap for a shared store if the API is ever scaled horizontally.
 */
public class RateLimitInterceptor implements HandlerInterceptor {

    private final int limit;
    private final Duration window;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitInterceptor(int limit, Duration window) {
        this.limit = limit;
        this.window = window;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        Instant now = Instant.now();
        Window current = windows.compute(clientKey(request), (key, existing) ->
                existing == null || existing.startedAt().plus(window).isBefore(now)
                        ? new Window(now, 1)
                        : new Window(existing.startedAt(), existing.count() + 1));

        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> e.getValue().startedAt().plus(window).isBefore(now));
        }

        if (current.count() > limit) {
            long retryAfter = Duration.between(now, current.startedAt().plus(window)).toSeconds();
            response.setHeader("Retry-After", String.valueOf(Math.max(retryAfter, 1)));
            throw new TooManyRequestsException(
                    "Too many stickers in a short time. Try again in about " + Math.max(retryAfter / 60, 1) + " min.");
        }
        return true;
    }

    private static String clientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private record Window(Instant startedAt, int count) {
    }
}
