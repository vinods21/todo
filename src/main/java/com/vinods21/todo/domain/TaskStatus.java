package com.vinods21.todo.domain;

/**
 * Task status (SCRUM-2). Any value may be set on create/update/status change; no transition rules (SCRUM-6 A-01).
 */
public enum TaskStatus {
    TODO,
    IN_PROGRESS,
    DONE
}
