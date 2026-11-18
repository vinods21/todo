package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end tests against a real PostgreSQL 16 (Testcontainers) — SCRUM-2-NFR-03; no H2.
 */
@Tag("SCRUM-2")
@DisplayName("SCRUM-2 application integration (PostgreSQL 16 via Testcontainers)")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class TodoApplicationIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RestClient client;

    @BeforeEach
    void setUp() {
        client = RestClient.create("http://localhost:" + port);
        jdbcTemplate.update("DELETE FROM tasks");
    }

    private ResponseEntity<String> call(HttpMethod method, String uri, String json) {
        RestClient.RequestBodySpec spec = client.method(method).uri(uri);
        if (json != null) {
            spec = spec.contentType(MediaType.APPLICATION_JSON).body(json);
        }
        return spec.retrieve()
                .onStatus(status -> true, (request, response) -> { })
                .toEntity(String.class);
    }

    private static String pathOf(ResponseEntity<?> response) {
        String location = response.getHeaders().getFirst(HttpHeaders.LOCATION);
        assertThat(location).isNotNull();
        return URI.create(location).getPath();
    }

    @Test
    @DisplayName("SCRUM-2-AC-01: application starts against PostgreSQL and Flyway V1 creates the tasks table")
    void flywayCreatedTasksTable() {
        Integer tables = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks'",
                Integer.class);
        Integer migrations = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version = '1' AND success",
                Integer.class);

        assertThat(tables).isEqualTo(1);
        assertThat(migrations).isEqualTo(1);
    }

    @Test
    @DisplayName("SCRUM-2-AC-02: /actuator/health returns 200 with status UP when the database is reachable")
    void healthIsUp() {
        ResponseEntity<String> response = call(HttpMethod.GET, "/actuator/health", null);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(response.getBody(), "$.status")).isEqualTo("UP");
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-2-NFR-06, SCRUM-6-NFR-07: /actuator/info build.jira equals the Jira key the build was made for (ADR 0008)")
    void infoCarriesJiraKey() {
        ResponseEntity<String> response = call(HttpMethod.GET, "/actuator/info", null);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        String jira = JsonPath.read(response.getBody(), "$.build.jira");
        assertThat(jira).matches("SCRUM-\\d+|main|NONE|UNKNOWN");
        // Set by Maven Surefire from ${jira.issue} (CI: -Djira.issue=<key derived from the branch>; local: UNKNOWN).
        String expected = System.getProperty("build.jira.expected");
        if (expected != null) {
            assertThat(jira).isEqualTo(expected);
        }
    }

    @Test
    @Tag("SCRUM-8")
    @DisplayName("SCRUM-8-AC-04: /actuator/info build.version equals the version the build was stamped with")
    void infoCarriesBuildVersion() {
        ResponseEntity<String> response = call(HttpMethod.GET, "/actuator/info", null);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        String version = JsonPath.read(response.getBody(), "$.build.version");
        // Release X.Y.Z, build version X.Y.Z-<id> (ADR 0013) or the local placeholder 0.0.0-SNAPSHOT.
        assertThat(version).matches("^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z-.]+)?$");
        // Set by Maven Surefire from ${project.version} (CI: -Drevision=<build version>; local: 0.0.0-SNAPSHOT).
        String expected = System.getProperty("build.version.expected");
        if (expected != null) {
            assertThat(version).isEqualTo(expected);
        }
    }

    @Test
    @DisplayName("SCRUM-2-AC-03, SCRUM-2-AC-04, SCRUM-2-AC-06, SCRUM-2-AC-07, SCRUM-2-AC-08: CRUD round-trip against PostgreSQL")
    void crudRoundTrip() {
        // AC-03: create
        ResponseEntity<String> created = call(HttpMethod.POST, "/api/tasks", """
                {"title": "  Integration task  ", "description": "via PostgreSQL", "dueDate": "2026-12-01"}
                """);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String path = pathOf(created);
        Number id = JsonPath.read(created.getBody(), "$.id");
        String createdAt = JsonPath.read(created.getBody(), "$.createdAt");
        assertThat(path).isEqualTo("/api/tasks/" + id.longValue());
        assertThat(JsonPath.<String>read(created.getBody(), "$.title")).isEqualTo("Integration task");
        assertThat(JsonPath.<String>read(created.getBody(), "$.status")).isEqualTo("TODO");

        // AC-04: read back; createdAt round-trips through timestamptz unchanged
        ResponseEntity<String> fetched = call(HttpMethod.GET, path, null);
        assertThat(fetched.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.createdAt")).isEqualTo(createdAt);
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.dueDate")).isEqualTo("2026-12-01");

        // AC-06: full update; id and createdAt from the client are ignored
        ResponseEntity<String> updated = call(HttpMethod.PUT, path, """
                {"id": 12345, "createdAt": "2000-01-01T00:00:00Z", "title": "Updated",
                 "description": null, "status": "DONE", "dueDate": null}
                """);
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<Number>read(updated.getBody(), "$.id").longValue()).isEqualTo(id.longValue());
        assertThat(JsonPath.<String>read(updated.getBody(), "$.createdAt")).isEqualTo(createdAt);
        assertThat(JsonPath.<String>read(updated.getBody(), "$.status")).isEqualTo("DONE");
        assertThat(JsonPath.<Object>read(updated.getBody(), "$.dueDate")).isNull();

        // AC-07: delete, then 404 (AC-08)
        assertThat(call(HttpMethod.DELETE, path, null).getStatusCode().value()).isEqualTo(204);
        ResponseEntity<String> afterDelete = call(HttpMethod.GET, path, null);
        assertThat(afterDelete.getStatusCode().value()).isEqualTo(404);
        assertThat(JsonPath.<Integer>read(afterDelete.getBody(), "$.status")).isEqualTo(404);
    }

    @Test
    @DisplayName("SCRUM-2-AC-05: list against PostgreSQL is empty initially, then newest first with paging metadata")
    void listNewestFirst() {
        ResponseEntity<String> empty = call(HttpMethod.GET, "/api/tasks", null);
        assertThat(empty.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<List<Object>>read(empty.getBody(), "$.items")).isEmpty();
        assertThat(JsonPath.<Integer>read(empty.getBody(), "$.totalElements")).isEqualTo(0);

        call(HttpMethod.POST, "/api/tasks", "{\"title\": \"first\"}");
        call(HttpMethod.POST, "/api/tasks", "{\"title\": \"second\"}");
        call(HttpMethod.POST, "/api/tasks", "{\"title\": \"third\"}");

        ResponseEntity<String> page0 = call(HttpMethod.GET, "/api/tasks?page=0&size=2", null);
        assertThat(page0.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<List<String>>read(page0.getBody(), "$.items[*].title")).containsExactly("third", "second");
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.page")).isEqualTo(0);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.size")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.totalElements")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.totalPages")).isEqualTo(2);

        ResponseEntity<String> page1 = call(HttpMethod.GET, "/api/tasks?page=1&size=2", null);
        assertThat(JsonPath.<List<String>>read(page1.getBody(), "$.items[*].title")).containsExactly("first");
    }
}
