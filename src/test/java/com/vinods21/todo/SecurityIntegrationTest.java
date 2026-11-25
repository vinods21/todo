package com.vinods21.todo;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.JOSEObjectType;
import com.vinods21.todo.support.AuthTestConfiguration;
import com.vinods21.todo.support.PostgresTestcontainersConfiguration;
import com.vinods21.todo.support.RealHttp;
import com.vinods21.todo.support.TestJwtIssuer;
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

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static com.vinods21.todo.support.RealHttp.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * SCRUM-13-AC-18..AC-23, NFR-02, NFR-06 (design §5, §13.2): the resource server against the running application (real
 * Tomcat and filter chain, PostgreSQL 16) with tokens minted by {@link TestJwtIssuer} — no Keycloak. Same imports as
 * the other real-HTTP tests, so it shares their cached context (clock skew 30 s, the default).
 */
@Tag("SCRUM-13")
@DisplayName("SCRUM-13 JWT resource server over real HTTP")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestcontainersConfiguration.class, AuthTestConfiguration.class})
class SecurityIntegrationTest {

    private static final String DEV_ORIGIN = "http://localhost:5173";
    private static final String TASK_BODY = "{\"title\": \"SCRUM-13 security\"}";
    private static final String FULL_BODY = "{\"title\":\"x\",\"description\":null,\"status\":\"DONE\",\"dueDate\":null}";

    @LocalServerPort
    private int port;

    private RealHttp anonymous;
    private RealHttp user;

    @BeforeEach
    void setUp() {
        anonymous = RealHttp.anonymous(port);
        user = new RealHttp(port);
    }

    private ResponseEntity<String> getTasksWith(String token) {
        return anonymous.exchange(HttpMethod.GET, "/api/tasks", null, null,
                Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + token));
    }

    private static String wwwAuthenticate(ResponseEntity<String> response) {
        return response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE);
    }

    private static void assertInvalidToken(ResponseEntity<String> response, String path) {
        assertApiError(response, 401, "Invalid or expired access token", path);
        assertThat(wwwAuthenticate(response)).startsWith("Bearer ").contains("error=\"invalid_token\"");
        assertThat(response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).as("stateless: no cookie").isEmpty();
    }

    /** Every Task operation with a request that would succeed for a user with the role. */
    static Stream<Arguments> taskOperations() {
        return Stream.of(
                Arguments.of("createTask", HttpMethod.POST, "/api/tasks", TASK_BODY),
                Arguments.of("listTasks", HttpMethod.GET, "/api/tasks", null),
                Arguments.of("getTask", HttpMethod.GET, "/api/tasks/{id}", null),
                Arguments.of("updateTask", HttpMethod.PUT, "/api/tasks/{id}", FULL_BODY),
                Arguments.of("updateTaskStatus", HttpMethod.PATCH, "/api/tasks/{id}/status", "{\"status\":\"DONE\"}"),
                Arguments.of("deleteTask", HttpMethod.DELETE, "/api/tasks/{id}", null));
    }

    // ------------------------------------------------------------------------------------------------ AC-19 matrix

    @ParameterizedTest(name = "SCRUM-13-AC-19: {0} without a token → 401, with a token without role → 403, with role → 2xx")
    @MethodSource("taskOperations")
    @DisplayName("SCRUM-13-AC-19, SCRUM-13-AC-20: every Task operation requires authentication and the role todo-user")
    void everyTaskOperationRequiresTheRole(String operation, HttpMethod method, String template, String body) {
        long id = user.createTask("SCRUM-13 " + operation);
        String path = template.replace("{id}", Long.toString(id));
        String contentType = body == null ? null : MediaType.APPLICATION_JSON_VALUE;

        ResponseEntity<String> missing = anonymous.exchange(method, path, contentType, body, Map.of());
        assertApiError(missing, 401, "Authentication required", path);
        assertThat(wwwAuthenticate(missing)).as(operation).startsWith("Bearer").doesNotContain("error=");

        ResponseEntity<String> noRole = anonymous.exchange(method, path, contentType, body,
                Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtIssuer.noRoleToken()));
        assertApiError(noRole, 403, "Access denied", path);
        assertThat(wwwAuthenticate(noRole)).as(operation).startsWith("Bearer ").contains("error=\"insufficient_scope\"");

        ResponseEntity<String> allowed = user.exchange(method, path, contentType, body, Map.of());
        assertThat(allowed.getStatusCode().is2xxSuccessful()).as("%s with role: %s", operation, allowed.getBody())
                .isTrue();
    }

    // ------------------------------------------------------------------------------------- AC-18 token validation

    @Test
    @DisplayName("SCRUM-13-AC-18: a valid token (RS256, published kid, issuer, audience, role) → 200")
    void validToken() {
        ResponseEntity<String> response = getTasksWith(TestJwtIssuer.userToken());

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).as("stateless: no cookie").isEmpty();
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a malformed token → 401 invalid_token")
    void malformedToken() {
        assertInvalidToken(getTasksWith("not-a-jwt"), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: an expired token → 401 invalid_token")
    void expiredToken() {
        String token = TestJwtIssuer.token().issuedAgo(Duration.ofMinutes(10)).lifetime(Duration.ofMinutes(5)).build();

        assertInvalidToken(getTasksWith(token), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: clock skew 30 s — expired 10 s ago is accepted, expired 45 s ago is rejected")
    void clockSkewBoundary() {
        String withinSkew = TestJwtIssuer.token().issuedAgo(Duration.ofSeconds(310)).lifetime(Duration.ofMinutes(5))
                .build();
        String beyondSkew = TestJwtIssuer.token().issuedAgo(Duration.ofSeconds(345)).lifetime(Duration.ofMinutes(5))
                .build();

        assertThat(getTasksWith(withinSkew).getStatusCode().value()).isEqualTo(200);
        assertInvalidToken(getTasksWith(beyondSkew), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a token not yet valid (nbf in 10 minutes) → 401 invalid_token")
    void notYetValidToken() {
        String token = TestJwtIssuer.token().notBefore(Instant.now().plus(Duration.ofMinutes(10))).build();

        assertInvalidToken(getTasksWith(token), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a bad signature (other key, published kid) → 401 invalid_token")
    void badSignature() {
        assertInvalidToken(getTasksWith(TestJwtIssuer.token().badSignature().build()), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: an unknown kid (re-fetched JWKS does not contain it) → 401 invalid_token")
    void unknownKeyId() {
        int before = TestJwtIssuer.jwksRequests();

        assertInvalidToken(getTasksWith(TestJwtIssuer.token().unknownKeyId().build()), "/api/tasks");
        assertThat(TestJwtIssuer.jwksRequests()).as("JWKS re-fetched for the unknown kid").isGreaterThan(before);
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a wrong issuer → 401 invalid_token")
    void wrongIssuer() {
        String token = TestJwtIssuer.token().issuer("http://localhost:8180/realms/mock-idp").build();

        assertInvalidToken(getTasksWith(token), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a wrong audience (e.g. a token for the account console) → 401 invalid_token")
    void wrongAudience() {
        assertInvalidToken(getTasksWith(TestJwtIssuer.token().audiences("account").build()), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: an unsigned token (alg none) → 401 invalid_token")
    void unsignedToken() {
        assertInvalidToken(getTasksWith(TestJwtIssuer.unsignedToken()), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-AC-18: a token with typ other than JWT (at+jwt) → 401 invalid_token")
    void wrongType() {
        String token = TestJwtIssuer.token().type(new JOSEObjectType("at+jwt")).build();

        assertInvalidToken(getTasksWith(token), "/api/tasks");
    }

    @Test
    @DisplayName("SCRUM-13-NFR-06: JWKS unreachable (Keycloak down) and an uncached kid → 401 invalid_token, never accepted")
    void jwksUnavailableFailsClosed() {
        TestJwtIssuer.setAvailable(false);
        try {
            assertInvalidToken(getTasksWith(TestJwtIssuer.token().freshKeyId().build()), "/api/tasks");
        } finally {
            TestJwtIssuer.setAvailable(true);
        }
        assertThat(getTasksWith(TestJwtIssuer.userToken()).getStatusCode().value()).as("recovers").isEqualTo(200);
    }

    // ------------------------------------------------------------------------------------------- AC-19, AC-20 misc

    @Test
    @DisplayName("SCRUM-13-AC-20: anonymous requests to unknown paths get 401, not 404 (no endpoint enumeration)")
    void anonymousUnknownPaths() {
        for (String path : List.of("/api/nope", "/nope", "/actuator/env")) {
            ResponseEntity<String> response = anonymous.get(path);

            assertApiError(response, 401, "Authentication required", path);
            assertThat(wwwAuthenticate(response)).as(path).startsWith("Bearer");
        }
    }

    @Test
    @DisplayName("SCRUM-13-AC-19: /actuator/health and /actuator/info stay public")
    void actuatorPublic() {
        ResponseEntity<String> health = anonymous.get("/actuator/health");
        ResponseEntity<String> info = anonymous.get("/actuator/info");

        assertThat(health.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(health.getBody(), "$.status")).isEqualTo("UP");
        assertThat(info.getStatusCode().value()).isEqualTo(200);
        assertThat(health.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).isEmpty();
    }

    @Test
    @DisplayName("SCRUM-13-AC-19: a CORS preflight from the dev origin succeeds without a token (Authorization allowed)")
    void preflightWithoutToken() {
        ResponseEntity<String> response = anonymous.exchange(HttpMethod.OPTIONS, "/api/tasks", null, null, Map.of(
                HttpHeaders.ORIGIN, DEV_ORIGIN,
                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST",
                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(DEV_ORIGIN);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS))
                .containsIgnoringCase("authorization");
    }

    @Test
    @DisplayName("SCRUM-13-AC-19, SCRUM-13-AC-20: a cross-origin 401 from the dev origin is readable by the SPA (CORS headers)")
    void crossOrigin401CarriesCorsHeaders() {
        ResponseEntity<String> response = anonymous.exchange(HttpMethod.GET, "/api/tasks", null, null,
                Map.of(HttpHeaders.ORIGIN, DEV_ORIGIN));

        assertApiError(response, 401, "Authentication required", "/api/tasks");
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo(DEV_ORIGIN);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS))
                .contains("WWW-Authenticate");
    }

    @Test
    @DisplayName("SCRUM-13-AC-19: stateless — no session cookie on success or failure, even when the client sends one")
    void stateless() {
        List<ResponseEntity<String>> responses = List.of(
                user.exchange(HttpMethod.GET, "/api/tasks", null, null, Map.of(HttpHeaders.COOKIE, "JSESSIONID=abc")),
                user.postJson("/api/tasks", TASK_BODY),
                anonymous.get("/api/tasks"),
                getTasksWith("not-a-jwt"));

        for (ResponseEntity<String> response : responses) {
            assertThat(response.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)).as("Set-Cookie on %s",
                    response.getStatusCode()).isEmpty();
        }
    }

    // ----------------------------------------------------------------------------------------- AC-21, AC-22 /api/me

    @Test
    @DisplayName("SCRUM-13-AC-21, SCRUM-13-AC-22: /api/me returns subject, preferred_username, e-mail, name and the application roles only")
    void meReturnsClaims() {
        String token = TestJwtIssuer.token().subject("3f1c5a8e-0000-4000-8000-000000000001").username("bob")
                .email("bob@corp.example").name("Bob Admin")
                .roles("todo-user", "todo-admin", "offline_access", "uma_authorization", "default-roles-todo")
                .build();

        ResponseEntity<String> response = anonymous.exchange(HttpMethod.GET, "/api/me", null, null,
                Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        String body = response.getBody();
        assertThat(JsonPath.<Map<String, Object>>read(body, "$").keySet())
                .containsExactlyInAnyOrder("subject", "username", "email", "name", "roles");
        assertThat(JsonPath.<String>read(body, "$.subject")).isEqualTo("3f1c5a8e-0000-4000-8000-000000000001");
        assertThat(JsonPath.<String>read(body, "$.username")).isEqualTo("bob");
        assertThat(JsonPath.<String>read(body, "$.email")).isEqualTo("bob@corp.example");
        assertThat(JsonPath.<String>read(body, "$.name")).isEqualTo("Bob Admin");
        assertThat(JsonPath.<List<String>>read(body, "$.roles")).containsExactly("todo-admin", "todo-user");
    }

    @Test
    @DisplayName("SCRUM-13-AC-21, SCRUM-13-AC-22: /api/me without realm_access → roles [] (no error); the role is not required")
    void meWithoutRoles() {
        ResponseEntity<String> response = anonymous.exchange(HttpMethod.GET, "/api/me", null, null,
                Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + TestJwtIssuer.noRoleToken()));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(response.getBody(), "$.username")).isEqualTo("carol");
        assertThat(JsonPath.<List<String>>read(response.getBody(), "$.roles")).isEmpty();
    }

    @Test
    @DisplayName("SCRUM-13-AC-21: /api/me for a service account (no e-mail, no name) → email and name null")
    void meServiceAccount() {
        String token = TestJwtIssuer.token().username("service-account-todo-e2e").email(null).name(null)
                .roles("todo-user").build();

        ResponseEntity<String> response = anonymous.exchange(HttpMethod.GET, "/api/me", null, null,
                Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + token));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(JsonPath.<String>read(response.getBody(), "$.username")).isEqualTo("service-account-todo-e2e");
        assertThat(JsonPath.<Object>read(response.getBody(), "$.email")).isNull();
        assertThat(JsonPath.<Object>read(response.getBody(), "$.name")).isNull();
        assertThat(JsonPath.<List<String>>read(response.getBody(), "$.roles")).containsExactly("todo-user");
    }

    @Test
    @DisplayName("SCRUM-13-AC-21: /api/me without a token → 401")
    void meAnonymous() {
        ResponseEntity<String> response = anonymous.get("/api/me");

        assertApiError(response, 401, "Authentication required", "/api/me");
        assertThat(wwwAuthenticate(response)).startsWith("Bearer");
    }
}
