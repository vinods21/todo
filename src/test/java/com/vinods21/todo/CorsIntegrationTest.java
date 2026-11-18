package com.vinods21.todo;

import com.vinods21.todo.support.PostgresTestcontainersConfiguration;
import com.vinods21.todo.support.RealHttp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-7-AC-14: CORS against the running application (real servlet container and filter chain), complementing
 * the MockMvc-only {@code CorsConfigTest} (SCRUM-2-AC-15, SCRUM-6-AC-04). Default allowed origin
 * {@code http://localhost:5173} (the Vite dev server, SCRUM-1-AC-14 / SCRUM-7-AC-21).
 */
@Tag("SCRUM-7")
@DisplayName("SCRUM-7 CORS against the running application")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestcontainersConfiguration.class)
class CorsIntegrationTest {

    private static final String DEV_ORIGIN = "http://localhost:5173";
    private static final String FOREIGN_ORIGIN = "http://evil.test";

    @LocalServerPort
    private int port;

    private RealHttp http;

    @BeforeEach
    void setUp() {
        http = new RealHttp(port);
    }

    static Stream<Arguments> pathsAndMethods() {
        return Stream.of("/api/tasks", "/api/tasks/1", "/api/tasks/1/status")
                .flatMap(path -> Stream.of("GET", "POST", "PUT", "PATCH", "DELETE")
                        .map(method -> Arguments.of(path, method)));
    }

    private ResponseEntity<String> preflight(String path, String origin, String method) {
        return http.exchange(HttpMethod.OPTIONS, path, null, null, Map.of(
                HttpHeaders.ORIGIN, origin,
                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method,
                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"));
    }

    @ParameterizedTest(name = "SCRUM-7-AC-14: preflight {1} {0} from the dev origin is accepted")
    @MethodSource("pathsAndMethods")
    @DisplayName("SCRUM-7-AC-14: preflights from http://localhost:5173 are accepted for every path × method")
    void preflightFromDevOriginAccepted(String path, String method) {
        ResponseEntity<String> response = preflight(path, DEV_ORIGIN, method);

        assertThat(response.getStatusCode().value()).as("%s %s", method, path).isEqualTo(200);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(DEV_ORIGIN);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS)).contains(method);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS))
                .containsIgnoringCase("content-type");
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_MAX_AGE)).isEqualTo("3600");
    }

    @Test
    @DisplayName("SCRUM-7-AC-14: an actual GET from the dev origin carries Access-Control-Allow-Origin and Vary: Origin")
    void actualGetFromDevOrigin() {
        ResponseEntity<String> response =
                http.exchange(HttpMethod.GET, "/api/tasks", null, null, Map.of(HttpHeaders.ORIGIN, DEV_ORIGIN));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(DEV_ORIGIN);
        assertThat(String.join(",", response.getHeaders().getOrEmpty(HttpHeaders.VARY))).contains("Origin");
    }

    @Test
    @DisplayName("SCRUM-7-AC-14: an actual POST from the dev origin returns 201 and exposes Location")
    void actualPostFromDevOriginExposesLocation() {
        ResponseEntity<String> response = http.exchange(HttpMethod.POST, "/api/tasks",
                MediaType.APPLICATION_JSON_VALUE, "{\"title\": \"SCRUM-7 CORS\"}", Map.of(HttpHeaders.ORIGIN, DEV_ORIGIN));

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(DEV_ORIGIN);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS)).contains("Location");
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION)).isNotBlank();
    }

    @Test
    @DisplayName("SCRUM-7-AC-14: preflights from a non-allowed origin are rejected with 403 and no Access-Control-Allow-Origin")
    void preflightFromForeignOriginRejected() {
        Map<String, String> preflights = Map.of("/api/tasks", "POST", "/api/tasks/1/status", "PATCH");
        preflights.forEach((path, method) -> {
            ResponseEntity<String> response = preflight(path, FOREIGN_ORIGIN, method);

            assertThat(response.getStatusCode().value()).as("%s %s", method, path).isEqualTo(403);
            assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).as(path).isNull();
        });
    }

    @Test
    @DisplayName("SCRUM-7-AC-14: an actual GET from a non-allowed origin is rejected with 403 and no Access-Control-Allow-Origin")
    void actualGetFromForeignOriginRejected() {
        ResponseEntity<String> response =
                http.exchange(HttpMethod.GET, "/api/tasks", null, null, Map.of(HttpHeaders.ORIGIN, FOREIGN_ORIGIN));

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
    }

    @Test
    @DisplayName("SCRUM-7-AC-14: a request without Origin (same-origin / via the nginx proxy) is not subject to CORS")
    void requestWithoutOrigin() {
        ResponseEntity<String> response = http.get("/api/tasks");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
    }
}
