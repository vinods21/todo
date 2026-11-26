package com.vinods21.todo.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;

/**
 * SCRUM-13-AC-23 (design §6.2): points the backend's resource server at the in-test issuer ({@link TestJwtIssuer}) —
 * issuer {@value TestJwtIssuer#ISSUER}, JWKS on a random loopback port. Every {@code @SpringBootTest} imports it next
 * to {@link PostgresTestcontainersConfiguration} (same imports → same cached context). The JWKS is fetched lazily by
 * the first authenticated request, so the context also proves "no start-up dependency on Keycloak" (NFR-06).
 */
@TestConfiguration(proxyBeanMethods = false)
public class AuthTestConfiguration {

    @Bean
    static DynamicPropertyRegistrar testJwtIssuerProperties() {
        return registry -> {
            registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> TestJwtIssuer.ISSUER);
            registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", TestJwtIssuer::jwkSetUri);
        };
    }
}
