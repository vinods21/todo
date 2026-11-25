package com.vinods21.todo.web;

import com.vinods21.todo.config.OpenApiDefinitionConfig;
import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import com.vinods21.todo.service.TaskService;
import com.vinods21.todo.web.dto.PageResponse;
import com.vinods21.todo.web.dto.TaskCreateRequest;
import com.vinods21.todo.web.dto.TaskResponse;
import com.vinods21.todo.web.dto.TaskStatusUpdateRequest;
import com.vinods21.todo.web.dto.TaskUpdateRequest;
import com.vinods21.todo.web.error.ApiError;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
 * <p>
 * SCRUM-12 (ADR 0017): the {@code @Operation}/{@code @ApiResponse}/{@code @Parameter}/{@code @Tag} annotations only
 * document the contract ({@code api/openapi.yaml}, generated in tests); nothing at runtime reads them.
 */
@RestController
@RequestMapping("/api/tasks")
@Tag(name = "Tasks", description = "Create, read, list, update, change the status of and delete tasks")
@ApiResponse(responseCode = "500", description = "Unexpected error",
        content = @Content(mediaType = TaskController.JSON, schema = @Schema(implementation = ApiError.class)))
// SCRUM-13-AC-24 (ADR 0018 §5): bearer token on every operation; 401 without a valid one, 403 without role todo-user.
@SecurityRequirement(name = OpenApiDefinitionConfig.BEARER_AUTH)
@ApiResponse(responseCode = "401", description = "Missing, invalid or expired access token",
        headers = @Header(name = HttpHeaders.WWW_AUTHENTICATE, required = true,
                description = "Bearer challenge (RFC 6750)", schema = @Schema(type = "string")),
        content = @Content(mediaType = TaskController.JSON, schema = @Schema(implementation = ApiError.class)))
@ApiResponse(responseCode = "403", description = "The access token lacks the application role todo-user",
        headers = @Header(name = HttpHeaders.WWW_AUTHENTICATE, required = true,
                description = "Bearer challenge with error=\"insufficient_scope\" (RFC 6750)",
                schema = @Schema(type = "string")),
        content = @Content(mediaType = TaskController.JSON, schema = @Schema(implementation = ApiError.class)))
public class TaskController {

    /** SCRUM-12: media type of every documented body (annotation values must be constants). */
    static final String JSON = MediaType.APPLICATION_JSON_VALUE;

    /** A-07: larger page sizes are clamped, not rejected. */
    static final int MAX_PAGE_SIZE = 100;

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    /** SCRUM-2-AC-03: 201 + Location header. */
    @PostMapping
    @Operation(operationId = "createTask", summary = "Create a task")
    @ApiResponse(responseCode = "201", description = "Task created", useReturnTypeSchema = true,
            headers = @Header(name = HttpHeaders.LOCATION, description = "URL of the created task", required = true,
                    schema = @Schema(type = "string", format = "uri")))
    @ApiResponse(responseCode = "400", description = "Validation failed, malformed JSON or invalid field value",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "415", description = "Content type is not application/json",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
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
    @Operation(operationId = "getTask", summary = "Get a task")
    @ApiResponse(responseCode = "200", description = "The task", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Non-numeric id",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "404", description = "Task not found",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
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
    @Operation(operationId = "listTasks", summary = "List tasks",
            description = "Newest first (createdAt DESC, id DESC). size > 100 is clamped to 100. status filters by "
                    + "exactly one exact, case-sensitive enum name; empty, repeated, comma-separated, unknown or "
                    + "wrong-case values are rejected (ADR 0009).")
    @ApiResponse(responseCode = "200", description = "One page of tasks", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Invalid page, size or status",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    public PageResponse<TaskResponse> list(
            @Parameter(description = "0-based page index")
            @RequestParam(name = "page", defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size; values above 100 are clamped to 100")
            @RequestParam(name = "size", defaultValue = "20") @Min(1) int size,
            // ADR 0009: bound as String[] on purpose (strict parsing below); documented as ONE optional enum value
            @Parameter(description = "Only tasks with this status (single value)",
                    schema = @Schema(implementation = TaskStatus.class))
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
    @Operation(operationId = "updateTask", summary = "Replace a task",
            description = "Full replacement of title, description, status and dueDate; id and createdAt are unchanged.")
    @ApiResponse(responseCode = "200", description = "The updated task", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400",
            description = "Validation failed, malformed JSON, invalid field value or non-numeric id",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "404", description = "Task not found",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "415", description = "Content type is not application/json",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    public TaskResponse update(@PathVariable("id") long id, @Valid @RequestBody TaskUpdateRequest request) {
        return TaskResponse.from(taskService.update(id, request));
    }

    /** SCRUM-6-AC-01..AC-03: changes only the status (any transition, A-01) and returns the full task. */
    @PatchMapping("/{id}/status")
    @Operation(operationId = "updateTaskStatus", summary = "Change the status of a task",
            description = "Changes only the status (any transition) and returns the full task (ADR 0009).")
    @ApiResponse(responseCode = "200", description = "The updated task", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Missing, null or invalid status, malformed JSON or non-numeric id",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "404", description = "Task not found",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "415", description = "Content type is not application/json",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    public TaskResponse updateStatus(@PathVariable("id") long id,
            @Valid @RequestBody TaskStatusUpdateRequest request) {
        return TaskResponse.from(taskService.updateStatus(id, request.status()));
    }

    /** SCRUM-2-AC-07. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteTask", summary = "Delete a task")
    @ApiResponse(responseCode = "204", description = "Task deleted")
    @ApiResponse(responseCode = "400", description = "Non-numeric id",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    @ApiResponse(responseCode = "404", description = "Task not found",
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    public void delete(@PathVariable("id") long id) {
        taskService.delete(id);
    }
}
