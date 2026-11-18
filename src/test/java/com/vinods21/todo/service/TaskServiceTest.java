package com.vinods21.todo.service;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import com.vinods21.todo.repository.TaskRepository;
import com.vinods21.todo.web.dto.TaskCreateRequest;
import com.vinods21.todo.web.dto.TaskUpdateRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Arrays;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("SCRUM-2")
@DisplayName("SCRUM-2 TaskService")
@ExtendWith(MockitoExtension.class)
class TaskServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-17T10:15:30.123456789Z");
    private static final Instant CREATED = Instant.parse("2026-11-01T08:00:00Z");

    @Mock
    private TaskRepository taskRepository;

    private TaskService taskService;

    @BeforeEach
    void setUp() {
        taskService = new TaskService(taskRepository, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Task existingTask(long id) {
        Task task = new Task("Old title", "Old description", TaskStatus.TODO, CREATED, LocalDate.of(2026, 11, 20));
        ReflectionTestUtils.setField(task, "id", id);
        return task;
    }

    @Test
    @DisplayName("SCRUM-2-AC-03: create defaults status to TODO and sets createdAt from the clock truncated to micros")
    void createDefaultsStatusAndCreatedAt() {
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Task created = taskService.create(new TaskCreateRequest("Write docs", "Some text", null, null));

        assertThat(created.getStatus()).isEqualTo(TaskStatus.TODO);
        assertThat(created.getCreatedAt()).isEqualTo(Instant.parse("2026-11-17T10:15:30.123456Z"));
        assertThat(created.getTitle()).isEqualTo("Write docs");
        assertThat(created.getDescription()).isEqualTo("Some text");
        assertThat(created.getDueDate()).isNull();
    }

    @Test
    @DisplayName("SCRUM-2-AC-03: create keeps an explicitly supplied status and due date")
    void createKeepsSuppliedStatus() {
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));
        LocalDate due = LocalDate.of(2026, 12, 1);

        Task created = taskService.create(new TaskCreateRequest("Ship", null, TaskStatus.IN_PROGRESS, due));

        assertThat(created.getStatus()).isEqualTo(TaskStatus.IN_PROGRESS);
        assertThat(created.getDueDate()).isEqualTo(due);
    }

    @Test
    @DisplayName("SCRUM-2-AC-04: get returns the task when it exists")
    void getReturnsExistingTask() {
        Task existing = existingTask(7L);
        when(taskRepository.findById(7L)).thenReturn(Optional.of(existing));

        assertThat(taskService.get(7L)).isSameAs(existing);
    }

    @Test
    @DisplayName("SCRUM-2-AC-08: get throws TaskNotFoundException for an unknown id")
    void getThrowsWhenMissing() {
        when(taskRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.get(99L))
                .isInstanceOf(TaskNotFoundException.class)
                .hasMessage("Task with id 99 not found");
    }

    @Test
    @DisplayName("SCRUM-2-AC-05: list requests the given page and size sorted by createdAt DESC then id DESC")
    void listUsesPageSizeAndSort() {
        Page<Task> page = new PageImpl<>(List.of(existingTask(1L)));
        when(taskRepository.findAll(any(Pageable.class))).thenReturn(page);

        Page<Task> result = taskService.list(2, 5);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(taskRepository).findAll(captor.capture());
        Pageable pageable = captor.getValue();
        assertThat(result).isSameAs(page);
        assertThat(pageable.getPageNumber()).isEqualTo(2);
        assertThat(pageable.getPageSize()).isEqualTo(5);
        assertThat(pageable.getSort())
                .isEqualTo(Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
    }

    @Test
    @DisplayName("SCRUM-2-AC-06, SCRUM-2-AC-12: update replaces only mutable fields and keeps id and createdAt")
    void updateCopiesMutableFieldsOnly() {
        Task existing = existingTask(7L);
        when(taskRepository.findById(7L)).thenReturn(Optional.of(existing));
        when(taskRepository.save(existing)).thenReturn(existing);
        LocalDate due = LocalDate.of(2027, 1, 15);

        Task updated = taskService.update(7L, new TaskUpdateRequest("New title", null, TaskStatus.DONE, due));

        assertThat(updated.getId()).isEqualTo(7L);
        assertThat(updated.getCreatedAt()).isEqualTo(CREATED);
        assertThat(updated.getTitle()).isEqualTo("New title");
        assertThat(updated.getDescription()).isNull();
        assertThat(updated.getStatus()).isEqualTo(TaskStatus.DONE);
        assertThat(updated.getDueDate()).isEqualTo(due);
    }

    @Test
    @DisplayName("SCRUM-2-AC-08: update throws TaskNotFoundException for an unknown id and saves nothing")
    void updateThrowsWhenMissing() {
        when(taskRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.update(99L, new TaskUpdateRequest("x", null, TaskStatus.TODO, null)))
                .isInstanceOf(TaskNotFoundException.class);
        verify(taskRepository, never()).save(any(Task.class));
    }

    @Test
    @DisplayName("SCRUM-2-AC-07: delete removes an existing task")
    void deleteRemovesExistingTask() {
        when(taskRepository.existsById(7L)).thenReturn(true);

        taskService.delete(7L);

        verify(taskRepository).deleteById(7L);
    }

    @Test
    @DisplayName("SCRUM-2-AC-08: delete throws TaskNotFoundException for an unknown id and deletes nothing")
    void deleteThrowsWhenMissing() {
        when(taskRepository.existsById(99L)).thenReturn(false);

        TaskNotFoundException ex = assertThrows(TaskNotFoundException.class, () -> taskService.delete(99L));

        assertThat(ex.getId()).isEqualTo(99L);
        verify(taskRepository, never()).deleteById(anyLong());
    }

    // ---------------------------------------------------------------- SCRUM-6: status change and filter

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-01: updateStatus changes only the status and keeps id, title, description, dueDate and createdAt")
    void updateStatusChangesOnlyStatus() {
        Task existing = existingTask(7L);
        when(taskRepository.findById(7L)).thenReturn(Optional.of(existing));
        when(taskRepository.save(existing)).thenReturn(existing);

        Task updated = taskService.updateStatus(7L, TaskStatus.IN_PROGRESS);

        verify(taskRepository).save(existing);
        assertThat(updated).isSameAs(existing);
        assertThat(updated.getStatus()).isEqualTo(TaskStatus.IN_PROGRESS);
        assertThat(updated.getId()).isEqualTo(7L);
        assertThat(updated.getTitle()).isEqualTo("Old title");
        assertThat(updated.getDescription()).isEqualTo("Old description");
        assertThat(updated.getDueDate()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(updated.getCreatedAt()).isEqualTo(CREATED);
    }

    static Stream<Arguments> allTransitions() {
        return Arrays.stream(TaskStatus.values())
                .flatMap(from -> Arrays.stream(TaskStatus.values()).map(to -> Arguments.of(from, to)));
    }

    @ParameterizedTest(name = "SCRUM-6-AC-02: {0} -> {1} is allowed")
    @MethodSource("allTransitions")
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-02: every from-to status combination (incl. backwards and same-to-same) is allowed")
    void everyTransitionAllowed(TaskStatus from, TaskStatus to) {
        Task existing = existingTask(3L);
        existing.setStatus(from);
        when(taskRepository.findById(3L)).thenReturn(Optional.of(existing));
        when(taskRepository.save(existing)).thenReturn(existing);

        Task updated = taskService.updateStatus(3L, to);

        assertThat(updated.getStatus()).isEqualTo(to);
        assertThat(updated.getTitle()).isEqualTo("Old title");
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: updateStatus throws TaskNotFoundException for an unknown id and saves nothing")
    void updateStatusThrowsWhenMissing() {
        when(taskRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> taskService.updateStatus(99L, TaskStatus.DONE))
                .isInstanceOf(TaskNotFoundException.class)
                .hasMessage("Task with id 99 not found");
        verify(taskRepository, never()).save(any(Task.class));
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-05, SCRUM-6-NFR-08: listByStatus queries findByStatus with page, size and newest-first sort, never findAll")
    void listByStatusFiltersInDatabase() {
        Page<Task> page = new PageImpl<>(List.of(existingTask(1L)));
        when(taskRepository.findByStatus(eq(TaskStatus.DONE), any(Pageable.class))).thenReturn(page);

        Page<Task> result = taskService.listByStatus(2, 5, TaskStatus.DONE);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(taskRepository).findByStatus(eq(TaskStatus.DONE), captor.capture());
        Pageable pageable = captor.getValue();
        assertThat(result).isSameAs(page);
        assertThat(pageable.getPageNumber()).isEqualTo(2);
        assertThat(pageable.getPageSize()).isEqualTo(5);
        assertThat(pageable.getSort())
                .isEqualTo(Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
        verify(taskRepository, never()).findAll(any(Pageable.class));
    }
}
