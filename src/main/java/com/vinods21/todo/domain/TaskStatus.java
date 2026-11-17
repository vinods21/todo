package com.vinods21.todo.domain;

/**
 * Task status (SCRUM-2). Any value may be set on create/update; transition rules belong to SCRUM-6.
 */
public enum TaskStatus {
    TODO,
    IN_PROGRESS,
    DONE
}
