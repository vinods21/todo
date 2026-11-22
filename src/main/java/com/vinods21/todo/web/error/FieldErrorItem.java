package com.vinods21.todo.web.error;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One invalid field in an {@link ApiError} (SCRUM-2-AC-13).
 */
public record FieldErrorItem(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String field, @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message) {
}
