package com.vinods21.todo.support;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * SCRUM-12 (design §4.5, ADR 0017): the generator-backed contract tests share exactly one Spring context and one
 * PostgreSQL container (SCRUM-12-NFR-06). Profile {@code openapi} turns springdoc on
 * ({@code src/test/resources/application-openapi.yml}); every other test context keeps it off.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Tag("SCRUM-12")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("openapi")
@Import(PostgresTestcontainersConfiguration.class)
public @interface OpenApiIntegrationTest {
}
