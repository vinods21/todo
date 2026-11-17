package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Starts the real application twice against the same PostgreSQL 16 container (SCRUM-2-AC-09). The database is
 * configured through the {@code DB_URL}/{@code DB_USERNAME}/{@code DB_PASSWORD} placeholders used by
 * application.yml, exercising the env-var configuration path (SCRUM-2-AC-01, SCRUM-2-NFR-05). They are passed as
 * default properties, so real environment variables of the same name (if set) would take precedence.
 */
@Tag("SCRUM-2")
@DisplayName("SCRUM-2 persistence across application restart")
@Testcontainers
class TaskPersistenceRestartTest {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    private static ConfigurableApplicationContext startApplication() {
        return new SpringApplicationBuilder(TodoApplication.class)
                .properties(
                        "DB_URL=" + postgres.getJdbcUrl(),
                        "DB_USERNAME=" + postgres.getUsername(),
                        "DB_PASSWORD=" + postgres.getPassword(),
                        "SERVER_PORT=0")
                .run();
    }

    private static RestClient clientFor(ConfigurableApplicationContext context) {
        String port = context.getEnvironment().getProperty("local.server.port");
        return RestClient.create("http://localhost:" + port);
    }

    @Test
    @DisplayName("SCRUM-2-AC-09, SCRUM-2-AC-01: a task created before a restart is returned after it; V1 is not re-applied")
    void taskSurvivesRestart() {
        String path;
        String createdAt;
        try (ConfigurableApplicationContext first = startApplication()) {
            ResponseEntity<String> created = clientFor(first).post()
                    .uri("/api/tasks")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("""
                            {"title": "Survive restart", "status": "IN_PROGRESS"}
                            """)
                    .retrieve()
                    .toEntity(String.class);
            assertThat(created.getStatusCode().value()).isEqualTo(201);
            String location = created.getHeaders().getFirst(HttpHeaders.LOCATION);
            assertThat(location).isNotNull();
            path = URI.create(location).getPath();
            createdAt = JsonPath.read(created.getBody(), "$.createdAt");
        }

        try (ConfigurableApplicationContext second = startApplication()) {
            ResponseEntity<String> fetched = clientFor(second).get()
                    .uri(path)
                    .retrieve()
                    .toEntity(String.class);
            assertThat(fetched.getStatusCode().value()).isEqualTo(200);
            assertThat(JsonPath.<String>read(fetched.getBody(), "$.title")).isEqualTo("Survive restart");
            assertThat(JsonPath.<String>read(fetched.getBody(), "$.status")).isEqualTo("IN_PROGRESS");
            assertThat(JsonPath.<String>read(fetched.getBody(), "$.createdAt")).isEqualTo(createdAt);

            Integer appliedMigrations = second.getBean(JdbcTemplate.class)
                    .queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class);
            assertThat(appliedMigrations).isEqualTo(1);
        }
    }
}
