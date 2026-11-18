package com.vinods21.todo.web;

/**
 * A query parameter has a value that is not allowed (SCRUM-6-AC-07, ADR 0009); mapped to 400
 * {@code Invalid value for parameter '<name>'}. The rejected value is deliberately not kept, so it can never be
 * echoed into a response body (SCRUM-2-AC-14).
 */
public class InvalidQueryParameterException extends RuntimeException {

    private final String parameterName;

    public InvalidQueryParameterException(String parameterName) {
        super("Invalid value for parameter '" + parameterName + "'");
        this.parameterName = parameterName;
    }

    public String getParameterName() {
        return parameterName;
    }
}
