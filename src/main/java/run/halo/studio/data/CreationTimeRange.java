package run.halo.studio.data;

import java.time.Instant;
import org.springframework.lang.Nullable;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.index.query.Queries;

/**
 * Narrows list options to records created within a time range. Halo's field selectors only
 * support equality, so the range is added as indexed conditions instead.
 */
public final class CreationTimeRange {

    static final String FIELD = "metadata.creationTimestamp";

    private CreationTimeRange() {
    }

    /**
     * Keeps records created in {@code [after, before)}. A null bound leaves that side open.
     */
    public static ListOptions apply(ListOptions options, @Nullable Instant after,
        @Nullable Instant before) {
        if (after == null && before == null) {
            return options;
        }
        var builder = ListOptions.builder(options);
        if (after != null) {
            builder.andQuery(Queries.greaterThan(FIELD, after, true));
        }
        if (before != null) {
            builder.andQuery(Queries.lessThan(FIELD, before, false));
        }
        return builder.build();
    }
}
