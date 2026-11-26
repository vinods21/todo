package com.vinods21.todo.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

/**
 * SCRUM-13 (ADR 0018 §4, design §5.2): authentication settings bound from {@code app.auth.*}.
 * <ul>
 *   <li>{@code clockSkew} ({@code APP_AUTH_CLOCK_SKEW}, default 30 s): tolerance for {@code exp}/{@code nbf}
 *       (SCRUM-13-AC-18), at most 60 s;</li>
 *   <li>{@code roles}: the application realm roles {@code GET /api/me} reports (SCRUM-13-AC-21); Keycloak's default
 *       roles are never reported.</li>
 * </ul>
 * Fail closed (SCRUM-13-NFR-06): invalid values make binding — and therefore the application start — fail.
 */
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(Duration clockSkew, List<String> roles) {

    /** SCRUM-13-AC-18: "explicit, documented clock skew (≤ 60 s)". */
    public static final Duration MAX_CLOCK_SKEW = Duration.ofSeconds(60);

    public AuthProperties {
        if (clockSkew == null || clockSkew.isNegative() || clockSkew.compareTo(MAX_CLOCK_SKEW) > 0) {
            throw new IllegalArgumentException("app.auth.clock-skew must be between 0s and 60s, was " + clockSkew);
        }
        roles = roles == null ? List.of()
                : roles.stream().map(String::strip).filter(role -> !role.isEmpty()).distinct().toList();
        if (roles.isEmpty()) {
            throw new IllegalArgumentException("app.auth.roles must name at least one application role");
        }
    }
}
