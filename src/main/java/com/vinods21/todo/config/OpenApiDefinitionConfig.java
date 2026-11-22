package com.vinods21.todo.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.context.annotation.Configuration;

/**
 * SCRUM-12 / ADR 0017: fixed metadata of the generated OpenAPI document — no build version, no host or port, so
 * generating it twice yields identical bytes (SCRUM-12-NFR-03). Annotations only: the generator (springdoc) is a
 * test-scope dependency and never part of the jar (SCRUM-12-AC-10, NFR-01).
 */
@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(
        info = @Info(title = "To-Do Task API", version = "1",
                description = "Task REST API of the To-Do application (SCRUM-2, SCRUM-6). Every error response uses "
                        + "the ApiError body (ADR 0003). Contract: ADR 0017."),
        servers = @Server(url = "/", description = "Same origin: nginx proxies /api/** to the backend (ADR 0011)"))
public class OpenApiDefinitionConfig {
}
