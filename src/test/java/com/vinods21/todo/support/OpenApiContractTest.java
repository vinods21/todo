package com.vinods21.todo.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-12-AC-13 (design §4.5 (4)): the backend conformance checker rejects what it must reject — proven without
 * Spring, against the committed {@code api/openapi.yaml}.
 */
@Tag("SCRUM-12")
@DisplayName("SCRUM-12 OpenAPI conformance checker")
class OpenApiContractTest {

    private static final OpenApiContract CONTRACT = OpenApiContract.load(OpenApiDocuments.COMMITTED);

    private static final String VALID_TASK = """
            {"id":1,"title":"Write docs","description":null,"status":"TODO",\
            "createdAt":"2026-11-22T10:15:30.123456Z","dueDate":null}""";

    private static HttpHeaders json() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private static List<String> getTask(int status, String body) {
        return CONTRACT.violations(HttpMethod.GET, "/api/tasks/1", status, json(), body);
    }

    @Test
    @DisplayName("SCRUM-12-AC-03: a valid TaskResponse with status 200 conforms")
    void validResponseConforms() {
        assertThat(getTask(200, VALID_TASK)).isEmpty();
        assertThat(getTask(200, VALID_TASK.replace("\"description\":null", "\"description\":\"text\"")
                .replace("\"dueDate\":null", "\"dueDate\":\"2026-12-01\""))).isEmpty();
        assertThat(CONTRACT.operationId(HttpMethod.GET, "/api/tasks/1?x=y")).isEqualTo("getTask");
        assertThat(CONTRACT.operationId(HttpMethod.PATCH, "http://localhost:8080/api/tasks/7/status"))
                .isEqualTo("updateTaskStatus");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an undocumented property is rejected")
    void undocumentedPropertyRejected() {
        List<String> violations = getTask(200, VALID_TASK.replace("{", "{\"extra\":1,"));

        assertThat(violations).singleElement().asString()
                .startsWith("GET /api/tasks/{id} (getTask) 200: schema TaskResponse: ")
                .contains("extra");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: a missing required property is rejected")
    void missingRequiredPropertyRejected() {
        List<String> violations = getTask(200, VALID_TASK.replace(",\"dueDate\":null", ""));

        assertThat(violations).singleElement().asString().contains("TaskResponse").contains("dueDate");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: a wrong type is rejected (id as string)")
    void wrongTypeRejected() {
        List<String> violations = getTask(200, VALID_TASK.replace("\"id\":1", "\"id\":\"1\""));

        assertThat(violations).singleElement().asString().contains("/id");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an undocumented enum value is rejected")
    void unknownEnumRejected() {
        List<String> violations = getTask(200, VALID_TASK.replace("\"TODO\"", "\"NOPE\""));

        assertThat(violations).isNotEmpty().allMatch(v -> v.contains("/status"));
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: a null in a non-nullable property is rejected")
    void nullInNonNullablePropertyRejected() {
        List<String> violations = getTask(200, VALID_TASK.replace("\"title\":\"Write docs\"", "\"title\":null"));

        assertThat(violations).isNotEmpty().allMatch(v -> v.contains("/title"));
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an undocumented status is rejected")
    void undocumentedStatusRejected() {
        assertThat(getTask(418, VALID_TASK)).singleElement().asString()
                .isEqualTo("GET /api/tasks/{id} (getTask) 418: undocumented status 418 (documented: 200, 400, 404, 500)");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an unknown operation is rejected")
    void unknownOperationRejected() {
        assertThat(CONTRACT.violations(HttpMethod.GET, "/api/nope", 404, json(), "{}"))
                .containsExactly("undocumented operation GET /api/nope");
        assertThat(CONTRACT.violations(HttpMethod.DELETE, "/api/tasks", 405, json(), "{}"))
                .containsExactly("undocumented operation DELETE /api/tasks");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an undocumented Content-Type is rejected")
    void undocumentedContentTypeRejected() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.TEXT_PLAIN);

        assertThat(CONTRACT.violations(HttpMethod.GET, "/api/tasks/1", 200, headers, VALID_TASK)).singleElement()
                .asString().contains("undocumented Content-Type text/plain");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: a body on 204 is rejected")
    void bodyOnNoContentRejected() {
        assertThat(CONTRACT.violations(HttpMethod.DELETE, "/api/tasks/1", 204, new HttpHeaders(), null)).isEmpty();
        assertThat(CONTRACT.violations(HttpMethod.DELETE, "/api/tasks/1", 204, json(), "{}")).singleElement()
                .asString().contains("undocumented response body");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: 201 without the required Location header is rejected")
    void missingLocationRejected() {
        HttpHeaders withLocation = json();
        withLocation.set(HttpHeaders.LOCATION, "http://localhost/api/tasks/1");

        assertThat(CONTRACT.violations(HttpMethod.POST, "/api/tasks", 201, withLocation, VALID_TASK)).isEmpty();
        assertThat(CONTRACT.violations(HttpMethod.POST, "/api/tasks", 201, json(), VALID_TASK)).singleElement()
                .asString().contains("missing required header Location");
    }

    @Test
    @DisplayName("SCRUM-12-AC-13: an error body must be a complete ApiError")
    void incompleteApiErrorRejected() {
        String apiError = """
                {"timestamp":"2026-11-22T10:15:30.123Z","status":404,"error":"Not Found",\
                "message":"Task with id 1 not found","path":"/api/tasks/1","fieldErrors":[]}""";

        assertThat(getTask(404, apiError)).isEmpty();
        assertThat(getTask(404, apiError.replace(",\"fieldErrors\":[]", ""))).singleElement().asString()
                .contains("ApiError").contains("fieldErrors");
        assertThat(getTask(404, "not json")).singleElement().asString().contains("body is not valid JSON");
    }

    @Test
    @DisplayName("SCRUM-12-AC-04: a document with a default response is rejected")
    void defaultResponseRejected() {
        JsonNode document = OpenApiDocuments.readYaml(OpenApiDocuments.COMMITTED);
        ObjectNode responses = (ObjectNode) document.path("paths").path("/api/tasks/{id}").path("get").path("responses");
        responses.set("default", responses.get("404"));

        OpenApiContract tampered = new OpenApiContract(document);

        assertThat(tampered.documentProblems()).singleElement().asString().contains("'default' responses are not supported");
        assertThat(tampered.violations(HttpMethod.GET, "/api/tasks/1", 200, json(), VALID_TASK))
                .anyMatch(v -> v.startsWith("document: ") && v.contains("default"));
        assertThat(CONTRACT.documentProblems()).isEmpty();
    }
}
