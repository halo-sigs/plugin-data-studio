package run.halo.studio.data.exporting;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import run.halo.app.extension.Unstructured;
import run.halo.studio.data.extension.ExportColumn;

class ExportRowsTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void normalizesColumnsAndDefaultsHeaders() {
        var blank = new ExportColumn();
        blank.setField("  ");
        var noHeader = column("spec.slug", null);
        var header = column(" metadata.name ", " 名称 ");

        var columns = ExportRows.normalizeColumns(List.of(blank, noHeader, header));

        assertThat(columns).hasSize(2);
        assertThat(columns.get(0).getField()).isEqualTo("spec.slug");
        assertThat(columns.get(0).getHeader()).isEqualTo("spec.slug");
        assertThat(columns.get(1).getField()).isEqualTo("metadata.name");
        assertThat(columns.get(1).getHeader()).isEqualTo("名称");
    }

    @Test
    void writesBomAndEscapesCsvHeaders() {
        var header = ExportRows.csvHeader(
            List.of(column("metadata.name", "名,称"), column("spec.slug", "标\"题")));

        assertThat(header)
            .isEqualTo(ExportRows.CSV_BOM + "\"名,称\",\"标\"\"题\"\r\n");
    }

    @Test
    void extractsNestedFieldsAndSerializesComplexValues() throws Exception {
        var item = new Unstructured(Map.of(
            "apiVersion", "content.halo.run/v1alpha1",
            "kind", "Post",
            "metadata", Map.of("name", "post-1"),
            "spec", Map.of(
                "tags", List.of("a", "b"),
                "excerpt", Map.of("raw", "a,b"),
                "published", true)));

        var line = ExportRows.csvLine(item, List.of(
            column("metadata.name", "名称"),
            column("spec.excerpt.raw", "摘要"),
            column("spec.tags", "标签"),
            column("spec.tags.0", "第一个标签"),
            column("spec.published", "已发布"),
            column("spec.missing", "缺失")), mapper);

        assertThat(line).isEqualTo(
            "post-1,\"a,b\",\"[\"\"a\"\",\"\"b\"\"]\",a,true,\r\n");
    }

    @Test
    void neutralizesFormulasInTextButKeepsNumbers() throws Exception {
        var item = new Unstructured(Map.of(
            "apiVersion", "v1alpha1",
            "kind", "ConfigMap",
            "metadata", Map.of("name", "config"),
            "data", Map.of(
                "sum", "=1+2",
                "cmd", "+cmd|' /C calc'!A0",
                "dash", "-2+3",
                "at", "@SUM(A1)",
                "tab", "\tx",
                "plain", "a=b",
                "negative", -5)));

        var line = ExportRows.csvLine(item, List.of(
            column("data.sum", null), column("data.cmd", null), column("data.dash", null),
            column("data.at", null), column("data.tab", null), column("data.plain", null),
            column("data.negative", null)), mapper);

        assertThat(line).isEqualTo(
            "'=1+2,'+cmd|' /C calc'!A0,'-2+3,'@SUM(A1),'\tx,a=b,-5\r\n");
        assertThat(ExportRows.csvHeader(List.of(column("a", "=HYPERLINK(\"x\")"))))
            .isEqualTo(ExportRows.CSV_BOM + "\"'=HYPERLINK(\"\"x\"\")\"\r\n");
    }

    @Test
    void writesCompactJsonLines() throws Exception {
        var item = new Unstructured(Map.of(
            "apiVersion", "v1alpha1",
            "kind", "ConfigMap",
            "metadata", Map.of("name", "config")));

        var json = mapper.readTree(ExportRows.jsonLine(item, mapper));
        assertThat(json.path("apiVersion").asText()).isEqualTo("v1alpha1");
        assertThat(json.path("kind").asText()).isEqualTo("ConfigMap");
        assertThat(json.path("metadata").path("name").asText()).isEqualTo("config");
    }

    private static ExportColumn column(String field, String header) {
        var column = new ExportColumn();
        column.setField(field);
        column.setHeader(header);
        return column;
    }
}
