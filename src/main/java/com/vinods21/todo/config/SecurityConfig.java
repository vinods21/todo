package com.vinods21.todo.config;

import com.vinods21.todo.web.security.ApiErrorAccessDeniedHandler;
import com.vinods21.todo.web.security.ApiErrorAuthenticationEntryPoint;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.authentication.AuthenticationEntryPointFailureHandler;
import org.springframework.security.web.SecurityFilterChain;

import java.util.List;

/**
 * SCRUM-13 (ADR 0018 §4, design §5.3): the backend is a stateless OAuth2 resource server.
 * <ul>
 *   <li>SCRUM-13-AC-18: JWT signature (RS256, JWKS), {@code typ}, {@code iss}, {@code aud ∋ todo-api} come from the
 *       Boot properties {@code spring.security.oauth2.resourceserver.jwt.*}; {@code exp}/{@code nbf} use the clock skew
 *       of {@link AuthProperties} (this bean replaces Spring's 60 s default).</li>
 *   <li>SCRUM-13-AC-19: every {@code /api/**} operation needs the realm role {@code todo-user}; {@code GET /api/me}
 *       only authentication (AC-21); {@code /actuator/health/**} and {@code /actuator/info} stay public; CORS
 *       preflights pass without a token; everything else needs authentication, so anonymous callers cannot enumerate
 *       endpoints (AC-20).</li>
 *   <li>Stateless: no HTTP session, no request cache. CSRF protection is off because the API accepts bearer tokens
 *       only — a browser never attaches them automatically, so a cross-site request cannot ride on a session.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {

    static final String JWT_PROPERTIES = "spring.security.oauth2.resourceserver.jwt";

    /** SCRUM-13-NFR-06: missing issuer, JWKS URL or audience fails the start instead of weakening validation. */
    public SecurityConfig(Environment environment) {
        Binder binder = Binder.get(environment);
        requireText(binder, JWT_PROPERTIES + ".issuer-uri");
        requireText(binder, JWT_PROPERTIES + ".jwk-set-uri");
        List<String> audiences = binder.bind(JWT_PROPERTIES + ".audiences", Bindable.listOf(String.class))
                .orElse(List.of());
        if (audiences.isEmpty() || audiences.stream().anyMatch(audience -> audience == null || audience.isBlank())) {
            throw new IllegalStateException(JWT_PROPERTIES + ".audiences must name the backend audience (SCRUM-13-AC-18)");
        }
    }

    private static void requireText(Binder binder, String name) {
        String value = binder.bind(name, String.class).orElse("");
        if (value.isBlank()) {
            throw new IllegalStateException(name + " must be set (SCRUM-13-NFR-06)");
        }
    }

    @Bean
    SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, ApiErrorAuthenticationEntryPoint entryPoint,
            ApiErrorAccessDeniedHandler accessDeniedHandler) throws Exception {
        http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.OPTIONS, "/api/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/error")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/me").authenticated()
                        .requestMatchers("/api/**").hasRole("todo-user")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                        .withObjectPostProcessor(failClosedOnKeySourceErrors(entryPoint)))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(AbstractHttpConfigurer::disable)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults()) // WebConfig's MVC CORS mappings (no CorsConfigurationSource bean)
                // nginx (frontend image, ADR 0011) owns the security headers; Spring Security's defaults would duplicate
                // them on proxied responses ("nosniff, nosniff", a doubled X-Frame-Options browsers may ignore — CI run
                // 45669506278) and change the API's headers for authorised callers (SCRUM-13-NFR-11).
                .headers(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);
        return http.build();
    }

    /**
     * SCRUM-13-NFR-06: if the JWKS cannot be fetched (Keycloak down), Spring raises an
     * {@code AuthenticationServiceException}, which the default failure handler rethrows (→ a 500 outside the ApiError
     * contract). Here it goes to the entry point instead: 401 {@code invalid_token} with the ApiError body — the token is
     * never accepted.
     */
    private static ObjectPostProcessor<BearerTokenAuthenticationFilter> failClosedOnKeySourceErrors(
            ApiErrorAuthenticationEntryPoint entryPoint) {
        return new ObjectPostProcessor<>() {
            @Override
            public <O extends BearerTokenAuthenticationFilter> O postProcess(O filter) {
                AuthenticationEntryPointFailureHandler failureHandler = new AuthenticationEntryPointFailureHandler(
                        entryPoint);
                failureHandler.setRethrowAuthenticationServiceException(false);
                filter.setAuthenticationFailureHandler(failureHandler);
                return filter;
            }
        };
    }

    /** SCRUM-13-AC-18: exp/nbf with the configured skew (Spring's JwtValidators add their 60 s one only if none). */
    @Bean
    OAuth2TokenValidator<Jwt> jwtTimestampValidator(AuthProperties properties) {
        return new JwtTimestampValidator(properties.clockSkew());
    }
}
