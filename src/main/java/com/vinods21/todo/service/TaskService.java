package com.vinods21.todo.service;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import com.vinods21.todo.repository.TaskRepository;
import com.vinods21.todo.web.dto.TaskCreateRequest;
import com.vinods21.todo.web.dto.TaskUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Task business logic (SCRUM-2-AC-03..AC-08, AC-12). Owns transactions, defaults and not-found semantics.
 */
@Service
@Transactional
public class TaskService {

    /** Newest first; id breaks ties deterministically (SCRUM-2-AC-05). */
    static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id"));

    private final TaskRepository taskRepository;
    private final Clock clock;

    public TaskService(TaskRepository taskRepository, Clock clock) {
        this.taskRepository = taskRepository;
        this.clock = clock;
    }

    /**
     * SCRUM-2-AC-03: status defaults to TODO; createdAt is server-set and truncated to microseconds so the
     * value returned now equals what PostgreSQL (timestamptz) returns later.
     */
    public Task create(TaskCreateRequest request) {
        TaskStatus status = request.status() != null ? request.status() : TaskStatus.TODO;
        Instant createdAt = Instant.now(clock).truncatedTo(ChronoUnit.MICROS);
        Task task = new Task(request.title(), request.description(), status, createdAt, request.dueDate());
        return taskRepository.save(task);
    }

    @Transactional(readOnly = true)
    public Task get(long id) {
        return taskRepository.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
    }

    @Transactional(readOnly = true)
    public Page<Task> list(int page, int size) {
        return taskRepository.findAll(PageRequest.of(page, size, DEFAULT_SORT));
    }

    /**
     * SCRUM-2-AC-06: full replacement of the mutable fields only; id and createdAt are never changed.
     */
    public Task update(long id, TaskUpdateRequest request) {
        Task task = get(id);
        task.setTitle(request.title());
        task.setDescription(request.description());
        task.setStatus(request.status());
        task.setDueDate(request.dueDate());
        return taskRepository.save(task);
    }

    public void delete(long id) {
        if (!taskRepository.existsById(id)) {
            throw new TaskNotFoundException(id);
        }
        taskRepository.deleteById(id);
    }
}
