package com.vinods21.todo.repository;

import com.vinods21.todo.domain.Task;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data repository for {@link Task} (SCRUM-2-AC-05, SCRUM-2-AC-09). No custom queries needed.
 */
public interface TaskRepository extends JpaRepository<Task, Long> {
}
