package com.vinods21.todo.web.dto;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;

import java.time.Instant;
import java.time.LocalDate;

/**
 * JSON representation of a task.
 */
public record TaskResponse(
        Long id,
        String title,
        String description,
        TaskStatus status,
        Instant createdAt,
        LocalDate dueDate) {

    public static TaskResponse from(Task task) {
        return new TaskResponse(task.getId(), task.getTitle(), task.getDescription(), task.getStatus(),
                task.getCreatedAt(), task.getDueDate());
    }
}
