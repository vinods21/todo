package com.vinods21.todo.web;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import com.vinods21.todo.service.TaskService;
import com.vinods21.todo.web.dto.PageResponse;
import com.vinods21.todo.web.dto.TaskCreateRequest;
import com.vinods21.todo.web.dto.TaskResponse;
import com.vinods21.todo.web.dto.TaskStatusUpdateRequest;
import com.vinods21.todo.web.dto.TaskUpdateRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

/**
 * REST API for tasks under {@code /api/tasks} (SCRUM-2-AC-03..AC-08, AC-10..AC-12; SCRUM-6-AC-01..AC-07).
 * <p>
 * Note: deliberately <b>not</b> annotated with {@code @Validated}. A class-level {@code @Validated} switches
 * Spring MVC's built-in method validation off (AOP proxy instead, raising {@code ConstraintViolationException}),
 * whereas the built-in support raises {@code HandlerMethodValidationException} for the {@code @Min} query
 * parameters, which the error handler maps to 400.
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    /** A-07: larger page sizes are clamped, not rejected. */
    static final int MAX_PAGE_SIZE = 100;

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    /** SCRUM-2-AC-03: 201 + Location header. */
    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskCreateRequest request) {
        Task task = taskService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(task.getId())
                .toUri();
        return ResponseEntity.created(location).body(TaskResponse.from(task));
    }

    /** SCRUM-2-AC-04. */
    @GetMapping("/{id}")
    public TaskResponse get(@PathVariable("id") long id) {
        return TaskResponse.from(taskService.get(id));
    }

    /**
     * SCRUM-2-AC-05: paginated, newest first; negative page / size &lt; 1 → 400, size &gt; 100 clamped.
     * SCRUM-6-AC-05..AC-07: optional single-valued {@code status} filter applied in the database.
     * <p>
     * {@code status} is bound as raw {@code String[]} and parsed by {@link #parseStatusFilter(String[])} (ADR 0009):
     * enum binding would turn {@code ?status=} into "no filter" and silently take the first of repeated values.
     */
    @GetMapping
    public PageResponse<TaskResponse> list(
            @RequestParam(name = "page", defaultValue = "0") @Min(0) int page,
            @RequestParam(name = "size", defaultValue = "20") @Min(1) int size,
            @RequestParam(name = "status", required = false) String[] status) {
        int effectiveSize = Math.min(size, MAX_PAGE_SIZE);
        TaskStatus filter = parseStatusFilter(status);
        Page<Task> result = filter == null
                ? taskService.list(page, effectiveSize)
                : taskService.listByStatus(page, effectiveSize, filter);
        return PageResponse.from(result.map(TaskResponse::from));
    }

    /**
     * SCRUM-6-AC-07: {@code null} when the parameter is absent; otherwise exactly one value that is exactly an enum
     * constant name. Empty ({@code ?status=}), repeated, comma-separated, unknown or wrong-case values → 400.
     */
    static TaskStatus parseStatusFilter(String[] values) {
        if (values == null) {
            return null;
        }
        if (values.length != 1) {
            throw new InvalidQueryParameterException("status");
        }
        for (TaskStatus candidate : TaskStatus.values()) {
            if (candidate.name().equals(values[0])) {
                return candidate;
            }
        }
        throw new InvalidQueryParameterException("status");
    }

    /** SCRUM-2-AC-06. */
    @PutMapping("/{id}")
    public TaskResponse update(@PathVariable("id") long id, @Valid @RequestBody TaskUpdateRequest request) {
        return TaskResponse.from(taskService.update(id, request));
    }

    /** SCRUM-6-AC-01..AC-03: changes only the status (any transition, A-01) and returns the full task. */
    @PatchMapping("/{id}/status")
    public TaskResponse updateStatus(@PathVariable("id") long id,
            @Valid @RequestBody TaskStatusUpdateRequest request) {
        return TaskResponse.from(taskService.updateStatus(id, request.status()));
    }

    /** SCRUM-2-AC-07. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable("id") long id) {
        taskService.delete(id);
    }
}
