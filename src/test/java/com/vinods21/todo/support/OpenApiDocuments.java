package com.vinods21.todo.support;

import com.github.difflib.DiffUtils;
import com.github.difflib.UnifiedDiffUtils;
import com.github.difflib.patch.Patch;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.dataformat.yaml.YAMLMapper;
import tools.jackson.dataformat.yaml.YAMLWriteFeature;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * SCRUM-12-AC-05, SCRUM-12-NFR-03 (design §4.4, ADR 0017): reads OpenAPI documents and brings them into the one
 * canonical form the committed {@code api/openapi.yaml} is kept in. Canonical = object keys sorted recursively (the
 * top level in the usual OpenAPI order), every {@code required} array sorted, all other arrays in their original
 * order, serialized as YAML with fixed features, LF line ends and exactly one trailing newline. Nothing is stripped.
 */
public final class OpenApiDocuments {

    /** The committed contract (Surefire's working directory is the project base directory). */
    public static final Path COMMITTED = Path.of("api", "openapi.yaml");
    /** Always written by the drift test: what the backend generates, in canonical form. */
    public static final Path GENERATED = Path.of("target", "openapi", "openapi.generated.yaml");
    /** Written by the drift test on drift: unified diff committed → generated. */
    public static final Path DIFF = Path.of("target", "openapi", "openapi.diff");

    private static final List<String> TOP_LEVEL = List.of("openapi", "info", "jsonSchemaDialect", "servers",
            "security", "tags", "paths", "webhooks", "components", "externalDocs");

    private static final Comparator<String> TOP_LEVEL_ORDER = Comparator
            .comparingInt((String key) -> TOP_LEVEL.contains(key) ? TOP_LEVEL.indexOf(key) : TOP_LEVEL.size())
            .thenComparing(Comparator.<String>naturalOrder());

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static final YAMLMapper YAML = YAMLMapper.builder()
            .disable(YAMLWriteFeature.WRITE_DOC_START_MARKER)
            .enable(YAMLWriteFeature.MINIMIZE_QUOTES)
            .enable(YAMLWriteFeature.ALWAYS_QUOTE_NUMBERS_AS_STRINGS) // "200", "1" stay strings
            .disable(YAMLWriteFeature.SPLIT_LINES) // no folded long descriptions
            .build();

    private OpenApiDocuments() {
    }

    public static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("cannot read " + file, e);
        }
    }

    public static void write(Path file, String content) {
        try {
            Path parent = file.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.writeString(file, content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("cannot write " + file, e);
        }
    }

    public static JsonNode readYaml(Path file) {
        return readYamlString(read(file));
    }

    public static JsonNode readYamlString(String yaml) {
        return YAML.readTree(yaml);
    }

    public static JsonNode readJson(String json) {
        return JSON.readTree(json);
    }

    public static String toJson(JsonNode node) {
        return JSON.writeValueAsString(node);
    }

    /** Keys sorted recursively (top level in OpenAPI order, then alphabetical); every "required" array sorted. */
    public static JsonNode canonical(JsonNode node) {
        return canonical(node, true);
    }

    private static JsonNode canonical(JsonNode node, boolean topLevel) {
        if (node.isObject()) {
            List<String> names = new ArrayList<>(node.propertyNames());
            names.sort(topLevel ? TOP_LEVEL_ORDER : Comparator.<String>naturalOrder());
            ObjectNode result = JSON.createObjectNode();
            for (String name : names) {
                JsonNode child = canonical(node.get(name), false);
                if ("required".equals(name) && child.isArray()) {
                    child = sortedStrings(child);
                }
                result.set(name, child);
            }
            return result;
        }
        if (node.isArray()) {
            ArrayNode result = JSON.createArrayNode();
            for (JsonNode element : node.values()) {
                result.add(canonical(element, false));
            }
            return result;
        }
        return node;
    }

    private static JsonNode sortedStrings(JsonNode array) {
        List<JsonNode> elements = new ArrayList<>(array.values());
        if (!elements.stream().allMatch(JsonNode::isString)) {
            return array;
        }
        elements.sort(Comparator.comparing(JsonNode::stringValue));
        ArrayNode result = JSON.createArrayNode();
        elements.forEach(result::add);
        return result;
    }

    /** Canonical YAML text: LF line ends, exactly one trailing newline. */
    public static String toYaml(JsonNode canonical) {
        String yaml = YAML.writeValueAsString(canonical).replace("\r\n", "\n");
        return yaml.stripTrailing() + "\n";
    }

    /** {@code toYaml(canonical(readYamlString(yaml)))}. */
    public static String canonicalYaml(String yaml) {
        return toYaml(canonical(readYamlString(yaml)));
    }

    /** Unified diff (3 lines of context) from {@code original} to {@code revised}; empty when the texts are equal. */
    public static String unifiedDiff(String originalName, String original, String revisedName, String revised) {
        List<String> originalLines = original.lines().toList();
        List<String> revisedLines = revised.lines().toList();
        Patch<String> patch = DiffUtils.diff(originalLines, revisedLines);
        if (patch.getDeltas().isEmpty()) {
            return "";
        }
        return String.join("\n", UnifiedDiffUtils.generateUnifiedDiff(originalName, revisedName, originalLines, patch, 3))
                + "\n";
    }
}
