package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import com.vinods21.todo.support.AuthTestConfiguration;
import com.vinods21.todo.support.PostgresTestcontainersConfiguration;
import com.vinods21.todo.support.RealHttp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static com.vinods21.todo.support.RealHttp.assertApiErrorShape;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-7-AC-15: against the running application only the {@code health} and {@code info} actuator endpoints are
 * reachable — relevant now that the backend port is published from a container (SCRUM-7-AC-12).
 */
@Tag("SCRUM-7")
@DisplayName("SCRUM-7 actuator exposure over real HTTP")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestcontainersConfiguration.class, AuthTestConfiguration.class}) // SCRUM-13: in-test JWT issuer
class ActuatorExposureIntegrationTest {

    @LocalServerPort
    private int port;

    private RealHttp http;

    @BeforeEach
    void setUp() {
        http = new RealHttp(port);
    }

    @Test
    @DisplayName("SCRUM-7-AC-15: /actuator/health returns 200 UP without components or details")
    void healthUpWithoutDetails() {
        ResponseEntity<String> response = http.get("/actuator/health");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> json = JsonPath.read(response.getBody(), "$");
        assertThat(json).containsEntry("status", "UP").doesNotContainKeys("components", "details");
    }

    @Test
    @DisplayName("SCRUM-7-AC-15: /actuator/info returns 200 with the build identity")
    void infoExposed() {
        ResponseEntity<String> response = http.get("/actuator/info");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(response.getBody(), "$.build.jira")).matches("SCRUM-\\d+|main|NONE|UNKNOWN");
    }

    @Test
    @DisplayName("SCRUM-7-AC-15: the /actuator discovery page links only self, health and info")
    void discoveryListsOnlyHealthAndInfo() {
        ResponseEntity<String> response = http.get("/actuator");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> links = JsonPath.read(response.getBody(), "$._links");
        assertThat(links.keySet()).contains("health", "info").isSubsetOf("self", "health", "health-path", "info");
    }

    @ParameterizedTest(name = "SCRUM-7-AC-15: GET /actuator/{0} returns 404")
    @ValueSource(strings = {"env", "beans", "configprops", "mappings", "metrics", "loggers", "heapdump", "threaddump",
            "conditions", "scheduledtasks", "shutdown"})
    @DisplayName("SCRUM-7-AC-15: sensitive actuator endpoints are not exposed (404 with the ApiError body)")
    void sensitiveEndpointsNotExposed(String endpoint) {
        String path = "/actuator/" + endpoint;

        assertApiErrorShape(http.get(path), 404, path);
    }

    @Test
    @DisplayName("SCRUM-7-AC-15: POST /actuator/shutdown returns 404")
    void shutdownNotExposed() {
        ResponseEntity<String> response = http.exchange(HttpMethod.POST, "/actuator/shutdown", null, null, Map.of());

        assertApiErrorShape(response, 404, "/actuator/shutdown");
    }
}
