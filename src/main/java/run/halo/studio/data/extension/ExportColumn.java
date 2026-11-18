package run.halo.studio.data.extension;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * A CSV output column: the field path read from the exported resource and its header.
 */
@Data
public class ExportColumn {

    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "Field path of the exported resource, e.g. metadata.name or spec.slug")
    private String field;

    @Schema(description = "CSV header. Defaults to the field path when blank")
    private String header;
}
