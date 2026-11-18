package run.halo.studio.data.extension;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

/**
 * A background export job. The spec is written by the console, the status by the reconciler.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "datastudio.halo.run", version = "v1alpha1",
    kind = "ExportJob", plural = "exportjobs", singular = "exportjob")
public class ExportJob extends AbstractExtension {

    public enum Format {
        CSV, JSON
    }

    public enum Phase {
        PENDING, RUNNING, SUCCEEDED, FAILED, EXPIRED
    }

    @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    private Spec spec;

    @Schema
    private Status status;

    @Data
    public static class Spec {

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "API version of the target model, e.g. content.halo.run/v1alpha1")
        private String apiVersion;

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "Kind of the target model, e.g. Post")
        private String kind;

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
            description = "Export format: CSV or JSON")
        private Format format;

        @Schema(description = "CSV columns. Ignored for JSON exports")
        private List<ExportColumn> columns;

        @Schema(description = "Field selectors, one expression per entry")
        private List<String> fieldSelectors;

        @Schema(description = "Label selectors, one expression per entry")
        private List<String> labelSelectors;

        @Schema(description = "Sort expressions, e.g. metadata.creationTimestamp,desc")
        private List<String> sorts;

        @Schema(description = "Inclusive lower bound of metadata.creationTimestamp")
        private Instant createdAfter;

        @Schema(description = "Exclusive upper bound of metadata.creationTimestamp")
        private Instant createdBefore;
    }

    @Data
    public static class Status {

        @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        private Phase phase;

        @Schema(description = "Total number of matched records when the job started")
        private Long total;

        @Schema(description = "Number of records written so far")
        private Long processed;

        @Schema(description = "Committed byte size of the exported file")
        private Long bytes;

        @Schema(description = "Download filename shown to the user")
        private String fileName;

        @Schema(description = "Content type of the exported file")
        private String mediaType;

        @Schema(description = "User-facing failure reason")
        private String message;

        @Schema
        private Instant startedAt;

        @Schema
        private Instant completedAt;
    }
}
