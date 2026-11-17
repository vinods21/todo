# ADR 0003 — Single custom JSON error body via a global @RestControllerAdvice

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) — SCRUM-2-AC-08, AC-10..AC-14

## Context

AC-13 requires one error shape for 400/404/405/415/500 with `timestamp`, `status`, `error`, `message`, `path`
and `fieldErrors[{field, message}]` listing every invalid field. RFC 9457 Problem Details is allowed if these
fields are present. AC-14 forbids leaking stack traces, SQL or class names.

## Decision

- Use a custom record `ApiError(timestamp, status, error, message, path, fieldErrors)` rather than
  `ProblemDetail`; field names exactly match AC-13 and the React client gets a flat, predictable shape.
  `fieldErrors` is always present (empty list when not a validation error).
- `GlobalExceptionHandler` is a `@RestControllerAdvice` extending `ResponseEntityExceptionHandler`, overriding
  `handleExceptionInternal` so every Spring MVC exception (405, 415, 404 no-resource, unreadable body, type
  mismatch, …) is rendered as `ApiError`, plus explicit handlers for `TaskNotFoundException` (404),
  `MethodArgumentNotValidException` / `HandlerMethodValidationException` (400 with all field errors) and a
  catch-all `Exception` (500).
- Messages come from our own templates; raw exception messages (Jackson, JDBC) are never copied to the body.
  500 responses always say `An unexpected error occurred`; details are logged server-side only.
- `server.error.include-stacktrace=never`, `server.error.include-message=never` as backstop.

## Consequences

- One place to change error behaviour; web-layer tests assert the shape for each status.
- Not RFC 9457 `application/problem+json`; switching later is a contained change in the handler.
- Jackson type errors report one field at a time (deserialization stops at the first error).
