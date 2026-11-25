package com.vinods21.todo;

import com.vinods21.todo.support.AuthTestConfiguration;
import com.vinods21.todo.support.PostgresTestcontainersConfiguration;
import com.vinods21.todo.support.RealHttp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import static com.vinods21.todo.support.RealHttp.assertApiErrorShape;

/**
 * SCRUM-12-AC-10, NFR-01 (design §4.6, ADR 0017): without profile {@code openapi} the application serves no OpenAPI
 * document and no UI — even here, where springdoc IS on the (test) classpath, the fail-safe defaults in
 * {@code application.yml} keep it off. (In the jar springdoc is absent altogether: {@code verify-jar.sh}.) Same
 * configuration as {@code ErrorContractIntegrationTest}, so it shares that cached context.
 */
@Tag("SCRUM-12")
@DisplayName("SCRUM-12 no OpenAPI endpoints without the openapi profile")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestcontainersConfiguration.class, AuthTestConfiguration.class}) // SCRUM-13: in-test JWT issuer
class OpenApiExposureIntegrationTest {

    @LocalServerPort
    private int port;

    private RealHttp http;

    @BeforeEach
    void setUp() {
        http = new RealHttp(port);
    }

    @ParameterizedTest(name = "SCRUM-12-AC-10: GET {0} returns 404 with the ApiError body")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs.yaml", "/v3/api-docs/swagger-config", "/swagger-ui.html",
            "/swagger-ui/index.html"})
    @DisplayName("SCRUM-12-AC-10: OpenAPI document and UI endpoints are off by default (404 with the ApiError body)")
    void openApiEndpointsAreOffByDefault(String path) {
        assertApiErrorShape(http.get(path), 404, path);
    }
}
