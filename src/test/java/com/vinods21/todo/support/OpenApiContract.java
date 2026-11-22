package com.vinods21.todo.support;

import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.dialect.Dialects;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * SCRUM-12-AC-03, AC-04 (design §4.5 (3), ADR 0017): checks a real HTTP response against an OpenAPI 3.1 document —
 * documented operation, documented status, required headers, empty body where no content is documented, documented
 * media type and a schema-valid body (networknt json-schema-validator, OpenAPI 3.1 dialect, Jackson 3).
 * <p>
 * Object schemas are <b>closed</b> ({@code additionalProperties: false}) on an in-memory copy only: the backend must
 * not send properties the contract does not declare, while the committed document keeps the usual "additive response
 * property = non-breaking" semantics for other consumers. Every message starts with
 * {@code METHOD /template (operationId) status:} (SCRUM-12-NFR-04).
 */
public final class OpenApiContract {

    /** Base IRI the closed copy is registered under. Never fetched: the registry serves it from memory. */
    private static final String IRI = "https://contract.todo.invalid/openapi.json";
    private static final String SCHEMA_REF_PREFIX = "#/components/schemas/";
    private static final Set<String> METHODS = Set.of("get", "put", "post", "delete", "options", "head", "patch",
            "trace");

    private final List<Operation> operations;
    private final List<String> documentProblems;
    private final SchemaRegistry registry;
    private final Map<String, Schema> schemas = new ConcurrentHashMap<>();

    private record Operation(String method, String template, Pattern pattern, int literalSegments,
            String operationId, JsonNode responses) {
    }

    /** Loads the committed document, e.g. {@link OpenApiDocuments#COMMITTED}. */
    public static OpenApiContract load(Path yaml) {
        return new OpenApiContract(OpenApiDocuments.readYaml(yaml));
    }

    /** Package-private so unit tests can pass tampered documents. */
    OpenApiContract(JsonNode document) {
        List<String> problems = new ArrayList<>();
        this.operations = operations(document, problems);
        this.documentProblems = List.copyOf(problems);
        JsonNode closed = document.deepCopy();
        JsonNode componentSchemas = closed.path("components").path("schemas");
        for (JsonNode schema : componentSchemas.values()) {
            close(schema);
        }
        String json = OpenApiDocuments.toJson(closed);
        SchemaRegistryConfig config = SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build();
        this.registry = SchemaRegistry.withDialect(Dialects.getOpenApi31(),
                builder -> builder.schemas(Map.of(IRI, json)).schemaRegistryConfig(config));
    }

    private static List<Operation> operations(JsonNode document, List<String> problems) {
        List<Operation> result = new ArrayList<>();
        for (Map.Entry<String, JsonNode> path : document.path("paths").properties()) {
            String template = path.getKey();
            for (Map.Entry<String, JsonNode> entry : path.getValue().properties()) {
                String method = entry.getKey().toLowerCase(Locale.ROOT);
                if (!METHODS.contains(method)) {
                    continue; // path-level "parameters", "summary", ...
                }
                JsonNode operation = entry.getValue();
                String operationId = operation.path("operationId").asString("");
                String label = method.toUpperCase(Locale.ROOT) + " " + template + " (" + operationId + ")";
                JsonNode responses = operation.path("responses");
                for (Map.Entry<String, JsonNode> response : responses.properties()) {
                    String status = response.getKey();
                    if ("default".equals(status)) {
                        problems.add(label + ": 'default' responses are not supported (status codes must be explicit)");
                    } else if (!status.matches("[1-5][0-9][0-9]")) {
                        problems.add(label + ": status range or invalid status '" + status + "' is not supported");
                    }
                    if (response.getValue().has("$ref")) {
                        problems.add(label + " " + status + ": response $ref is not supported");
                    }
                    for (Map.Entry<String, JsonNode> media : response.getValue().path("content").properties()) {
                        JsonNode schema = media.getValue().path("schema");
                        String ref = schema.path("$ref").asString("");
                        if (!ref.startsWith(SCHEMA_REF_PREFIX) || schema.size() != 1) {
                            problems.add(label + " " + status + " " + media.getKey()
                                    + ": inline response schemas are not supported (use a $ref to #/components/schemas)");
                        }
                    }
                }
                StringBuilder regex = new StringBuilder();
                int literals = 0;
                for (String segment : template.split("/", -1)) {
                    if (!regex.isEmpty() || !segment.isEmpty()) {
                        regex.append('/');
                    }
                    if (segment.startsWith("{") && segment.endsWith("}")) {
                        regex.append("[^/]+");
                    } else if (!segment.isEmpty()) {
                        regex.append(Pattern.quote(segment));
                        literals++;
                    }
                }
                result.add(new Operation(method, template, Pattern.compile(regex.toString()), literals, operationId,
                        responses));
            }
        }
        // "literal segments win": /api/tasks/{id}/status before a hypothetical /api/tasks/{id}/{x}
        result.sort(Comparator.comparingInt(Operation::literalSegments).reversed());
        return List.copyOf(result);
    }

    /** additionalProperties: false on every object schema with properties that does not decide it itself. */
    private static void close(JsonNode schema) {
        if (!(schema instanceof ObjectNode object)) {
            return;
        }
        if (object.has("properties") && !object.has("additionalProperties") && !object.has("unevaluatedProperties")) {
            object.put("additionalProperties", false);
        }
        for (JsonNode property : object.path("properties").values()) {
            close(property);
        }
        close(object.get("items"));
        close(object.get("not"));
        for (String keyword : List.of("allOf", "anyOf", "oneOf", "prefixItems")) {
            for (JsonNode branch : object.path(keyword).values()) {
                close(branch);
            }
        }
    }

    /** Documented constructs this checker cannot match exactly (default responses, ranges, inline schemas). */
    public List<String> documentProblems() {
        return documentProblems;
    }

    /** operationId of the documented operation matching {@code method} + the path of {@code uri}, or null. */
    public String operationId(HttpMethod method, String uri) {
        return find(method, uri).map(Operation::operationId).orElse(null);
    }

    /** Every documented {@code "<operationId> <status>"} pair. */
    public Set<String> documentedResponses() {
        Set<String> result = new TreeSet<>();
        for (Operation operation : operations) {
            for (String status : operation.responses().propertyNames()) {
                result.add(operation.operationId() + " " + status);
            }
        }
        return result;
    }

    /** Every documented {@code "METHOD /template"}. */
    public Set<String> documentedEndpoints() {
        return operations.stream()
                .map(o -> o.method().toUpperCase(Locale.ROOT) + " " + o.template())
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private Optional<Operation> find(HttpMethod method, String uri) {
        String path = pathOf(uri);
        String name = method.name().toLowerCase(Locale.ROOT);
        return operations.stream()
                .filter(o -> o.method().equals(name) && o.pattern().matcher(path).matches())
                .findFirst();
    }

    private static String pathOf(String uri) {
        String withoutQuery = uri.split("[?#]", 2)[0];
        // absolute URIs (http://host:port/api/...) → path only
        int scheme = withoutQuery.indexOf("://");
        if (scheme >= 0) {
            int slash = withoutQuery.indexOf('/', scheme + 3);
            return slash >= 0 ? withoutQuery.substring(slash) : "/";
        }
        return withoutQuery;
    }

    /** All violations of the response against the document; empty when it conforms. */
    public List<String> violations(HttpMethod method, String uri, int status, HttpHeaders headers, String body) {
        List<String> violations = new ArrayList<>();
        documentProblems.forEach(p -> violations.add("document: " + p));
        Optional<Operation> found = find(method, uri);
        if (found.isEmpty()) {
            violations.add("undocumented operation " + method.name() + " " + pathOf(uri));
            return violations;
        }
        Operation operation = found.get();
        String prefix = method.name() + " " + operation.template() + " (" + operation.operationId() + ") " + status
                + ": ";
        JsonNode response = operation.responses().get(Integer.toString(status));
        if (response == null) {
            violations.add(prefix + "undocumented status " + status + " (documented: "
                    + String.join(", ", new TreeSet<>(operation.responses().propertyNames())) + ")");
            return violations;
        }
        for (Map.Entry<String, JsonNode> header : response.path("headers").properties()) {
            if (header.getValue().path("required").asBoolean(false) && headers.getFirst(header.getKey()) == null) {
                violations.add(prefix + "missing required header " + header.getKey());
            }
        }
        JsonNode content = response.path("content");
        boolean hasBody = body != null && !body.isEmpty();
        if (content.isEmpty()) {
            if (hasBody) {
                violations.add(prefix + "undocumented response body (no content documented): " + abbreviate(body));
            }
            return violations;
        }
        if (!hasBody) {
            violations.add(prefix + "missing response body (documented: " + String.join(", ", content.propertyNames())
                    + ")");
            return violations;
        }
        MediaType contentType = headers.getContentType();
        String mediaType = contentType == null ? "<none>" : contentType.getType() + "/" + contentType.getSubtype();
        JsonNode media = content.get(mediaType);
        if (media == null) {
            violations.add(prefix + "undocumented Content-Type " + mediaType + " (documented: "
                    + String.join(", ", content.propertyNames()) + ")");
            return violations;
        }
        String ref = media.path("schema").path("$ref").asString("");
        if (!ref.startsWith(SCHEMA_REF_PREFIX)) {
            violations.add(prefix + "no $ref schema documented for " + mediaType);
            return violations;
        }
        List<com.networknt.schema.Error> errors;
        try {
            errors = schema(ref).validate(body, InputFormat.JSON);
        } catch (RuntimeException e) {
            violations.add(prefix + "body is not valid JSON (" + e.getClass().getSimpleName() + "): " + abbreviate(body));
            return violations;
        }
        for (com.networknt.schema.Error error : errors) {
            violations.add(prefix + "schema " + ref.substring(SCHEMA_REF_PREFIX.length()) + ": " + error);
        }
        return violations;
    }

    /** Fails with every violation, one per line. */
    public void assertConforms(HttpMethod method, String uri, ResponseEntity<String> response) {
        List<String> violations = violations(method, uri, response.getStatusCode().value(), response.getHeaders(),
                response.getBody());
        if (!violations.isEmpty()) {
            throw new AssertionError("SCRUM-12-AC-03: response of " + method.name() + " " + uri
                    + " does not conform to api/openapi.yaml:\n  " + String.join("\n  ", violations)
                    + "\nbody: " + abbreviate(response.getBody()));
        }
    }

    private Schema schema(String ref) {
        return schemas.computeIfAbsent(ref, r -> registry.getSchema(SchemaLocation.of(IRI + r)));
    }

    private static String abbreviate(String text) {
        if (text == null) {
            return "<none>";
        }
        return text.length() <= 500 ? text : text.substring(0, 500) + "…";
    }
}
