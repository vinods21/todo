package com.vinods21.todo.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * SCRUM-7 (design §7.1): one PostgreSQL 16 container for all SCRUM-7 integration tests. Test classes that
 * {@code @Import} this with an identical {@code @SpringBootTest} configuration share one cached Spring context, and
 * therefore one container; Spring Boot manages the container's lifecycle as a bean.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        // Same tag as docker-compose.yml and the other integration tests (ADR 0010).
        return new PostgreSQLContainer("postgres:16-alpine");
    }
}
