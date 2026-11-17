package com.vinods21.todo.service;

/**
 * Thrown when a task id does not exist; mapped to 404 (SCRUM-2-AC-08).
 */
public class TaskNotFoundException extends RuntimeException {

    private final long id;

    public TaskNotFoundException(long id) {
        super("Task with id " + id + " not found");
        this.id = id;
    }

    public long getId() {
        return id;
    }
}
