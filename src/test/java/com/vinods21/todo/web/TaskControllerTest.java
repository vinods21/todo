package com.vinods21.todo.web;

import com.vinods21.todo.domain.Task;
import com.vinods21.todo.domain.TaskStatus;
import com.vinods21.todo.service.TaskNotFoundException;
import com.vinods21.todo.config.SecurityConfig;
import com.vinods21.todo.service.TaskService;
import com.vinods21.todo.web.security.ApiErrorAccessDeniedHandler;
import com.vinods21.todo.web.security.ApiErrorAuthenticationEntryPoint;
import com.vinods21.todo.web.dto.TaskCreateRequest;
import com.vinods21.todo.web.dto.TaskUpdateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("SCRUM-2")
@DisplayName("SCRUM-2 TaskController")
@WebMvcTest(TaskController.class)
// SCRUM-13-AC-23, AC-35: the real security rules; every test runs as a user with the application role (bodies unchanged)
@Import({SecurityConfig.class, ApiErrorAuthenticationEntryPoint.class, ApiErrorAccessDeniedHandler.class})
@WithMockUser(roles = "todo-user")
class TaskControllerTest {

    private static final Instant CREATED = Instant.parse("2026-11-17T10:15:30Z");
    private static final LocalDate DUE = LocalDate.of(2026, 12, 1);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService taskService;

    private static Task task(long id, String title, TaskStatus status) {
        Task task = new Task(title, "Some description", status, CREATED, DUE);
        ReflectionTestUtils.setField(task, "id", id);
        return task;
    }

    // ---------------------------------------------------------------- create / read / list / update / delete

    @Test
    @DisplayName("SCRUM-2-AC-03: create returns 201 with Location header, body and default status TODO")
    void createReturns201() throws Exception {
        when(taskService.create(any(TaskCreateRequest.class))).thenReturn(task(1L, "Write docs", TaskStatus.TODO));

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "  Write docs  "}
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", endsWith("/api/tasks/1")))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Write docs"))
                .andExpect(jsonPath("$.status").value("TODO"))
                .andExpect(jsonPath("$.createdAt").value("2026-11-17T10:15:30Z"))
                .andExpect(jsonPath("$.dueDate").value("2026-12-01"));

        // A-09: title is trimmed; status omitted -> null here, defaulted to TODO by the service
        verify(taskService).create(new TaskCreateRequest("Write docs", null, null, null));
    }

    @Test
    @DisplayName("SCRUM-2-AC-12: client-supplied id and createdAt in a create body are ignored")
    void createIgnoresClientIdAndCreatedAt() throws Exception {
        when(taskService.create(any(TaskCreateRequest.class)))
                .thenReturn(task(1L, "Write docs", TaskStatus.IN_PROGRESS));

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id": 999, "createdAt": "2000-01-01T00:00:00Z", "title": "Write docs",
                                 "description": "d", "status": "IN_PROGRESS", "dueDate": "2026-12-01"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.createdAt").value("2026-11-17T10:15:30Z"));

        ArgumentCaptor<TaskCreateRequest> captor = ArgumentCaptor.forClass(TaskCreateRequest.class);
        verify(taskService).create(captor.capture());
        assertThat(captor.getValue())
                .isEqualTo(new TaskCreateRequest("Write docs", "d", TaskStatus.IN_PROGRESS, DUE));
    }

    @Test
    @DisplayName("SCRUM-2-AC-04: get by id returns 200 with the task")
    void getReturns200() throws Exception {
        when(taskService.get(5L)).thenReturn(task(5L, "Read book", TaskStatus.DONE));

        mockMvc.perform(get("/api/tasks/5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.title").value("Read book"))
                .andExpect(jsonPath("$.description").value("Some description"))
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.createdAt").value("2026-11-17T10:15:30Z"))
                .andExpect(jsonPath("$.dueDate").value("2026-12-01"));
    }

    @Test
    @DisplayName("SCRUM-2-AC-05: list uses defaults page=0,size=20 and returns items plus paging metadata")
    void listUsesDefaults() throws Exception {
        Page<Task> page = new PageImpl<>(List.of(task(2L, "Newer", TaskStatus.TODO), task(1L, "Older", TaskStatus.TODO)),
                PageRequest.of(0, 20), 2);
        when(taskService.list(0, 20)).thenReturn(page);

        mockMvc.perform(get("/api/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].id").value(2))
                .andExpect(jsonPath("$.items[1].id").value(1))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    @DisplayName("SCRUM-2-AC-05: list clamps size above 100 to 100")
    void listClampsSize() throws Exception {
        when(taskService.list(1, 100)).thenReturn(Page.empty(PageRequest.of(1, 100)));

        mockMvc.perform(get("/api/tasks").param("page", "1").param("size", "150"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(100));

        verify(taskService).list(1, 100);
    }

    @Test
    @DisplayName("SCRUM-2-AC-05: list on an empty database returns an empty item list, not an error")
    void listEmpty() throws Exception {
        when(taskService.list(0, 20)).thenReturn(Page.empty(PageRequest.of(0, 20)));

        mockMvc.perform(get("/api/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));
    }

    @Test
    @DisplayName("SCRUM-2-AC-05, SCRUM-2-AC-13: negative page returns 400 with a field error for page")
    void listNegativePageReturns400() throws Exception {
        mockMvc.perform(get("/api/tasks").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("page"));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-05, SCRUM-2-AC-13: size=0 returns 400 with a field error for size")
    void listZeroSizeReturns400() throws Exception {
        mockMvc.perform(get("/api/tasks").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("size"));

        verify(taskService, never()).list(anyInt(), anyInt());
    }

    @Test
    @DisplayName("SCRUM-2-AC-06, SCRUM-2-AC-12: update returns 200; client id/createdAt in the body are ignored")
    void updateReturns200() throws Exception {
        when(taskService.update(eq(1L), any(TaskUpdateRequest.class)))
                .thenReturn(task(1L, "Updated", TaskStatus.DONE));

        mockMvc.perform(put("/api/tasks/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"id": 42, "createdAt": "1999-01-01T00:00:00Z", "title": " Updated ",
                                 "description": "Some description", "status": "DONE", "dueDate": "2026-12-01"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Updated"))
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.createdAt").value("2026-11-17T10:15:30Z"));

        verify(taskService).update(1L, new TaskUpdateRequest("Updated", "Some description", TaskStatus.DONE, DUE));
    }

    @Test
    @DisplayName("SCRUM-2-AC-07: delete returns 204 with no body")
    void deleteReturns204() throws Exception {
        mockMvc.perform(delete("/api/tasks/1"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        verify(taskService).delete(1L);
    }

    // ---------------------------------------------------------------- not found

    @Test
    @DisplayName("SCRUM-2-AC-08, SCRUM-2-AC-13: GET unknown id returns 404 with the standard error body")
    void getUnknownReturns404() throws Exception {
        when(taskService.get(99L)).thenThrow(new TaskNotFoundException(99L));

        mockMvc.perform(get("/api/tasks/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.timestamp", notNullValue()))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.message").value("Task with id 99 not found"))
                .andExpect(jsonPath("$.path").value("/api/tasks/99"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));
    }

    @Test
    @DisplayName("SCRUM-2-AC-08: PUT unknown id returns 404")
    void putUnknownReturns404() throws Exception {
        when(taskService.update(eq(99L), any(TaskUpdateRequest.class))).thenThrow(new TaskNotFoundException(99L));

        mockMvc.perform(put("/api/tasks/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "x", "status": "TODO"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("Task with id 99 not found"));
    }

    @Test
    @DisplayName("SCRUM-2-AC-08: DELETE unknown id returns 404")
    void deleteUnknownReturns404() throws Exception {
        doThrow(new TaskNotFoundException(99L)).when(taskService).delete(99L);

        mockMvc.perform(delete("/api/tasks/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.path").value("/api/tasks/99"));
    }

    // ---------------------------------------------------------------- validation

    static Stream<String> invalidTitleBodies() {
        return Stream.of(
                "{\"description\": \"no title\"}",
                "{\"title\": \"\"}",
                "{\"title\": \"   \"}",
                "{\"title\": \"" + "a".repeat(201) + "\"}");
    }

    @ParameterizedTest(name = "SCRUM-2-AC-10: invalid title #{index} returns 400 with a title field error")
    @MethodSource("invalidTitleBodies")
    @DisplayName("SCRUM-2-AC-10: missing, blank, whitespace-only or 201-char title returns 400")
    void invalidTitleReturns400(String body) throws Exception {
        mockMvc.perform(post("/api/tasks").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-10: a 200-char title is accepted (boundary)")
    void maxLengthTitleAccepted() throws Exception {
        String title = "a".repeat(200);
        when(taskService.create(any(TaskCreateRequest.class))).thenReturn(task(1L, title, TaskStatus.TODO));

        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"" + title + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("SCRUM-2-AC-10: description longer than 2000 characters returns 400 with a description field error")
    void descriptionTooLongReturns400() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"ok\", \"description\": \"" + "d".repeat(2001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("description"));
    }

    @Test
    @DisplayName("SCRUM-2-AC-10, SCRUM-2-AC-13: every invalid field is listed in one error body")
    void allFieldErrorsListed() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \" \", \"description\": \"" + "d".repeat(2001) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.timestamp", notNullValue()))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.path").value("/api/tasks"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(2)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("description"))
                .andExpect(jsonPath("$.fieldErrors[0].message", notNullValue()))
                .andExpect(jsonPath("$.fieldErrors[1].field").value("title"))
                .andExpect(jsonPath("$.fieldErrors[1].message", notNullValue()));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-10, SCRUM-2-AC-13: update without status returns 400 with a status field error")
    void updateWithoutStatusReturns400() throws Exception {
        mockMvc.perform(put("/api/tasks/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "x"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-11, SCRUM-2-AC-13: unknown status value returns 400 with the standard error body")
    void unknownStatusReturns400() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "x", "status": "BLOCKED"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.path").value("/api/tasks"))
                .andExpect(jsonPath("$.message").value("Invalid value for field 'status'"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-11: dueDate that is not a real date (2026-13-45) returns 400")
    void impossibleDueDateReturns400() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "x", "dueDate": "2026-13-45"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message", not(containsString("jackson"))))
                .andExpect(jsonPath("$.fieldErrors").isArray());

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-11: dueDate not in yyyy-MM-dd format (17/11/2026) returns 400")
    void wrongFormatDueDateReturns400() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "x", "dueDate": "17/11/2026"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message", not(containsString("jackson"))));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-11, SCRUM-2-AC-13: malformed JSON returns 400 with the standard error body")
    void malformedJsonReturns400() throws Exception {
        mockMvc.perform(post("/api/tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Malformed JSON request"))
                .andExpect(jsonPath("$.path").value("/api/tasks"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-12, SCRUM-2-AC-13: non-numeric path id returns 400")
    void nonNumericIdReturns400() throws Exception {
        mockMvc.perform(get("/api/tasks/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'id'"))
                .andExpect(jsonPath("$.path").value("/api/tasks/abc"));

        verifyNoInteractions(taskService);
    }

    // ---------------------------------------------------------------- generic error shape

    @Test
    @DisplayName("SCRUM-2-AC-13: unsupported method (PATCH) returns 405 with the standard error body")
    void unsupportedMethodReturns405() throws Exception {
        mockMvc.perform(patch("/api/tasks/1").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.error").value("Method Not Allowed"))
                .andExpect(jsonPath("$.message").value("Request method 'PATCH' is not supported"))
                .andExpect(jsonPath("$.path").value("/api/tasks/1"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));
    }

    @Test
    @DisplayName("SCRUM-2-AC-13: unsupported content type returns 415 with the standard error body")
    void unsupportedMediaTypeReturns415() throws Exception {
        mockMvc.perform(post("/api/tasks").contentType(MediaType.TEXT_PLAIN).content("title=x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.error").value("Unsupported Media Type"))
                .andExpect(jsonPath("$.message", containsString("is not supported")))
                .andExpect(jsonPath("$.path").value("/api/tasks"));

        verifyNoInteractions(taskService);
    }

    @Test
    @DisplayName("SCRUM-2-AC-13: unknown route returns 404 with the standard error body")
    void unknownRouteReturns404() throws Exception {
        mockMvc.perform(get("/api/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.path").value("/api/does-not-exist"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));
    }

    @Test
    @DisplayName("SCRUM-2-AC-14: unexpected errors return 500 with a generic message and no internals")
    void unexpectedErrorReturns500WithoutLeaks() throws Exception {
        when(taskService.get(1L))
                .thenThrow(new RuntimeException("org.postgresql.util.PSQLException: SELECT secret FROM tasks"));

        mockMvc.perform(get("/api/tasks/1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value(500))
                .andExpect(jsonPath("$.error").value("Internal Server Error"))
                .andExpect(jsonPath("$.message").value("An unexpected error occurred"))
                .andExpect(jsonPath("$.path").value("/api/tasks/1"))
                .andExpect(content().string(not(containsString("org."))))
                .andExpect(content().string(not(containsString("SELECT"))))
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("at com."))));
    }

    // ---------------------------------------------------------------- SCRUM-6: PATCH /api/tasks/{id}/status

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-01: PATCH status returns 200 with the full task; extra body fields such as title are ignored")
    void patchStatusReturns200AndIgnoresExtraFields() throws Exception {
        when(taskService.updateStatus(1L, TaskStatus.DONE)).thenReturn(task(1L, "Write docs", TaskStatus.DONE));

        mockMvc.perform(patch("/api/tasks/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status": "DONE", "title": "hacked", "id": 42, "createdAt": "2000-01-01T00:00:00Z"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Write docs"))
                .andExpect(jsonPath("$.description").value("Some description"))
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.createdAt").value("2026-11-17T10:15:30Z"))
                .andExpect(jsonPath("$.dueDate").value("2026-12-01"));

        // Only (id, status) reaches the service: the extra fields cannot be applied anywhere.
        verify(taskService).updateStatus(1L, TaskStatus.DONE);
        verifyNoMoreInteractions(taskService);
    }

    @ParameterizedTest(name = "SCRUM-6-AC-03: PATCH body {0} returns 400 Validation failed with a status field error")
    @ValueSource(strings = {"{}", "{\"status\": null}"})
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: missing or null status returns 400 Validation failed with a status field error")
    void patchMissingStatusReturns400(String body) throws Exception {
        mockMvc.perform(patch("/api/tasks/1/status").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.path").value("/api/tasks/1/status"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));

        verifyNoInteractions(taskService);
    }

    @ParameterizedTest(name = "SCRUM-6-AC-03: PATCH status value {0} returns 400 with a status field error")
    @ValueSource(strings = {"done", "DONEE", "Done", "BLOCKED"})
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: a status outside the enum (incl. wrong case) returns 400 with a status field error")
    void patchUnknownStatusReturns400(String value) throws Exception {
        mockMvc.perform(patch("/api/tasks/1/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"" + value + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Invalid value for field 'status'"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));

        verifyNoInteractions(taskService);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: malformed JSON returns 400 Malformed JSON request")
    void patchMalformedJsonReturns400() throws Exception {
        mockMvc.perform(patch("/api/tasks/1/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Malformed JSON request"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));

        verifyNoInteractions(taskService);
    }

    @ParameterizedTest(name = "SCRUM-6-AC-03: PATCH body [{0}] that is not a JSON object returns 400")
    @ValueSource(strings = {"\"DONE\"", "", "[\"DONE\"]"})
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: a bare string, an array or an empty body returns 400 and changes nothing")
    void patchNonObjectBodyReturns400(String body) throws Exception {
        mockMvc.perform(patch("/api/tasks/1/status").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors").isArray());

        verifyNoInteractions(taskService);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: non-numeric id returns 400 Invalid value for parameter 'id'")
    void patchNonNumericIdReturns400() throws Exception {
        mockMvc.perform(patch("/api/tasks/abc/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"DONE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'id'"))
                .andExpect(jsonPath("$.path").value("/api/tasks/abc/status"));

        verifyNoInteractions(taskService);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: unknown id returns 404 with the standard error body")
    void patchUnknownIdReturns404() throws Exception {
        when(taskService.updateStatus(99L, TaskStatus.DONE)).thenThrow(new TaskNotFoundException(99L));

        mockMvc.perform(patch("/api/tasks/99/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"DONE\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.timestamp", notNullValue()))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.message").value("Task with id 99 not found"))
                .andExpect(jsonPath("$.path").value("/api/tasks/99/status"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-03: non-JSON content type returns 415 with the standard error body")
    void patchNonJsonReturns415() throws Exception {
        mockMvc.perform(patch("/api/tasks/1/status").contentType(MediaType.TEXT_PLAIN).content("DONE"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.message", containsString("is not supported")))
                .andExpect(jsonPath("$.path").value("/api/tasks/1/status"));

        verify(taskService, never()).updateStatus(anyLong(), any());
    }

    // ---------------------------------------------------------------- SCRUM-6: GET /api/tasks?status=

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-05: ?status=DONE lists via listByStatus(0, 20, DONE) with paging metadata of the filtered set")
    void listFiltersByStatus() throws Exception {
        Page<Task> page = new PageImpl<>(List.of(task(5L, "Newer done", TaskStatus.DONE), task(3L, "Older done", TaskStatus.DONE)),
                PageRequest.of(0, 20), 2);
        when(taskService.listByStatus(0, 20, TaskStatus.DONE)).thenReturn(page);

        mockMvc.perform(get("/api/tasks").param("status", "DONE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].id").value(5))
                .andExpect(jsonPath("$.items[0].status").value("DONE"))
                .andExpect(jsonPath("$.items[1].id").value(3))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1));

        verify(taskService, never()).list(anyInt(), anyInt());
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-05: ?status combined with page and size keeps the SCRUM-2 paging rules (size clamped to 100)")
    void listFilterKeepsPagingRules() throws Exception {
        when(taskService.listByStatus(1, 100, TaskStatus.IN_PROGRESS)).thenReturn(Page.empty(PageRequest.of(1, 100)));

        mockMvc.perform(get("/api/tasks").param("status", "IN_PROGRESS").param("page", "1").param("size", "150"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(100));

        verify(taskService).listByStatus(1, 100, TaskStatus.IN_PROGRESS);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-05: ?status=DONE&page=-1 still returns 400 with a field error for page")
    void listFilterNegativePageReturns400() throws Exception {
        mockMvc.perform(get("/api/tasks").param("status", "DONE").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("page"));

        verifyNoInteractions(taskService);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-06: without status the unfiltered SCRUM-2 list(page, size) is used")
    void listWithoutStatusIsUnfiltered() throws Exception {
        when(taskService.list(0, 20)).thenReturn(new PageImpl<>(List.of(task(1L, "Any", TaskStatus.TODO)),
                PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/tasks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));

        verify(taskService).list(0, 20);
        verify(taskService, never()).listByStatus(anyInt(), anyInt(), any());
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-06: a filter that matches nothing returns 200 with an empty page")
    void listFilterWithoutMatchesReturnsEmptyPage() throws Exception {
        when(taskService.listByStatus(0, 20, TaskStatus.IN_PROGRESS)).thenReturn(Page.empty(PageRequest.of(0, 20)));

        mockMvc.perform(get("/api/tasks").param("status", "IN_PROGRESS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));
    }

    @ParameterizedTest(name = "SCRUM-6-AC-07: GET /api/tasks?{0} returns 400 for parameter status")
    @ValueSource(strings = {"status=DONEE", "status=done", "status=", "status=TODO,DONE", "status=TODO&status=DONE",
            "status=DONE&status=DONE"})
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-07: unknown, wrong-case, empty, comma-separated or repeated status returns 400")
    void listInvalidStatusReturns400(String query) throws Exception {
        mockMvc.perform(get("/api/tasks?" + query))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.timestamp", notNullValue()))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'status'"))
                .andExpect(jsonPath("$.path").value("/api/tasks"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)));

        verifyNoInteractions(taskService);
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-07: parseStatusFilter accepts exactly one exact enum name and treats absence as no filter")
    void parseStatusFilterRules() {
        assertThat(TaskController.parseStatusFilter(null)).isNull();
        for (TaskStatus value : TaskStatus.values()) {
            assertThat(TaskController.parseStatusFilter(new String[] {value.name()})).isEqualTo(value);
        }
        for (String[] invalid : List.of(new String[0], new String[] {""}, new String[] {"done"},
                new String[] {"TODO", "DONE"})) {
            assertThatThrownBy(() -> TaskController.parseStatusFilter(invalid))
                    .isInstanceOf(InvalidQueryParameterException.class)
                    .hasMessage("Invalid value for parameter 'status'");
        }
    }
}
