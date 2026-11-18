package run.halo.studio.data.extension;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "datastudio.halo.run", version = "v1alpha1",
    kind = "QueryPreset", plural = "querypresets", singular = "querypreset")
public class QueryPreset extends AbstractExtension {

    private static final String DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

    @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    private Spec spec;

    @Data
    public static class Spec {

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "Display name of the query preset")
        private String displayName;

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "API version of the target model, e.g. content.halo.run/v1alpha1")
        private String apiVersion;

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "Kind of the target model, e.g. Post")
        private String kind;

        @Schema(description = "Field selectors, one expression per entry")
        private List<String> fieldSelectors;

        @Schema(description = "Label selectors, one expression per entry")
        private List<String> labelSelectors;

        @Schema(description = "Sort expressions, e.g. metadata.creationTimestamp,desc")
        private List<String> sorts;

        @Schema(description = "Creation date range, in the viewer's local dates")
        private DateRange createdRange;

        @Schema(description = "Export settings used when exporting with this preset")
        private Export export;
    }

    @Data
    public static class DateRange {

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, pattern = DATE_PATTERN,
            description = "First day, inclusive, e.g. 2026-11-01")
        private String start;

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, pattern = DATE_PATTERN,
            description = "Last day, inclusive, e.g. 2026-11-30")
        private String end;
    }

    @Data
    public static class Export {

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "Export format: CSV or JSON")
        private ExportJob.Format format;

        @Schema(description = "CSV columns. Ignored for JSON exports")
        private List<ExportColumn> columns;
    }
}
