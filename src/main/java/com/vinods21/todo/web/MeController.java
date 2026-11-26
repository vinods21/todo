package com.vinods21.todo.web;

import com.vinods21.todo.config.AuthProperties;
import com.vinods21.todo.config.OpenApiDefinitionConfig;
import com.vinods21.todo.web.dto.MeResponse;
import com.vinods21.todo.web.error.ApiError;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * SCRUM-13-AC-21, AC-22 (design §5.5): {@code GET /api/me} — who is signed in. Requires a valid access token but
 * <b>not</b> the application role (SecurityConfig), so the SPA's "no access" page can show the user's name.
 * <p>
 * The authentication is read from the security context (not a handler parameter), so the generated contract has no
 * parameters for it.
 */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Current user", description = "The authenticated user (SCRUM-13)")
@SecurityRequirement(name = OpenApiDefinitionConfig.BEARER_AUTH)
@ApiResponse(responseCode = "500", description = "Unexpected error",
        content = @Content(mediaType = MeController.JSON, schema = @Schema(implementation = ApiError.class)))
public class MeController {

    static final String JSON = MediaType.APPLICATION_JSON_VALUE;
    static final String ROLE_PREFIX = "ROLE_";

    private final Set<String> applicationRoles;

    public MeController(AuthProperties authProperties) {
        this.applicationRoles = Set.copyOf(authProperties.roles());
    }

    @GetMapping
    @Operation(operationId = "getCurrentUser", summary = "Get the authenticated user",
            description = "Claims of the access token: subject, preferred_username, e-mail, name and the application "
                    + "roles. Needs a valid access token, but not the todo-user role.")
    @ApiResponse(responseCode = "200", description = "The authenticated user", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "401", description = "Missing, invalid or expired access token",
            headers = @Header(name = HttpHeaders.WWW_AUTHENTICATE, required = true,
                    description = "Bearer challenge (RFC 6750)", schema = @Schema(type = "string")),
            content = @Content(mediaType = JSON, schema = @Schema(implementation = ApiError.class)))
    public MeResponse me() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            // Unreachable behind SecurityConfig (authenticated() with JWTs only); fail closed as a 401 anyway.
            throw new InvalidBearerTokenException("No JWT authentication");
        }
        List<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority != null && authority.startsWith(ROLE_PREFIX))
                .map(authority -> authority.substring(ROLE_PREFIX.length()))
                .filter(applicationRoles::contains)
                .distinct()
                .sorted()
                .toList();
        return new MeResponse(jwt.getSubject(), authentication.getName(), jwt.getClaimAsString("email"),
                jwt.getClaimAsString("name"), roles);
    }
}
