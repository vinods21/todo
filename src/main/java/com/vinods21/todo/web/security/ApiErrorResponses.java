package com.vinods21.todo.web.security;

import com.vinods21.todo.web.error.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * SCRUM-13-AC-20 (ADR 0003 as amended by ADR 0018): writes the standard {@link ApiError} body for responses produced
 * by the security filter chain (outside Spring MVC). Messages are fixed texts — never token content, claims or
 * exception messages.
 */
final class ApiErrorResponses {

    private ApiErrorResponses() {
    }

    static void write(JsonMapper jsonMapper, HttpServletRequest request, HttpServletResponse response,
            HttpStatus status, String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        ApiError body = ApiError.of(status, message, request.getRequestURI(), List.of());
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonMapper.writeValueAsString(body));
        response.getWriter().flush();
    }
}
