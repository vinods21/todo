package com.vinods21.todo.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.vinods21.todo.domain.TaskStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Body of {@code PUT /api/tasks/{id}} — full replacement (A-05); {@code status} is required.
 * Client-sent {@code id}/{@code createdAt} are ignored (SCRUM-2-AC-12).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskUpdateRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) String description,
        @NotNull TaskStatus status,
        LocalDate dueDate) {

    public TaskUpdateRequest {
        title = title == null ? null : title.strip();
    }
}
