package com.vinods21.todo.repository;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data repository for {@link Task} (SCRUM-2-AC-05, SCRUM-2-AC-09, SCRUM-6-AC-05).
 */
public interface TaskRepository extends JpaRepository<Task, Long> {

    /**
     * SCRUM-6-AC-05, SCRUM-6-NFR-08: {@code WHERE status = ?} with the caller's paging and sort, plus a derived count
     * query; served by the Flyway V2 index {@code ix_tasks_status_created_at_id}.
     */
    Page<Task> findByStatus(TaskStatus status, Pageable pageable);
}
