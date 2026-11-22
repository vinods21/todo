package com.vinods21.todo.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Task status (SCRUM-2). Any value may be set on create/update/status change; no transition rules (SCRUM-6 A-01).
 */
@Schema(enumAsRef = true) // SCRUM-12: one reusable TaskStatus component in api/openapi.yaml (documentation only)
public enum TaskStatus {
    TODO,
    IN_PROGRESS,
    DONE
}
