package com.vinods21.todo.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.vinods21.todo.domain.TaskStatus;
import jakarta.validation.constraints.NotNull;

/**
 * Body of {@code PATCH /api/tasks/{id}/status} (SCRUM-6-AC-01, ADR 0009). Unknown properties such as
 * {@code title} are ignored and never applied. {@code @JsonProperty} pins Jackson to a properties-based creator,
 * so a bare JSON string body ({@code "DONE"}) is rejected with 400 (SCRUM-6-AC-03). Enum values are exact,
 * case-sensitive constant names, as for {@code POST}/{@code PUT}.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskStatusUpdateRequest(@NotNull @JsonProperty("status") TaskStatus status) {
}
