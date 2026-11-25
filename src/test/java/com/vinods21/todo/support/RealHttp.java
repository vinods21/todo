package com.vinods21.todo.support;

import com.jayway.jsonpath.JsonPath;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-7 (design §7.1): real HTTP client for {@code RANDOM_PORT} tests that never throws on 4xx/5xx.
 * <p>
 * Uses the JDK {@code HttpClient}, which sends {@code Origin} and {@code Access-Control-Request-*} headers as given
 * ({@code HttpURLConnection}, i.e. {@code SimpleClientHttpRequestFactory}, silently drops some of them).
 */
public final class RealHttp {

    /** ADR 0003: the exact set of top-level keys of every error body. */
    public static final List<String> API_ERROR_KEYS =
            List.of("timestamp", "status", "error", "message", "path", "fieldErrors");

    private static final List<String> LEAK_MARKERS =
            List.of("Exception", "trace", "org.springframework", "java.", "at com.");

    private final RestClient client;
    private final String bearerToken;

    /** SCRUM-13: authenticated as alice with role todo-user (TestJwtIssuer) — the default for behaviour tests. */
    public RealHttp(int port) {
        this(port, TestJwtIssuer.userToken());
    }

    /** SCRUM-13: every request carries {@code Authorization: Bearer <bearerToken>}; null = anonymous. */
    public RealHttp(int port, String bearerToken) {
        this.client = RestClient.builder()
                .baseUrl("http://localhost:" + port)
                .requestFactory(new JdkClientHttpRequestFactory())
                .build();
        this.bearerToken = bearerToken;
    }

    /** SCRUM-13: no Authorization header at all. */
    public static RealHttp anonymous(int port) {
        return new RealHttp(port, null);
    }

    public ResponseEntity<String> exchange(HttpMethod method, String uri, String contentType, String body,
            Map<String, String> headers) {
        RestClient.RequestBodySpec spec = client.method(method).uri(uri);
        // Like the SPA's API client (ADR 0006): JSON accepted, English messages.
        spec = spec.header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.ACCEPT_LANGUAGE, "en");
        if (bearerToken != null && !headers.containsKey(HttpHeaders.AUTHORIZATION)) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
        }
        for (Map.Entry<String, String> header : headers.entrySet()) {
            spec = spec.header(header.getKey(), header.getValue());
        }
        if (contentType != null) {
            spec = spec.header(HttpHeaders.CONTENT_TYPE, contentType);
        }
        if (body != null) {
            spec = spec.body(body);
        }
        return spec.retrieve()
                .onStatus(status -> true, (request, response) -> { })
                .toEntity(String.class);
    }

    public ResponseEntity<String> get(String uri) {
        return exchange(HttpMethod.GET, uri, null, null, Map.of());
    }

    public ResponseEntity<String> postJson(String uri, String json) {
        return exchange(HttpMethod.POST, uri, MediaType.APPLICATION_JSON_VALUE, json, Map.of());
    }

    /** Creates a task and returns its id (asserts 201). */
    public long createTask(String title) {
        ResponseEntity<String> created = postJson("/api/tasks", "{\"title\": \"" + title + "\"}");
        assertThat(created.getStatusCode().value()).as("create %s", title).isEqualTo(201);
        return JsonPath.<Number>read(created.getBody(), "$.id").longValue();
    }

    /**
     * ADR 0003 shape: status code, JSON content type, exactly the six keys, consistent values, and no
     * implementation details in the raw body (SCRUM-2-AC-13, AC-14).
     */
    public static void assertApiError(ResponseEntity<String> response, int status, String message, String path) {
        assertApiErrorShape(response, status, path);
        assertThat(JsonPath.<String>read(response.getBody(), "$.message")).isEqualTo(message);
    }

    /** As {@link #assertApiError} but without checking the message (callers assert it themselves). */
    public static void assertApiErrorShape(ResponseEntity<String> response, int status, String path) {
        assertThat(response.getStatusCode().value()).as("status of %s", path).isEqualTo(status);
        MediaType contentType = response.getHeaders().getContentType();
        assertThat(contentType).as("content type of %s", path).isNotNull();
        assertThat(contentType.getType()).isEqualTo("application");
        assertThat(contentType.getSubtype()).as("plain JSON, not problem+json or HTML").isEqualTo("json");
        String body = response.getBody();
        assertThat(body).isNotBlank();
        Map<String, Object> json = JsonPath.read(body, "$");
        assertThat(json.keySet()).containsExactlyInAnyOrderElementsOf(API_ERROR_KEYS);
        assertThat(JsonPath.<Integer>read(body, "$.status")).isEqualTo(status);
        HttpStatus resolved = HttpStatus.resolve(status);
        assertThat(resolved).isNotNull();
        assertThat(JsonPath.<String>read(body, "$.error")).isEqualTo(resolved.getReasonPhrase());
        assertThat(JsonPath.<String>read(body, "$.path")).isEqualTo(path);
        assertThat(JsonPath.<String>read(body, "$.timestamp")).isNotBlank();
        assertThat(JsonPath.<List<Object>>read(body, "$.fieldErrors")).isNotNull();
        for (String marker : LEAK_MARKERS) {
            assertThat(body).as("no implementation detail '%s' in %s", marker, body).doesNotContain(marker);
        }
    }
}
