package com.vinods21.todo.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * CORS settings bound from {@code app.cors.*} / env var {@code APP_CORS_ALLOWED_ORIGINS}
 * (comma-separated) — SCRUM-2-AC-15, SCRUM-2-NFR-05.
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null
                ? List.of()
                : allowedOrigins.stream().map(String::strip).filter(origin -> !origin.isEmpty()).toList();
    }
}
