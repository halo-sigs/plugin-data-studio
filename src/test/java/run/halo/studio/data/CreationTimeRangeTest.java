package run.halo.studio.data;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import run.halo.app.extension.router.selector.SelectorUtil;

class CreationTimeRangeTest {

    private static final Instant AFTER = Instant.parse("2026-10-31T16:00:00Z");
    private static final Instant BEFORE = Instant.parse("2026-11-18T16:00:00Z");

    @Test
    void keepsOptionsWithoutRange() {
        var options = SelectorUtil.labelAndFieldSelectorToListOptions(List.of(), List.of());

        assertThat(CreationTimeRange.apply(options, null, null)).isSameAs(options);
    }

    @Test
    void addsBothBoundsToExistingConditions() {
        var options = SelectorUtil.labelAndFieldSelectorToListOptions(
            List.of("app=halo"), List.of("spec.slug=hello"));

        var condition = CreationTimeRange.apply(options, AFTER, BEFORE).toCondition().toString();

        assertThat(condition)
            .contains("spec.slug", "hello", "app", "halo")
            .contains("metadata.creationTimestamp >= " + AFTER)
            .contains("metadata.creationTimestamp < " + BEFORE);
    }

    @Test
    void leavesMissingBoundOpen() {
        var options = SelectorUtil.labelAndFieldSelectorToListOptions(List.of(), List.of());

        var condition = CreationTimeRange.apply(options, AFTER, null).toCondition().toString();

        assertThat(condition).contains("metadata.creationTimestamp >= " + AFTER)
            .doesNotContain("<");
    }
}
