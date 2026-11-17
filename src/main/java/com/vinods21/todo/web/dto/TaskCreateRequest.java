package com.vinods21.todo.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.vinods21.todo.domain.TaskStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Body of {@code POST /api/tasks}. Unknown properties such as client-sent {@code id}/{@code createdAt} are
 * ignored (SCRUM-2-AC-12). {@code title} is trimmed before validation (A-09, SCRUM-2-AC-10).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskCreateRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) String description,
        TaskStatus status,
        LocalDate dueDate) {

    public TaskCreateRequest {
        title = title == null ? null : title.strip();
    }
}
