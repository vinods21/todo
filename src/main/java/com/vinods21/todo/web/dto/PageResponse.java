package com.vinods21.todo.web.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Paginated list response (SCRUM-2-AC-05).
 */
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }
}
