package com.vinods21.todo.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

import java.util.List;

/**
 * SCRUM-13-AC-21 (design §5.5): the authenticated user as the backend sees it — subject id, {@code preferred_username},
 * e-mail and name (null when the token has none, e.g. service accounts) and the application roles (sorted; Keycloak's
 * default roles are never included). Every property is always present.
 */
@Schema(description = "The authenticated user (claims of the access token, SCRUM-13)")
public record MeResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Subject (sub) of the access token")
        String subject,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "preferred_username")
        String username,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Nullable String email,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) @Nullable String name,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                description = "Application roles of the user (todo-user, todo-admin), sorted")
        List<String> roles) {

    public MeResponse {
        roles = roles == null ? List.of() : List.copyOf(roles);
    }
}
