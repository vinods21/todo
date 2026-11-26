package com.vinods21.todo.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.context.annotation.Configuration;

/**
 * SCRUM-12 / ADR 0017: fixed metadata of the generated OpenAPI document — no build version, no host or port, so
 * generating it twice yields identical bytes (SCRUM-12-NFR-03). Annotations only: the generator (springdoc) is a
 * test-scope dependency and never part of the jar (SCRUM-12-AC-10, NFR-01).
 * <p>
 * SCRUM-13-AC-24 (ADR 0018 §5): the bearer/JWT security scheme {@value #BEARER_AUTH}; the controllers reference it
 * with {@code @SecurityRequirement}. Its name is part of the contract (and of the breaking-change acknowledgments).
 */
@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(
        info = @Info(title = "To-Do Task API", version = "1",
                description = "Task REST API of the To-Do application (SCRUM-2, SCRUM-6). All operations require a "
                        + "bearer access token of the Keycloak realm 'todo' (SCRUM-13, ADR 0018); the Task operations "
                        + "also require the role todo-user. Every error response uses the ApiError body (ADR 0003). "
                        + "Contract: ADR 0017."),
        servers = @Server(url = "/", description = "Same origin: nginx proxies /api/** to the backend (ADR 0011)"))
@SecurityScheme(name = OpenApiDefinitionConfig.BEARER_AUTH, type = SecuritySchemeType.HTTP, scheme = "bearer",
        bearerFormat = "JWT",
        description = "Access token of the Keycloak realm 'todo' (aud todo-api) — ADR 0018")
public class OpenApiDefinitionConfig {

    /** SCRUM-13: name of the security scheme in {@code api/openapi.yaml}. */
    public static final String BEARER_AUTH = "bearerAuth";
}
