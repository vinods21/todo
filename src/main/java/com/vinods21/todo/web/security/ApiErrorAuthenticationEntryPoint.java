package com.vinods21.todo.web.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;

/**
 * SCRUM-13-AC-19, AC-20 (design §5.4): 401 for a missing, malformed, expired, forged or mis-addressed bearer token.
 * Spring's {@link BearerTokenAuthenticationEntryPoint} sets the status and the RFC 6750 {@code WWW-Authenticate}
 * header ({@code error="invalid_token"} for a rejected token); the body is the ADR 0003 {@code ApiError}.
 */
@Component
public class ApiErrorAuthenticationEntryPoint implements AuthenticationEntryPoint {

    static final String AUTHENTICATION_REQUIRED = "Authentication required";
    static final String INVALID_TOKEN = "Invalid or expired access token";

    private static final Logger log = LoggerFactory.getLogger(ApiErrorAuthenticationEntryPoint.class);

    private final BearerTokenAuthenticationEntryPoint delegate = new BearerTokenAuthenticationEntryPoint();
    private final JsonMapper jsonMapper;

    public ApiErrorAuthenticationEntryPoint(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        AuthenticationException effective = authException;
        if (authException instanceof AuthenticationServiceException) {
            // SCRUM-13-NFR-06: e.g. the JWKS endpoint is unreachable — fail closed. Never log the token itself (NFR-02).
            log.warn("Access token could not be verified on {} {}: {}", request.getMethod(), request.getRequestURI(),
                    authException.getMessage());
            effective = new InvalidBearerTokenException("The access token could not be verified");
        }
        delegate.commence(request, response, effective);
        String message = effective instanceof OAuth2AuthenticationException ? INVALID_TOKEN
                : AUTHENTICATION_REQUIRED;
        ApiErrorResponses.write(jsonMapper, request, response, HttpStatus.UNAUTHORIZED, message);
    }
}
