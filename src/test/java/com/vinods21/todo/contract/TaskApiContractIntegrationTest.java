package com.vinods21.todo.contract;

import com.vinods21.todo.support.OpenApiContract;
import com.vinods21.todo.support.OpenApiDocuments;
import com.vinods21.todo.support.OpenApiIntegrationTest;
import com.vinods21.todo.support.RealHttp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-12-AC-03, AC-04 (design §4.5 (2), ADR 0017): representative requests over real HTTP (Tomcat, PostgreSQL 16
 * via Testcontainers); every response is validated against the <b>committed</b> {@code api/openapi.yaml}. Error
 * inputs mirror {@code ErrorContractIntegrationTest} / {@code TaskStatusIntegrationTest}. {@code {id}} in a URI is a
 * task created for the scenario.
 */
@OpenApiIntegrationTest
@Tag("SCRUM-12")
@DisplayName("SCRUM-12 Task API contract conformance over real HTTP")
class TaskApiContractIntegrationTest {

    static final OpenApiContract CONTRACT = OpenApiContract.load(OpenApiDocuments.COMMITTED);

    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;
    private static final String TEXT = MediaType.TEXT_PLAIN_VALUE;
    private static final String UNKNOWN = "/api/tasks/999999999";
    private static final String FULL_BODY =
            "{\"title\":\"SCRUM-12 updated\",\"description\":\"d\",\"status\":\"IN_PROGRESS\",\"dueDate\":null}";

    record Scenario(String name, String operationId, int status, HttpMethod method, String uriTemplate,
            String contentType, String body) {
        @Override
        public String toString() {
            return name;
        }
    }

    static final List<Scenario> SCENARIOS = List.of(
            // createTask: 201, 400, 415
            new Scenario("createTask 201 with all fields", "createTask", 201, HttpMethod.POST, "/api/tasks", JSON,
                    "{\"title\":\"SCRUM-12 created\",\"description\":null,\"status\":\"DONE\",\"dueDate\":\"2026-12-01\"}"),
            new Scenario("createTask 400 blank title", "createTask", 400, HttpMethod.POST, "/api/tasks", JSON,
                    "{\"title\":\"  \"}"),
            new Scenario("createTask 400 malformed JSON", "createTask", 400, HttpMethod.POST, "/api/tasks", JSON,
                    "{\"title\":"),
            new Scenario("createTask 400 unknown status value", "createTask", 400, HttpMethod.POST, "/api/tasks", JSON,
                    "{\"title\":\"x\",\"status\":\"NOPE\"}"),
            new Scenario("createTask 415 text/plain", "createTask", 415, HttpMethod.POST, "/api/tasks", TEXT,
                    "title=x"),
            // getTask: 200, 400, 404
            new Scenario("getTask 200", "getTask", 200, HttpMethod.GET, "/api/tasks/{id}", null, null),
            new Scenario("getTask 400 non-numeric id", "getTask", 400, HttpMethod.GET, "/api/tasks/abc", null, null),
            new Scenario("getTask 404 unknown id", "getTask", 404, HttpMethod.GET, UNKNOWN, null, null),
            // listTasks: 200, 400
            new Scenario("listTasks 200 without parameters", "listTasks", 200, HttpMethod.GET, "/api/tasks", null,
                    null),
            new Scenario("listTasks 200 clamped size and status filter", "listTasks", 200, HttpMethod.GET,
                    "/api/tasks?page=0&size=500&status=TODO", null, null),
            new Scenario("listTasks 400 negative page", "listTasks", 400, HttpMethod.GET, "/api/tasks?page=-1", null,
                    null),
            new Scenario("listTasks 400 size 0", "listTasks", 400, HttpMethod.GET, "/api/tasks?size=0", null, null),
            new Scenario("listTasks 400 wrong-case status", "listTasks", 400, HttpMethod.GET, "/api/tasks?status=done",
                    null, null),
            new Scenario("listTasks 400 non-numeric page", "listTasks", 400, HttpMethod.GET, "/api/tasks?page=abc",
                    null, null),
            // updateTask: 200, 400, 404, 415
            new Scenario("updateTask 200 full replacement", "updateTask", 200, HttpMethod.PUT, "/api/tasks/{id}", JSON,
                    FULL_BODY),
            new Scenario("updateTask 400 missing status", "updateTask", 400, HttpMethod.PUT, "/api/tasks/{id}", JSON,
                    "{\"title\":\"SCRUM-12 updated\"}"),
            new Scenario("updateTask 404 unknown id", "updateTask", 404, HttpMethod.PUT, UNKNOWN, JSON, FULL_BODY),
            new Scenario("updateTask 415 text/plain", "updateTask", 415, HttpMethod.PUT, "/api/tasks/{id}", TEXT,
                    "title=x"),
            // updateTaskStatus: 200, 400, 404, 415
            new Scenario("updateTaskStatus 200", "updateTaskStatus", 200, HttpMethod.PATCH, "/api/tasks/{id}/status",
                    JSON, "{\"status\":\"IN_PROGRESS\"}"),
            new Scenario("updateTaskStatus 400 wrong-case status", "updateTaskStatus", 400, HttpMethod.PATCH,
                    "/api/tasks/{id}/status", JSON, "{\"status\":\"done\"}"),
            new Scenario("updateTaskStatus 404 unknown id", "updateTaskStatus", 404, HttpMethod.PATCH,
                    UNKNOWN + "/status", JSON, "{\"status\":\"DONE\"}"),
            new Scenario("updateTaskStatus 415 text/plain", "updateTaskStatus", 415, HttpMethod.PATCH,
                    "/api/tasks/{id}/status", TEXT, "DONE"),
            // deleteTask: 204, 400, 404
            new Scenario("deleteTask 204", "deleteTask", 204, HttpMethod.DELETE, "/api/tasks/{id}", null, null),
            new Scenario("deleteTask 400 non-numeric id", "deleteTask", 400, HttpMethod.DELETE, "/api/tasks/abc", null,
                    null),
            new Scenario("deleteTask 404 unknown id", "deleteTask", 404, HttpMethod.DELETE, UNKNOWN, null, null));

    @LocalServerPort
    private int port;

    private RealHttp http;

    @BeforeEach
    void setUp() {
        http = new RealHttp(port);
    }

    static Stream<Scenario> scenarios() {
        return SCENARIOS.stream();
    }

    @ParameterizedTest(name = "SCRUM-12-AC-03: {0}")
    @MethodSource("scenarios")
    @DisplayName("SCRUM-12-AC-03: responses of the running application conform to api/openapi.yaml")
    void responseConformsToContract(Scenario scenario) {
        long id = http.createTask("SCRUM-12 contract " + scenario.name());
        String uri = scenario.uriTemplate().replace("{id}", Long.toString(id));

        ResponseEntity<String> response = http.exchange(scenario.method(), uri, scenario.contentType(), scenario.body(),
                Map.of());

        assertThat(response.getStatusCode().value()).as("status of %s: %s", scenario, response.getBody())
                .isEqualTo(scenario.status());
        CONTRACT.assertConforms(scenario.method(), uri, response);
        assertThat(CONTRACT.operationId(scenario.method(), uri)).as("operation of %s", scenario)
                .isEqualTo(scenario.operationId());
    }

    @Test
    @DisplayName("SCRUM-12-AC-04: every documented (operation, status) is exercised by a scenario; 500 exempt (A-03)")
    void everyDocumentedResponseIsExercised() {
        // A-03: 500 cannot be provoked over real HTTP; its ApiError body stays covered by TaskControllerTest (SCRUM-2-AC-14).
        Set<String> documented = new TreeSet<>(CONTRACT.documentedResponses());
        documented.removeIf(response -> response.endsWith(" 500"));
        Set<String> exercised = SCENARIOS.stream()
                .map(s -> s.operationId() + " " + s.status())
                .collect(Collectors.toCollection(TreeSet::new));

        assertThat(exercised).as("documented (operation, status) pairs without a scenario").containsAll(documented);
        assertThat(documented).as("scenario (operation, status) pairs not documented").containsAll(exercised);
        assertThat(CONTRACT.documentProblems()).as("constructs the checker cannot match exactly").isEmpty();
    }
}
