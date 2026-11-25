package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import com.vinods21.todo.support.AuthTestConfiguration;
import com.vinods21.todo.support.TestJwtIssuer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-6 end-to-end against a real PostgreSQL 16 (Testcontainers): status changes via
 * {@code PATCH /api/tasks/{id}/status} persist and are reflected by {@code GET /api/tasks?status=} (SCRUM-6-AC-17),
 * plus the database side of AC-01..AC-03, AC-05, AC-07 and the Flyway V2 index (SCRUM-6-NFR-02).
 */
@Tag("SCRUM-6")
@DisplayName("SCRUM-6 task status persistence and filtering (PostgreSQL 16 via Testcontainers)")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@Import(AuthTestConfiguration.class) // SCRUM-13: in-test JWT issuer; requests authenticate as alice (todo-user)
class TaskStatusIntegrationTest {

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
        // Boot 4 / Spring 7 RestClient defaults to the JDK HttpClient request factory, which supports PATCH.
        client = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtIssuer.userToken()) // SCRUM-13
                .build();
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

    private long create(String json) {
        ResponseEntity<String> created = call(HttpMethod.POST, "/api/tasks", json);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        return JsonPath.<Number>read(created.getBody(), "$.id").longValue();
    }

    private ResponseEntity<String> patchStatus(long id, String status) {
        return call(HttpMethod.PATCH, "/api/tasks/" + id + "/status", "{\"status\": \"" + status + "\"}");
    }

    private String storedStatus(long id) {
        return jdbcTemplate.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, id);
    }

    private List<Number> idsFor(String query) {
        ResponseEntity<String> response = call(HttpMethod.GET, "/api/tasks?" + query, null);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return JsonPath.read(response.getBody(), "$.items[*].id");
    }

    private static List<Long> longs(List<Number> numbers) {
        return numbers.stream().map(Number::longValue).toList();
    }

    @Test
    @DisplayName("SCRUM-6-AC-17, SCRUM-6-AC-01: a PATCHed status persists, other fields are unchanged and the status filter reflects it")
    void patchedStatusPersistsAndIsFiltered() {
        ResponseEntity<String> created = call(HttpMethod.POST, "/api/tasks", """
                {"title": "Persist me", "description": "keep this", "status": "TODO", "dueDate": "2026-12-24"}
                """);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        long id = JsonPath.<Number>read(created.getBody(), "$.id").longValue();
        String createdAt = JsonPath.read(created.getBody(), "$.createdAt");

        ResponseEntity<String> patched = call(HttpMethod.PATCH, "/api/tasks/" + id + "/status", """
                {"status": "IN_PROGRESS", "title": "ignored", "description": "ignored too"}
                """);
        assertThat(patched.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<Number>read(patched.getBody(), "$.id").longValue()).isEqualTo(id);
        assertThat(JsonPath.<String>read(patched.getBody(), "$.status")).isEqualTo("IN_PROGRESS");
        assertThat(JsonPath.<String>read(patched.getBody(), "$.title")).isEqualTo("Persist me");
        assertThat(JsonPath.<String>read(patched.getBody(), "$.description")).isEqualTo("keep this");
        assertThat(JsonPath.<String>read(patched.getBody(), "$.dueDate")).isEqualTo("2026-12-24");
        assertThat(JsonPath.<String>read(patched.getBody(), "$.createdAt")).isEqualTo(createdAt);

        ResponseEntity<String> fetched = call(HttpMethod.GET, "/api/tasks/" + id, null);
        assertThat(fetched.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.status")).isEqualTo("IN_PROGRESS");
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.title")).isEqualTo("Persist me");
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.description")).isEqualTo("keep this");
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.dueDate")).isEqualTo("2026-12-24");
        assertThat(JsonPath.<String>read(fetched.getBody(), "$.createdAt")).isEqualTo(createdAt);
        assertThat(storedStatus(id)).isEqualTo("IN_PROGRESS");

        assertThat(longs(idsFor("status=IN_PROGRESS"))).containsExactly(id);
        assertThat(idsFor("status=TODO")).isEmpty();
    }

    @Test
    @DisplayName("SCRUM-6-AC-02: reopening DONE -> TODO and setting the same status again both return 200 against PostgreSQL")
    void backwardsAndSameTransitionsAllowed() {
        long id = create("{\"title\": \"Reopen\", \"status\": \"DONE\"}");

        ResponseEntity<String> reopened = patchStatus(id, "TODO");
        assertThat(reopened.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(reopened.getBody(), "$.status")).isEqualTo("TODO");
        assertThat(storedStatus(id)).isEqualTo("TODO");

        ResponseEntity<String> same = patchStatus(id, "TODO");
        assertThat(same.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(same.getBody(), "$.status")).isEqualTo("TODO");
        assertThat(storedStatus(id)).isEqualTo("TODO");
    }

    @Test
    @DisplayName("SCRUM-6-AC-03: an invalid status returns 400 and leaves the stored row unchanged; an unknown id returns 404")
    void invalidPatchLeavesRowUnchanged() {
        long id = create("{\"title\": \"Untouched\", \"status\": \"IN_PROGRESS\"}");

        ResponseEntity<String> invalid = patchStatus(id, "done");
        assertThat(invalid.getStatusCode().value()).isEqualTo(400);
        assertThat(JsonPath.<String>read(invalid.getBody(), "$.message")).isEqualTo("Invalid value for field 'status'");
        assertThat(storedStatus(id)).isEqualTo("IN_PROGRESS");

        ResponseEntity<String> missing = call(HttpMethod.PATCH, "/api/tasks/" + id + "/status", "{}");
        assertThat(missing.getStatusCode().value()).isEqualTo(400);
        assertThat(storedStatus(id)).isEqualTo("IN_PROGRESS");

        ResponseEntity<String> unknown = patchStatus(id + 1000, "DONE");
        assertThat(unknown.getStatusCode().value()).isEqualTo(404);
        assertThat(JsonPath.<Integer>read(unknown.getBody(), "$.status")).isEqualTo(404);
    }

    @Test
    @DisplayName("SCRUM-6-AC-05: the status filter pages over the filtered set in PostgreSQL, newest first")
    void filterPagesOverFilteredSet() {
        long done1 = create("{\"title\": \"done 1\", \"status\": \"DONE\"}");
        create("{\"title\": \"todo\", \"status\": \"TODO\"}");
        long done2 = create("{\"title\": \"done 2\", \"status\": \"DONE\"}");
        create("{\"title\": \"in progress\", \"status\": \"IN_PROGRESS\"}");
        long done3 = create("{\"title\": \"done 3\", \"status\": \"DONE\"}");

        ResponseEntity<String> page0 = call(HttpMethod.GET, "/api/tasks?status=DONE&size=2", null);
        assertThat(page0.getStatusCode().value()).isEqualTo(200);
        assertThat(longs(JsonPath.read(page0.getBody(), "$.items[*].id"))).containsExactly(done3, done2);
        assertThat(JsonPath.<List<String>>read(page0.getBody(), "$.items[*].status")).containsOnly("DONE");
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.page")).isEqualTo(0);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.size")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.totalElements")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(page0.getBody(), "$.totalPages")).isEqualTo(2);

        assertThat(longs(idsFor("status=DONE&size=2&page=1"))).containsExactly(done1);
        assertThat(idsFor("status=IN_PROGRESS")).hasSize(1);
        assertThat(idsFor("")).hasSize(5);
    }

    @Test
    @DisplayName("SCRUM-6-AC-07: wrong-case and repeated status filters return 400 through the full stack")
    void invalidFilterReturns400() {
        for (String query : List.of("status=done", "status=TODO&status=DONE", "status=")) {
            ResponseEntity<String> response = call(HttpMethod.GET, "/api/tasks?" + query, null);
            assertThat(response.getStatusCode().value()).as(query).isEqualTo(400);
            assertThat(JsonPath.<String>read(response.getBody(), "$.message")).as(query)
                    .isEqualTo("Invalid value for parameter 'status'");
            assertThat(JsonPath.<List<Object>>read(response.getBody(), "$.fieldErrors")).as(query).isEmpty();
        }
    }

    @Test
    @DisplayName("SCRUM-6-NFR-02: Flyway V2 was applied and created the (status, created_at, id) index")
    void flywayV2CreatedStatusIndex() {
        Integer v2 = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version = '2' AND success", Integer.class);
        Integer index = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM pg_indexes WHERE tablename = 'tasks' AND indexname = 'ix_tasks_status_created_at_id'",
                Integer.class);

        assertThat(v2).isEqualTo(1);
        assertThat(index).isEqualTo(1);
    }
}
