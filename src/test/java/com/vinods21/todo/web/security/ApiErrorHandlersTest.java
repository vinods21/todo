package com.vinods21.todo.web.security;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** SCRUM-13-AC-20 (design §5.4): 401/403 bodies and RFC 6750 headers, unit level. */
@Tag("SCRUM-13")
@DisplayName("SCRUM-13 ApiError entry point and access-denied handler")
class ApiErrorHandlersTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> API_ERROR_KEYS =
            List.of("timestamp", "status", "error", "message", "path", "fieldErrors");

    private static MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.setRequestURI("/api/tasks");
        return request;
    }

    private static MockHttpServletResponse commence(AuthenticationException exception) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ApiErrorAuthenticationEntryPoint(JSON).commence(request(), response, exception);
        return response;
    }

    private static void assertBody(MockHttpServletResponse response, int status, String error, String message)
            throws Exception {
        assertThat(response.getStatus()).isEqualTo(status);
        assertThat(response.getContentType()).startsWith("application/json");
        String body = response.getContentAsString();
        Map<String, Object> json = JsonPath.read(body, "$");
        assertThat(json.keySet()).containsExactlyInAnyOrderElementsOf(API_ERROR_KEYS);
        assertThat(JsonPath.<Integer>read(body, "$.status")).isEqualTo(status);
        assertThat(JsonPath.<String>read(body, "$.error")).isEqualTo(error);
        assertThat(JsonPath.<String>read(body, "$.message")).isEqualTo(message);
        assertThat(JsonPath.<String>read(body, "$.path")).isEqualTo("/api/tasks");
        assertThat(JsonPath.<List<Object>>read(body, "$.fieldErrors")).isEmpty();
        assertThat(body).doesNotContain("Exception").doesNotContain("Jwt");
    }

    @Test
    @DisplayName("SCRUM-13-AC-20: no token → 401 Authentication required, WWW-Authenticate Bearer without error")
    void missingToken() throws Exception {
        MockHttpServletResponse response = commence(new InsufficientAuthenticationException("Full authentication"));

        assertBody(response, 401, "Unauthorized", "Authentication required");
        assertThat(response.getHeader(HttpHeaders.WWW_AUTHENTICATE)).startsWith("Bearer").doesNotContain("error=");
    }

    @Test
    @DisplayName("SCRUM-13-AC-20: rejected token → 401 Invalid or expired access token, error=\"invalid_token\"")
    void invalidToken() throws Exception {
        MockHttpServletResponse response = commence(new InvalidBearerTokenException("Jwt expired at 2026-01-01"));

        assertBody(response, 401, "Unauthorized", "Invalid or expired access token");
        assertThat(response.getHeader(HttpHeaders.WWW_AUTHENTICATE)).startsWith("Bearer ")
                .contains("error=\"invalid_token\"");
    }

    @Test
    @DisplayName("SCRUM-13-NFR-06: key source failure → 401 invalid_token (fail closed), not a 500")
    void keySourceFailure() throws Exception {
        MockHttpServletResponse response = commence(new AuthenticationServiceException("JWKS unreachable"));

        assertBody(response, 401, "Unauthorized", "Invalid or expired access token");
        assertThat(response.getHeader(HttpHeaders.WWW_AUTHENTICATE)).contains("error=\"invalid_token\"");
    }

    @Test
    @DisplayName("SCRUM-13-AC-20: access denied → 403 Access denied with a Bearer challenge")
    void accessDenied() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ApiErrorAccessDeniedHandler(JSON).handle(request(), response, new AccessDeniedException("Access Denied"));

        assertBody(response, 403, "Forbidden", "Access denied");
        assertThat(response.getHeader(HttpHeaders.WWW_AUTHENTICATE)).startsWith("Bearer");
    }

    @Test
    @DisplayName("SCRUM-13-AC-20: a committed response is left alone")
    void committedResponse() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setCommitted(true);
        new ApiErrorAccessDeniedHandler(JSON).handle(request(), response, new AccessDeniedException("Access Denied"));

        assertThat(response.getContentAsString()).isEmpty();
    }
}
