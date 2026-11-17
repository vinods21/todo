package com.vinods21.todo.web.error;

/**
 * One invalid field in an {@link ApiError} (SCRUM-2-AC-13).
 */
public record FieldErrorItem(String field, String message) {
}
