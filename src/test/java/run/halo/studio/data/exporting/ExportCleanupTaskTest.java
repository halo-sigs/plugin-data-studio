package run.halo.studio.data.exporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.pf4j.RuntimeMode;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.Metadata;
import run.halo.app.plugin.PluginContext;
import run.halo.studio.data.extension.ExportJob;

class ExportCleanupTaskTest {

    @TempDir
    Path tempDir;

    private final ExtensionClient client = mock(ExtensionClient.class);

    @Test
    void expiresOldFilesAndDeletesOldExpiredRecords() throws Exception {
        var artifacts = new ExportArtifactStore(() -> tempDir.resolve("plugins"),
            new PluginContext("data-studio", null, "1.0.0", RuntimeMode.DEPLOYMENT));
        var finished = job("finished", ExportJob.Phase.SUCCEEDED, Duration.ofHours(25));
        artifacts.reset("finished", ExportJob.Format.CSV, "name\r\n");
        var recent = job("recent", ExportJob.Phase.EXPIRED, Duration.ofDays(29));
        var old = job("old", ExportJob.Phase.EXPIRED, Duration.ofDays(31));
        when(client.list(any(), any(), any())).thenReturn(List.of(finished, recent, old));

        new ExportCleanupTask(client, artifacts).cleanup();

        assertThat(finished.getStatus().getPhase()).isEqualTo(ExportJob.Phase.EXPIRED);
        assertThat(artifacts.size("finished", ExportJob.Format.CSV)).isEqualTo(-1);
        verify(client).update(finished);
        verify(client).delete(old);
        verify(client, never()).delete(recent);
        verify(client, never()).update(recent);
    }

    @Test
    void removesAllFilesOnUninstall() throws Exception {
        var artifacts = new ExportArtifactStore(() -> tempDir.resolve("plugins"),
            new PluginContext("data-studio", null, "1.0.0", RuntimeMode.DEPLOYMENT));
        artifacts.reset("job", ExportJob.Format.JSON, "[\n");
        artifacts.writeNames("job", List.of("a"));

        artifacts.deleteAll();

        assertThat(tempDir.resolve("data-studio-private")).doesNotExist();
    }

    private static ExportJob job(String name, ExportJob.Phase phase, Duration age) {
        var job = new ExportJob();
        var metadata = new Metadata();
        metadata.setName(name);
        job.setMetadata(metadata);
        var spec = new ExportJob.Spec();
        spec.setFormat(ExportJob.Format.CSV);
        job.setSpec(spec);
        var status = new ExportJob.Status();
        status.setPhase(phase);
        status.setCompletedAt(Instant.now().minus(age));
        job.setStatus(status);
        return job;
    }
}
