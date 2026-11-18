package run.halo.studio.data.exporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.pf4j.RuntimeMode;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.GroupVersionKind;
import run.halo.app.extension.ListResult;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.PageRequest;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.Unstructured;
import run.halo.app.extension.controller.Reconciler;
import run.halo.app.extension.index.IndexedQueryEngine;
import run.halo.app.plugin.PluginContext;
import run.halo.studio.data.extension.ExportColumn;
import run.halo.studio.data.extension.ExportJob;

@SuppressWarnings("removal")
class ExportJobReconcilerTest {

    private static final GroupVersionKind GVK =
        GroupVersionKind.fromAPIVersionAndKind("v1alpha1", "ConfigMap");

    @TempDir
    Path tempDir;

    private final ExtensionClient client = mock(ExtensionClient.class);
    private final IndexedQueryEngine engine = mock(IndexedQueryEngine.class);
    /** Records currently stored, in export order. */
    private final List<String> records = new ArrayList<>();
    private final Map<String, Boolean> deleted = new HashMap<>();
    private ExportArtifactStore artifacts;
    private ExportJobReconciler reconciler;
    private ExportJob job;

    @BeforeEach
    void setUp() {
        artifacts = new ExportArtifactStore(() -> tempDir.resolve("plugins"),
            new PluginContext("data-studio", null, "1.0.0", RuntimeMode.DEPLOYMENT));
        reconciler = new ExportJobReconciler(client, mock(SchemeManager.class), artifacts);
        when(client.indexedQueryEngine()).thenReturn(engine);
        when(engine.retrieveAll(eq(GVK), any(), any()))
            .thenAnswer(invocation -> List.copyOf(records));
        // Page queries reflect the current records, as the index would.
        when(engine.retrieve(eq(GVK), any(), any())).thenAnswer(invocation -> {
            PageRequest page = invocation.getArgument(2);
            var from = Math.min((page.getPageNumber() - 1) * page.getPageSize(), records.size());
            var to = Math.min(from + page.getPageSize(), records.size());
            return new ListResult<>(page.getPageNumber(), page.getPageSize(), records.size(),
                List.copyOf(records.subList(from, to)));
        });
        when(client.fetch(eq(GVK), any())).thenAnswer(invocation -> {
            String name = invocation.getArgument(1);
            return deleted.containsKey(name) ? Optional.empty() : Optional.of(record(name));
        });
        when(client.fetch(eq(ExportJob.class), eq("job"))).thenAnswer(invocation -> Optional.of(job));
    }

    @Test
    void keepsTheStartingSnapshotWhenRecordsAreDeletedDuringTheExport() throws Exception {
        IntStream.range(0, ExportJobReconciler.BATCH_SIZE + 1)
            .forEach(index -> records.add("r%03d".formatted(index)));
        job = job(ExportJob.Format.CSV);

        reconcileUntil(job -> job.getStatus() != null
            && job.getStatus().getProcessed() == ExportJobReconciler.BATCH_SIZE);
        // Someone deletes an already exported record before the second batch.
        records.remove("r000");
        deleted.put("r000", true);
        reconcileUntilDone();

        var lines = Files.readAllLines(file("job.csv"), StandardCharsets.UTF_8);
        assertThat(lines).hasSize(ExportJobReconciler.BATCH_SIZE + 2);
        assertThat(lines.getLast()).isEqualTo("r500");
        assertThat(job.getStatus().getPhase()).isEqualTo(ExportJob.Phase.SUCCEEDED);
        assertThat(file("job.names")).doesNotExist();
    }

    @Test
    void writesValidJsonWhenTheFirstRecordIsGone() throws Exception {
        records.addAll(List.of("a", "b", "c"));
        job = job(ExportJob.Format.JSON);

        reconcileUntil(job -> job.getStatus() != null);
        deleted.put("a", true);
        reconcileUntilDone();

        var json = new ObjectMapper().readTree(file("job.json").toFile());
        assertThat(json).hasSize(2);
        assertThat(json.get(0).path("metadata").path("name").asText()).isEqualTo("b");
    }

    private void reconcileUntilDone() {
        reconcileUntil(job -> job.getStatus() != null
            && job.getStatus().getPhase() == ExportJob.Phase.SUCCEEDED);
        assertThat(job.getStatus().getPhase()).isEqualTo(ExportJob.Phase.SUCCEEDED);
    }

    private void reconcileUntil(java.util.function.Predicate<ExportJob> condition) {
        for (var i = 0; i < 10 && !condition.test(job); i++) {
            reconciler.reconcile(new Reconciler.Request("job"));
            assertThat(job.getStatus() == null ? null : job.getStatus().getMessage()).isNull();
        }
        assertThat(condition.test(job)).isTrue();
    }

    private Path file(String name) {
        return tempDir.resolve("data-studio-private/exports").resolve(name);
    }

    private static ExportJob job(ExportJob.Format format) {
        var job = new ExportJob();
        var metadata = new Metadata();
        metadata.setName("job");
        job.setMetadata(metadata);
        var spec = new ExportJob.Spec();
        spec.setApiVersion("v1alpha1");
        spec.setKind("ConfigMap");
        spec.setFormat(format);
        var column = new ExportColumn();
        column.setField("metadata.name");
        column.setHeader("name");
        spec.setColumns(List.of(column));
        job.setSpec(spec);
        return job;
    }

    private static Unstructured record(String name) {
        return new Unstructured(Map.of(
            "apiVersion", "v1alpha1",
            "kind", "ConfigMap",
            "metadata", Map.of("name", name)));
    }
}
