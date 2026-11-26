package com.vinods21.todo.config;

import com.vinods21.todo.web.error.GlobalExceptionHandler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.InsufficientAuthenticationException;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** SCRUM-13-AC-18, NFR-06 (design §5.2): misconfiguration fails the start instead of weakening validation. */
@Tag("SCRUM-13")
@DisplayName("SCRUM-13 authentication configuration fails closed")
class AuthConfigurationTest {

    private static final String JWT = "spring.security.oauth2.resourceserver.jwt.";

    private static MockEnvironment complete() {
        return new MockEnvironment()
                .withProperty(JWT + "issuer-uri", "http://localhost:8180/realms/todo")
                .withProperty(JWT + "jwk-set-uri", "http://keycloak:8080/realms/todo/protocol/openid-connect/certs")
                .withProperty(JWT + "audiences[0]", "todo-api");
    }

    @Test
    @DisplayName("SCRUM-13-NFR-06: issuer, JWKS URL and audience set → SecurityConfig starts")
    void completeConfiguration() {
        assertThatCode(() -> new SecurityConfig(complete())).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("SCRUM-13-NFR-06: a blank issuer, JWKS URL or audience fails the start")
    void blankValuesFail() {
        for (String property : List.of("issuer-uri", "jwk-set-uri", "audiences[0]")) {
            MockEnvironment environment = complete().withProperty(JWT + property, " ");
            assertThatThrownBy(() -> new SecurityConfig(environment)).as(property)
                    .isInstanceOf(IllegalStateException.class);
        }
        MockEnvironment noAudience = new MockEnvironment()
                .withProperty(JWT + "issuer-uri", "http://localhost:8180/realms/todo")
                .withProperty(JWT + "jwk-set-uri", "http://localhost:8180/certs");
        assertThatThrownBy(() -> new SecurityConfig(noAudience)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: the clock skew must be between 0 and 60 s; roles must not be empty")
    void authPropertiesValidation() {
        AuthProperties ok = new AuthProperties(Duration.ofSeconds(30), List.of(" todo-user ", "todo-admin", ""));
        assertThat(ok.roles()).containsExactly("todo-user", "todo-admin");
        assertThatCode(() -> new AuthProperties(Duration.ofSeconds(60), List.of("todo-user")))
                .doesNotThrowAnyException();

        assertThatThrownBy(() -> new AuthProperties(Duration.ofSeconds(61), List.of("todo-user")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AuthProperties(Duration.ofSeconds(-1), List.of("todo-user")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AuthProperties(null, List.of("todo-user")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AuthProperties(Duration.ofSeconds(30), List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AuthProperties(Duration.ofSeconds(30), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("SCRUM-13-AC-20: security exceptions raised in MVC are rethrown to the filter chain, not mapped to 500")
    void securityExceptionsAreRethrown() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        AccessDeniedException denied = new AccessDeniedException("denied");
        InsufficientAuthenticationException anonymous = new InsufficientAuthenticationException("anonymous");

        assertThatThrownBy(() -> handler.rethrowSecurityException(denied)).isSameAs(denied);
        assertThatThrownBy(() -> handler.rethrowSecurityException(anonymous)).isSameAs(anonymous);
    }
}
