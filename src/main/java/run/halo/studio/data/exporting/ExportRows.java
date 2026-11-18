package run.halo.studio.data.exporting;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.util.StringUtils;
import run.halo.app.extension.Unstructured;
import run.halo.studio.data.extension.ExportColumn;

/**
 * Renders exported records as CSV rows or compact JSON lines.
 */
public final class ExportRows {

    static final String CSV_BOM = "\uFEFF";
    static final String CSV_LINE_END = "\r\n";

    private ExportRows() {
    }

    public static List<ExportColumn> normalizeColumns(List<ExportColumn> columns) {
        if (columns == null) {
            return List.of();
        }
        return columns.stream()
            .filter(column -> column != null && StringUtils.hasText(column.getField()))
            .map(column -> {
                var normalized = new ExportColumn();
                normalized.setField(column.getField().trim());
                normalized.setHeader(
                    StringUtils.hasText(column.getHeader())
                        ? column.getHeader().trim() : normalized.getField());
                return normalized;
            })
            .toList();
    }

    public static String csvHeader(List<ExportColumn> columns) {
        var headers = columns.stream()
            .map(column -> neutralizeFormula(column.getHeader()))
            .collect(Collectors.toList());
        return CSV_BOM + joinCsv(headers) + CSV_LINE_END;
    }

    public static String csvLine(Unstructured item, List<ExportColumn> columns,
        ObjectMapper mapper) throws JsonProcessingException {
        var root = mapper.valueToTree(item.getData());
        var values = new ArrayList<String>(columns.size());
        for (var column : columns) {
            values.add(csvValue(at(root, column.getField()), mapper));
        }
        return joinCsv(values) + CSV_LINE_END;
    }

    public static String jsonLine(Unstructured item, ObjectMapper mapper)
        throws JsonProcessingException {
        return mapper.writeValueAsString(item.getData());
    }

    static JsonNode at(JsonNode root, String path) {
        if (root == null || !StringUtils.hasText(path)) {
            return null;
        }
        JsonNode current = root;
        for (var token : path.trim().split("\\.")) {
            if (!StringUtils.hasText(token)) {
                return null;
            }
            if (current.isArray()) {
                if (!token.matches("\\d+")) {
                    return null;
                }
                current = current.path(Integer.parseInt(token));
            } else {
                current = current.path(token);
            }
            if (current.isMissingNode() || current.isNull()) {
                return null;
            }
        }
        return current;
    }

    static String csvValue(JsonNode value, ObjectMapper mapper) throws JsonProcessingException {
        if (value == null || value.isNull() || value.isMissingNode()) {
            return "";
        }
        if (value.isTextual()) {
            return neutralizeFormula(value.asText());
        }
        if (value.isValueNode()) {
            return value.asText();
        }
        return mapper.writeValueAsString(value);
    }

    /**
     * Keeps spreadsheets from evaluating text as a formula (CSV injection). Numbers and
     * serialized objects are left as is because they cannot start a formula.
     */
    static String neutralizeFormula(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return switch (value.charAt(0)) {
            case '=', '+', '-', '@', '\t', '\r' -> "'" + value;
            default -> value;
        };
    }

    static String joinCsv(List<String> values) {
        return values.stream().map(ExportRows::csvEscape).collect(Collectors.joining(","));
    }

    static String csvEscape(String value) {
        if (value == null) {
            return "";
        }
        if (value.indexOf(',') >= 0 || value.indexOf('"') >= 0
            || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
            return '"' + value.replace("\"", "\"\"") + '"';
        }
        return value;
    }
}
