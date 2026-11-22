package com.vinods21.todo.web.error;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

/**
 * Standard error body for every error response (SCRUM-2-AC-13, ADR 0003). {@code fieldErrors} is always
 * present (empty when the error is not a validation failure).
 */
@Schema(description = "Standard error body of every error response (ADR 0003)")
public record ApiError(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant timestamp,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "HTTP reason phrase") String error,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String path,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                description = "Invalid fields; empty when the error is not a validation failure")
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
