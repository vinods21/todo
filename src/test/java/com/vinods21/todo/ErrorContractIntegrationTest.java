package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import com.vinods21.todo.support.AuthTestConfiguration;
import com.vinods21.todo.support.PostgresTestcontainersConfiguration;
import com.vinods21.todo.support.RealHttp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static com.vinods21.todo.support.RealHttp.assertApiError;
import static com.vinods21.todo.support.RealHttp.assertApiErrorShape;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-7-AC-13: the running application (real Tomcat, real filter chain, PostgreSQL 16) answers every error with
 * the standard {@code ApiError} body (ADR 0003) — never Boot's default {@code /error} shape, HTML or a stack trace.
 * Closes the gap left by the {@code @WebMvcTest}-only SCRUM-2-AC-13 tests. Not repeated here (already over real
 * HTTP in {@code TaskStatusIntegrationTest}): PATCH status 400/404, {@code ?status=} 400.
 */
@Tag("SCRUM-7")
@DisplayName("SCRUM-7 error contract over real HTTP")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestcontainersConfiguration.class, AuthTestConfiguration.class}) // SCRUM-13: in-test JWT issuer
class ErrorContractIntegrationTest {

    @LocalServerPort
    private int port;

    private RealHttp http;

    @BeforeEach
    void setUp() {
        http = new RealHttp(port);
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: blank title returns 400 Validation failed with fieldErrors")
    void blankTitle() {
        ResponseEntity<String> response = http.postJson("/api/tasks", "{\"title\": \"  \"}");

        assertApiError(response, 400, "Validation failed", "/api/tasks");
        assertThat(JsonPath.<String>read(response.getBody(), "$.fieldErrors[0].field")).isEqualTo("title");
        assertThat(JsonPath.<String>read(response.getBody(), "$.fieldErrors[0].message")).isEqualTo("must not be blank");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: malformed JSON returns 400 Malformed JSON request")
    void malformedJson() {
        assertApiError(http.postJson("/api/tasks", "{\"title\":"), 400, "Malformed JSON request", "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unknown status value on create returns 400 Invalid value for field 'status'")
    void unknownStatusOnCreate() {
        ResponseEntity<String> response = http.postJson("/api/tasks", "{\"title\": \"x\", \"status\": \"NOPE\"}");

        assertApiError(response, 400, "Invalid value for field 'status'", "/api/tasks");
        assertThat(JsonPath.<String>read(response.getBody(), "$.fieldErrors[0].field")).isEqualTo("status");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: non-numeric id returns 400 Invalid value for parameter 'id'")
    void nonNumericId() {
        assertApiError(http.get("/api/tasks/abc"), 400, "Invalid value for parameter 'id'", "/api/tasks/abc");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unknown id returns 404 Task with id … not found")
    void unknownId() {
        assertApiError(http.get("/api/tasks/999999"), 404, "Task with id 999999 not found", "/api/tasks/999999");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unknown route under /api returns 404 with the ApiError body, not Boot's /error shape")
    void unknownApiRoute() {
        assertApiError(http.get("/api/nope"), 404, "No endpoint GET /api/nope", "/api/nope");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unknown route outside /api returns 404 with the ApiError body")
    void unknownRootRoute() {
        assertApiError(http.get("/nope"), 404, "No endpoint GET /nope", "/nope");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unsupported method PATCH on /api/tasks/{id} returns 405 with an Allow header")
    void unsupportedMethodOnItem() {
        long id = http.createTask("SCRUM-7 405 target");
        String path = "/api/tasks/" + id;

        ResponseEntity<String> response = http.exchange(HttpMethod.PATCH, path, MediaType.APPLICATION_JSON_VALUE,
                "{\"title\": \"x\"}", Map.of());

        assertApiError(response, 405, "Request method 'PATCH' is not supported", path);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ALLOW)).isNotBlank().contains("PUT");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unsupported method DELETE on /api/tasks returns 405")
    void unsupportedMethodOnCollection() {
        ResponseEntity<String> response = http.exchange(HttpMethod.DELETE, "/api/tasks", null, null, Map.of());

        assertApiError(response, 405, "Request method 'DELETE' is not supported", "/api/tasks");
        assertThat(response.getHeaders().getFirst(HttpHeaders.ALLOW)).isNotBlank();
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: unsupported media type text/plain returns 415")
    void unsupportedMediaType() {
        ResponseEntity<String> response = http.exchange(HttpMethod.POST, "/api/tasks", MediaType.TEXT_PLAIN_VALUE,
                "title=x", Map.of());

        assertApiErrorShape(response, 415, "/api/tasks");
        assertThat(JsonPath.<String>read(response.getBody(), "$.message"))
                .startsWith("Content type 'text/plain")
                .endsWith("' is not supported");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: negative page returns 400 Validation failed with fieldErrors[0].field page")
    void negativePage() {
        ResponseEntity<String> response = http.get("/api/tasks?page=-1");

        assertApiError(response, 400, "Validation failed", "/api/tasks");
        assertThat(JsonPath.<String>read(response.getBody(), "$.fieldErrors[0].field")).isEqualTo("page");
    }

    @Test
    @DisplayName("SCRUM-7-AC-13: size 0 returns 400 Validation failed with fieldErrors[0].field size")
    void zeroSize() {
        ResponseEntity<String> response = http.get("/api/tasks?size=0");

        assertApiError(response, 400, "Validation failed", "/api/tasks");
        assertThat(JsonPath.<String>read(response.getBody(), "$.fieldErrors[0].field")).isEqualTo("size");
    }
}
