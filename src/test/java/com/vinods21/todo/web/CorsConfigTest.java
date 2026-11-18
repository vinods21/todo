package com.vinods21.todo.web;

import com.vinods21.todo.service.TaskService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("SCRUM-2")
@DisplayName("SCRUM-2 CORS configuration")
@WebMvcTest(TaskController.class)
class CorsConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskService taskService;

    private static ResultActions preflight(MockMvc mvc, String origin, String method) throws Exception {
        String path = ("PUT".equals(method) || "DELETE".equals(method)) ? "/api/tasks/1" : "/api/tasks";
        return mvc.perform(options(path)
                .header(HttpHeaders.ORIGIN, origin)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method));
    }

    @Test
    @DisplayName("SCRUM-2-AC-15: preflight from the default React dev origin http://localhost:5173 is allowed")
    void defaultOriginAllowed() throws Exception {
        preflight(mockMvc, "http://localhost:5173", "POST")
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("POST")));
    }

    @Test
    @DisplayName("SCRUM-2-AC-15: GET, POST, PUT, DELETE and OPTIONS are allowed for the default origin")
    void allowedMethods() throws Exception {
        for (String method : new String[] {"GET", "POST", "PUT", "DELETE"}) {
            preflight(mockMvc, "http://localhost:5173", method)
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString(method)))
                    // the preflight itself is an OPTIONS request; OPTIONS is advertised as allowed too
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("OPTIONS")));
        }
    }

    @Test
    @DisplayName("SCRUM-2-AC-15: preflight from a non-allowed origin gets no Access-Control-Allow-Origin header")
    void foreignOriginRejected() throws Exception {
        preflight(mockMvc, "http://evil.test", "GET")
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    private static ResultActions statusPatchPreflight(MockMvc mvc, String origin) throws Exception {
        return mvc.perform(options("/api/tasks/1/status")
                .header(HttpHeaders.ORIGIN, origin)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PATCH")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"));
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-04: preflight for PATCH /api/tasks/{id}/status from the default origin allows PATCH")
    void patchPreflightAllowed() throws Exception {
        statusPatchPreflight(mockMvc, "http://localhost:5173")
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("PATCH")));
    }

    @Test
    @Tag("SCRUM-6")
    @DisplayName("SCRUM-6-AC-04: PATCH preflight from a non-allowed origin gets no Access-Control-Allow-Origin header")
    void patchPreflightForeignOriginRejected() throws Exception {
        statusPatchPreflight(mockMvc, "http://evil.test")
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Nested
    @Tag("SCRUM-2")
    @DisplayName("SCRUM-2 CORS with APP_CORS_ALLOWED_ORIGINS override")
    @TestPropertySource(properties = "app.cors.allowed-origins=http://a.test,http://b.test")
    class OverriddenOrigins {

        @Autowired
        private MockMvc overriddenMockMvc;

        @Test
        @DisplayName("SCRUM-2-AC-15: every origin from the comma-separated override list is allowed")
        void overrideOriginsAllowed() throws Exception {
            preflight(overriddenMockMvc, "http://a.test", "GET")
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://a.test"));
            preflight(overriddenMockMvc, "http://b.test", "DELETE")
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://b.test"));
        }

        @Test
        @DisplayName("SCRUM-2-AC-15: the default origin is no longer allowed once the list is overridden")
        void defaultOriginNotAllowedAfterOverride() throws Exception {
            preflight(overriddenMockMvc, "http://localhost:5173", "GET")
                    .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        }
    }
}
