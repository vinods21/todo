package com.vinods21.todo.web.error;

import com.vinods21.todo.service.TaskNotFoundException;
import com.vinods21.todo.web.InvalidQueryParameterException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.exc.StreamReadException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Maps every exception to the standard {@link ApiError} body (SCRUM-2-AC-08, AC-10..AC-14, ADR 0003).
 * Messages are built from our own templates; raw exception messages (Jackson, JDBC, ...) are never copied
 * into a response body (SCRUM-2-AC-14).
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    static final String VALIDATION_FAILED = "Validation failed";
    static final String MALFORMED_JSON = "Malformed JSON request";
    static final String UNEXPECTED_ERROR = "An unexpected error occurred";

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(TaskNotFoundException.class)
    public ResponseEntity<ApiError> handleTaskNotFound(TaskNotFoundException ex, HttpServletRequest request) {
        ApiError body = ApiError.of(HttpStatus.NOT_FOUND, "Task with id " + ex.getId() + " not found",
                request.getRequestURI(), List.of());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    /**
     * SCRUM-6-AC-07: a query parameter with a disallowed value; same message and shape as
     * {@link #handleTypeMismatch} so clients see one format for bad query parameters.
     */
    @ExceptionHandler(InvalidQueryParameterException.class)
    public ResponseEntity<ApiError> handleInvalidQueryParameter(InvalidQueryParameterException ex,
            HttpServletRequest request) {
        ApiError body = ApiError.of(HttpStatus.BAD_REQUEST, "Invalid value for parameter '" + ex.getParameterName() + "'",
                request.getRequestURI(), List.of());
        return ResponseEntity.badRequest().body(body);
    }

    /** SCRUM-2-AC-14: generic 500, details logged server-side only. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unexpected error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        ApiError body = ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR, UNEXPECTED_ERROR, request.getRequestURI(),
                List.of());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    /** SCRUM-2-AC-10, AC-13: every invalid body field is listed. */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldErrorItem> fieldErrors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.add(new FieldErrorItem(fieldError.getField(), fieldError.getDefaultMessage()));
        }
        fieldErrors.sort(Comparator.comparing(FieldErrorItem::field));
        ApiError body = ApiError.of(status, VALIDATION_FAILED, path(request), fieldErrors);
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    /** SCRUM-2-AC-05 / A-07: invalid {@code page}/{@code size} query parameters. */
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldErrorItem> fieldErrors = new ArrayList<>();
        for (ParameterValidationResult result : ex.getParameterValidationResults()) {
            String name = parameterName(result.getMethodParameter());
            for (MessageSourceResolvable error : result.getResolvableErrors()) {
                fieldErrors.add(new FieldErrorItem(name, error.getDefaultMessage()));
            }
        }
        fieldErrors.sort(Comparator.comparing(FieldErrorItem::field));
        ApiError body = ApiError.of(status, VALIDATION_FAILED, path(request), fieldErrors);
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    /** SCRUM-2-AC-11: malformed JSON, unknown enum value, invalid date. */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String message = MALFORMED_JSON;
        List<FieldErrorItem> fieldErrors = List.of();
        JacksonException jacksonException = findCause(ex, JacksonException.class);
        if (jacksonException != null && !(jacksonException instanceof StreamReadException)) {
            String field = fieldPath(jacksonException);
            if (!field.isEmpty()) {
                message = "Invalid value for field '" + field + "'";
                fieldErrors = List.of(new FieldErrorItem(field, "invalid value"));
            }
        }
        ApiError body = ApiError.of(status, message, path(request), fieldErrors);
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    /** SCRUM-2-AC-12: e.g. non-numeric path id or query parameter. */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        String name = ex instanceof MethodArgumentTypeMismatchException mismatch ? mismatch.getName()
                : ex.getPropertyName();
        ApiError body = ApiError.of(status, "Invalid value for parameter '" + name + "'", path(request), List.of());
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    /**
     * Single funnel for all Spring MVC exceptions handled by the base class (405, 415, 404 no-resource, ...):
     * replaces any ProblemDetail/null body with an {@link ApiError} (SCRUM-2-AC-13).
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
            HttpStatusCode statusCode, WebRequest request) {
        Object apiBody = body;
        if (!(body instanceof ApiError)) {
            if (statusCode.is5xxServerError()) {
                log.error("Request processing failed on {}", path(request), ex);
            }
            apiBody = ApiError.of(statusCode, messageFor(ex, statusCode, request), path(request), List.of());
        }
        return super.handleExceptionInternal(ex, apiBody, headers, statusCode, request);
    }

    private static String messageFor(Exception ex, HttpStatusCode status, WebRequest request) {
        if (status.is5xxServerError()) {
            return UNEXPECTED_ERROR;
        }
        if (ex instanceof HttpRequestMethodNotSupportedException e) {
            return "Request method '" + e.getMethod() + "' is not supported";
        }
        if (ex instanceof HttpMediaTypeNotSupportedException e) {
            return "Content type '" + Objects.toString(e.getContentType(), "") + "' is not supported";
        }
        if (ex instanceof NoResourceFoundException || ex instanceof NoHandlerFoundException) {
            return "No endpoint " + method(request) + " " + path(request);
        }
        if (ex instanceof MissingServletRequestParameterException e) {
            return "Required parameter '" + e.getParameterName() + "' is missing";
        }
        HttpStatus resolved = HttpStatus.resolve(status.value());
        return resolved != null ? resolved.getReasonPhrase() : "Request failed";
    }

    private static String parameterName(MethodParameter parameter) {
        RequestParam requestParam = parameter.getParameterAnnotation(RequestParam.class);
        if (requestParam != null) {
            if (!requestParam.name().isEmpty()) {
                return requestParam.name();
            }
            if (!requestParam.value().isEmpty()) {
                return requestParam.value();
            }
        }
        String name = parameter.getParameterName();
        return name != null ? name : "arg" + parameter.getParameterIndex();
    }

    private static String fieldPath(JacksonException ex) {
        return ex.getPath().stream()
                .map(JacksonException.Reference::getPropertyName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining("."));
    }

    private static <T extends Throwable> T findCause(Throwable ex, Class<T> type) {
        Throwable current = ex;
        while (current != null) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause() == current ? null : current.getCause();
        }
        return null;
    }

    private static String path(WebRequest request) {
        if (request instanceof ServletWebRequest servletWebRequest) {
            return servletWebRequest.getRequest().getRequestURI();
        }
        return "";
    }

    private static String method(WebRequest request) {
        if (request instanceof ServletWebRequest servletWebRequest) {
            return servletWebRequest.getRequest().getMethod();
        }
        return "";
    }
}
