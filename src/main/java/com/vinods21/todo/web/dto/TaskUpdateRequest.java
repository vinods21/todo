package com.vinods21.todo.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.vinods21.todo.domain.TaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

import java.time.LocalDate;

/**
 * Body of {@code PUT /api/tasks/{id}} — full replacement (A-05); {@code status} is required.
 * Client-sent {@code id}/{@code createdAt} are ignored (SCRUM-2-AC-12). SCRUM-12: {@code @Nullable} is documentation.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskUpdateRequest(
        // SCRUM-12: @Size makes the generated minLength 0; the description states the real (blank) rule
        @Schema(description = "Not blank after trimming; at most 200 characters") @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) @Nullable String description,
        @NotNull TaskStatus status,
        @Nullable LocalDate dueDate) {

    public TaskUpdateRequest {
        title = title == null ? null : title.strip();
    }
}
