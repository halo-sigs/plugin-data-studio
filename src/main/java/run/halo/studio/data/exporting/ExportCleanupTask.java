package run.halo.studio.data.exporting;

import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import run.halo.app.extension.ExtensionClient;
import run.halo.studio.data.extension.ExportJob;

/**
 * Expires downloaded artifacts so exports do not occupy disk space indefinitely.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ExportCleanupTask {

    static final Duration ARTIFACT_TTL = Duration.ofHours(24);
    /** Expired records stay visible in the history for a while, then are deleted. */
    static final Duration RECORD_TTL = Duration.ofDays(30);

    private final ExtensionClient client;
    private final ExportArtifactStore artifacts;

    @Scheduled(initialDelay = 300_000, fixedDelay = 3_600_000)
    public void cleanup() {
        try {
            var now = Instant.now();
            var cutoff = now.minus(ARTIFACT_TTL);
            var recordCutoff = now.minus(RECORD_TTL);
            var expired = 0;
            var deleted = 0;
            for (var job : client.list(ExportJob.class, null, null)) {
                if (deleteRecord(job, recordCutoff)) {
                    deleted++;
                } else if (expire(job, cutoff)) {
                    expired++;
                }
            }
            var abandoned = artifacts.cleanAbandoned(ARTIFACT_TTL);
            if (expired > 0 || deleted > 0 || abandoned > 0) {
                log.info("Expired {} export jobs, deleted {} old records and removed {} "
                    + "abandoned files", expired, deleted, abandoned);
            }
        } catch (RuntimeException e) {
            log.warn("Failed to clean up export artifacts", e);
        }
    }

    private boolean deleteRecord(ExportJob job, Instant cutoff) {
        var status = job.getStatus();
        if (status == null || status.getPhase() != ExportJob.Phase.EXPIRED
            || job.getMetadata().getDeletionTimestamp() != null) {
            return false;
        }
        var completedAt = completedAt(job);
        if (completedAt == null || completedAt.isAfter(cutoff)) {
            return false;
        }
        try {
            client.delete(job);
            return true;
        } catch (RuntimeException e) {
            log.warn("Unable to delete export job {}", job.getMetadata().getName(), e);
            return false;
        }
    }

    private static Instant completedAt(ExportJob job) {
        var completedAt = job.getStatus().getCompletedAt();
        return completedAt != null ? completedAt : job.getMetadata().getCreationTimestamp();
    }

    private boolean expire(ExportJob job, Instant cutoff) {
        var status = job.getStatus();
        if (status == null || status.getPhase() == null) {
            return false;
        }
        if (status.getPhase() == ExportJob.Phase.EXPIRED) {
            return false;
        }
        if (status.getPhase() != ExportJob.Phase.SUCCEEDED
            && status.getPhase() != ExportJob.Phase.FAILED) {
            return false;
        }
        var completedAt = completedAt(job);
        if (completedAt == null || completedAt.isAfter(cutoff)) {
            return false;
        }
        var spec = job.getSpec();
        if (spec != null && spec.getFormat() != null) {
            artifacts.delete(job.getMetadata().getName(), spec.getFormat());
        }
        status.setPhase(ExportJob.Phase.EXPIRED);
        job.setStatus(status);
        try {
            client.update(job);
            return true;
        } catch (RuntimeException e) {
            log.warn("Unable to expire export job {}", job.getMetadata().getName(), e);
            return false;
        }
    }
}
