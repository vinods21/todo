package com.vinods21.todo.web;

import com.vinods21.todo.config.SecurityConfig;
import com.vinods21.todo.web.security.ApiErrorAccessDeniedHandler;
import com.vinods21.todo.web.security.ApiErrorAuthenticationEntryPoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("SCRUM-13")
@DisplayName("SCRUM-13 MeController")
@WebMvcTest(MeController.class)
@Import({SecurityConfig.class, ApiErrorAuthenticationEntryPoint.class, ApiErrorAccessDeniedHandler.class})
class MeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private static JwtAuthenticationToken jwtAuthentication(String username, String email, String name,
            String... authorities) {
        Jwt.Builder builder = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject("subject-" + username)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .claim("preferred_username", username);
        if (email != null) {
            builder.claim("email", email);
        }
        if (name != null) {
            builder.claim("name", name);
        }
        List<GrantedAuthority> granted = List.of(authorities).stream()
                .<GrantedAuthority>map(SimpleGrantedAuthority::new).toList();
        return new JwtAuthenticationToken(builder.build(), granted, username);
    }

    @Test
    @DisplayName("SCRUM-13-AC-21: GET /api/me maps subject, username, e-mail, name and the sorted application roles")
    void mapsClaims() throws Exception {
        mockMvc.perform(get("/api/me").with(authentication(jwtAuthentication("bob", "bob@corp.example", "Bob Admin",
                        "ROLE_todo-user", "ROLE_todo-admin", "ROLE_offline_access", "ROLE_default-roles-todo",
                        "SCOPE_profile"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value("subject-bob"))
                .andExpect(jsonPath("$.username").value("bob"))
                .andExpect(jsonPath("$.email").value("bob@corp.example"))
                .andExpect(jsonPath("$.name").value("Bob Admin"))
                .andExpect(jsonPath("$.roles", contains("todo-admin", "todo-user")));
    }

    @Test
    @DisplayName("SCRUM-13-AC-21, SCRUM-13-AC-22: no application role → 200 with roles [] (the role is not required)")
    void noRoles() throws Exception {
        mockMvc.perform(get("/api/me").with(authentication(jwtAuthentication("carol", null, null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("carol"))
                .andExpect(jsonPath("$.email").value(nullValue()))
                .andExpect(jsonPath("$.name").value(nullValue()))
                .andExpect(jsonPath("$.roles", empty()));
    }

    @Test
    @DisplayName("SCRUM-13-AC-21: GET /api/me without authentication → 401 ApiError + WWW-Authenticate")
    void anonymous() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, startsWith("Bearer")))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Authentication required"))
                .andExpect(jsonPath("$.path").value("/api/me"));
    }

    @Test
    @WithMockUser(roles = "todo-user")
    @DisplayName("SCRUM-13-AC-21: a non-JWT authentication is rejected with 401 (fail closed)")
    void nonJwtAuthentication() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid or expired access token"));
    }
}
