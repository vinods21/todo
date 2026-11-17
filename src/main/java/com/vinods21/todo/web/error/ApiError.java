package com.vinods21.todo.web.error;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

/**
 * Standard error body for every error response (SCRUM-2-AC-13, ADR 0003). {@code fieldErrors} is always
 * present (empty when the error is not a validation failure).
 */
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<FieldErrorItem> fieldErrors) {

    public ApiError {
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public static ApiError of(HttpStatusCode statusCode, String message, String path, List<FieldErrorItem> fieldErrors) {
        HttpStatus resolved = HttpStatus.resolve(statusCode.value());
        String reason = resolved != null ? resolved.getReasonPhrase() : "Error";
        return new ApiError(Instant.now(), statusCode.value(), reason, message, path, fieldErrors);
    }
}
