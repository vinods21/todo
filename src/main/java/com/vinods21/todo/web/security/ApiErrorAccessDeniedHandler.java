package com.vinods21.todo.web.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;

/**
 * SCRUM-13-AC-19, AC-20 (design §5.4): 403 for a valid token without the application role. Spring's
 * {@link BearerTokenAccessDeniedHandler} sets the status and {@code WWW-Authenticate: Bearer error="insufficient_scope"};
 * the body is the ADR 0003 {@code ApiError}.
 */
@Component
public class ApiErrorAccessDeniedHandler implements AccessDeniedHandler {

    static final String ACCESS_DENIED = "Access denied";

    private final BearerTokenAccessDeniedHandler delegate = new BearerTokenAccessDeniedHandler();
    private final JsonMapper jsonMapper;

    public ApiErrorAccessDeniedHandler(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        delegate.handle(request, response, accessDeniedException);
        ApiErrorResponses.write(jsonMapper, request, response, HttpStatus.FORBIDDEN, ACCESS_DENIED);
    }
}
