package com.vinods21.todo.web.dto;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

import java.time.Instant;
import java.time.LocalDate;

/**
 * JSON representation of a task. SCRUM-12 (ADR 0017): every property is always present; {@code description} and
 * {@code dueDate} are {@code null} when absent (documentation annotations only).
 */
public record TaskResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Long id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Nullable String description,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) TaskStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Nullable LocalDate dueDate) {

    public static TaskResponse from(Task task) {
        return new TaskResponse(task.getId(), task.getTitle(), task.getDescription(), task.getStatus(),
                task.getCreatedAt(), task.getDueDate());
    }
}
