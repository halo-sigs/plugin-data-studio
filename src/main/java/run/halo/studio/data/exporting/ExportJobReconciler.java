package run.halo.studio.data.exporting;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionUtil;
import run.halo.app.extension.GroupVersionKind;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.Unstructured;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;
import run.halo.app.extension.router.selector.SelectorUtil;
import run.halo.app.infra.utils.JsonUtils;
import run.halo.studio.data.CreationTimeRange;
import run.halo.studio.data.extension.ExportColumn;
import run.halo.studio.data.extension.ExportJob;

/**
 * Runs an export job page by page so large exports do not depend on the console session.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@SuppressWarnings("removal")
public class ExportJobReconciler implements Reconciler<Reconciler.Request> {

    static final String FINALIZER = "data-studio-export-file";
    static final int BATCH_SIZE = 500;
    static final String JSON_HEADER = "[\n";
    private static final Duration NEXT_BATCH_DELAY = Duration.ofMillis(50);
    private static final DateTimeFormatter FILE_TIME =
        DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault());
    private static final ObjectMapper MAPPER = JsonUtils.mapper();

    private final ExtensionClient client;
    private final SchemeManager schemeManager;
    private final ExportArtifactStore artifacts;

    @Override
    public Result reconcile(Request request) {
        return client.fetch(ExportJob.class, request.name())
            .map(job -> {
                try {
                    return reconcileJob(job);
                } catch (OptimisticLockingFailureException e) {
                    return Result.requeue(Duration.ofMillis(500));
                } catch (Exception e) {
                    log.warn("Failed to export job {}", job.getMetadata().getName(), e);
                    return fail(job, userMessage(e));
                }
            })
            .orElseGet(Result::doNotRetry);
    }

    private Result reconcileJob(ExportJob job) {
        if (ExtensionUtil.isDeleted(job)) {
            removeArtifact(job);
            removeFinalizer(job);
            return Result.doNotRetry();
        }
        if (ExtensionUtil.addFinalizers(job.getMetadata(), Set.of(FINALIZER))) {
            client.update(job);
            // Reconcile again with the new resource version before changing the status.
            return Result.requeue(Duration.ofMillis(10));
        }
        var status = job.getStatus();
        if (status != null && isTerminal(status.getPhase())) {
            return Result.doNotRetry();
        }
        if (status == null || status.getPhase() == null
            || status.getPhase() == ExportJob.Phase.PENDING) {
            return start(job);
        }
        return processNextBatch(job);
    }

    private Result start(ExportJob job) {
        var spec = requireSpec(job);
        var format = requireFormat(spec.getFormat());
        var gvk = resolveGvk(spec);
        var columns = normalizeColumns(spec, format);
        var options = listOptions(spec);
        var sort = sortOf(spec.getSorts());

        List<String> names;
        try {
            names = client.indexedQueryEngine().retrieveAll(gvk, options, sort);
        } catch (RuntimeException e) {
            throw new ExportFailure("筛选条件无效或字段未建立索引，请调整后再试", e);
        }
        long total = names.size();

        var jobName = job.getMetadata().getName();
        var status = new ExportJob.Status();
        status.setPhase(ExportJob.Phase.RUNNING);
        status.setTotal(total);
        status.setProcessed(0L);
        status.setStartedAt(Instant.now());
        status.setFileName(fileName(spec, format));
        status.setMediaType(mediaType(format));
        try {
            artifacts.reset(jobName, format, header(format, columns));
            // Later batches read this snapshot, so changes made during the export do not
            // shift records between batches.
            if (total > 0) {
                artifacts.writeNames(jobName, names);
            } else {
                appendJsonEnd(jobName, format, status);
                status.setPhase(ExportJob.Phase.SUCCEEDED);
                status.setCompletedAt(Instant.now());
            }
            status.setBytes(artifacts.size(jobName, format));
        } catch (IOException e) {
            throw new ExportFailure("导出文件写入失败，请检查服务器磁盘空间", e);
        }
        job.setStatus(status);
        client.update(job);
        return total == 0 ? Result.doNotRetry() : Result.requeue(NEXT_BATCH_DELAY);
    }

    private Result processNextBatch(ExportJob job) {
        var spec = requireSpec(job);
        var format = requireFormat(spec.getFormat());
        var gvk = resolveGvk(spec);
        var columns = normalizeColumns(spec, format);
        var options = listOptions(spec);
        var sort = sortOf(spec.getSorts());
        var status = requireStatus(job);
        var jobName = job.getMetadata().getName();

        long written;
        try {
            written = status.getBytes() == null ? 0 : status.getBytes();
            var fileSize = artifacts.size(jobName, format);
            if (fileSize < 0) {
                throw new ExportFailure("导出文件不存在或已被清理", null);
            }
            if (status.getBytes() == null) {
                status.setProcessed(0L);
            }
            if (fileSize < written) {
                throw new ExportFailure("导出文件已损坏，请重新导出", null);
            }
            if (fileSize > written) {
                // The process stopped after writing but before recording the progress.
                artifacts.truncate(jobName, format, written);
            }
        } catch (IOException e) {
            throw new ExportFailure("导出文件读写失败，请检查服务器磁盘空间", e);
        }

        var processed = status.getProcessed() == null ? 0L : status.getProcessed();
        var total = status.getTotal() == null ? 0L : status.getTotal();
        if (processed >= total) {
            finish(job, format);
            return Result.doNotRetry();
        }

        List<String> names;
        try {
            names = artifacts.readNames(jobName, processed, BATCH_SIZE);
        } catch (IOException e) {
            throw new ExportFailure("导出文件不存在或已被清理", e);
        }
        if (names.isEmpty()) {
            finish(job, format);
            return Result.doNotRetry();
        }

        var chunk = new StringBuilder();
        // Records deleted after the snapshot are skipped, so the first object is not
        // necessarily the first name.
        var hasObject = written > JSON_HEADER.length();
        for (var name : names) {
            var item = client.fetch(gvk, name);
            if (item.isEmpty()) {
                continue;
            }
            try {
                chunk.append(line(format, item.get(), columns, hasObject));
            } catch (IOException e) {
                throw new ExportFailure("数据序列化失败，请检查模型数据", e);
            }
            hasObject = true;
        }
        var offset = processed + names.size();
        var done = offset >= total;
        try {
            if (!chunk.isEmpty()) {
                artifacts.append(jobName, format, chunk.toString());
            }
            status.setBytes(artifacts.size(jobName, format));
            if (done) {
                appendJsonEnd(jobName, format, status);
                status.setBytes(artifacts.size(jobName, format));
            }
        } catch (IOException e) {
            throw new ExportFailure("导出文件写入失败，请检查服务器磁盘空间", e);
        }
        status.setProcessed(offset);
        if (done) {
            status.setPhase(ExportJob.Phase.SUCCEEDED);
            status.setCompletedAt(Instant.now());
        }
        job.setStatus(status);
        client.update(job);
        if (done) {
            // Kept until the status is saved, so a conflicting update can retry the batch.
            artifacts.deleteNames(jobName);
        }
        return done ? Result.doNotRetry() : Result.requeue(NEXT_BATCH_DELAY);
    }

    private void finish(ExportJob job, ExportJob.Format format) {
        var status = requireStatus(job);
        try {
            appendJsonEnd(job.getMetadata().getName(), format, status);
            status.setBytes(artifacts.size(job.getMetadata().getName(), format));
        } catch (IOException e) {
            throw new ExportFailure("导出文件写入失败，请检查服务器磁盘空间", e);
        }
        status.setPhase(ExportJob.Phase.SUCCEEDED);
        status.setCompletedAt(Instant.now());
        job.setStatus(status);
        client.update(job);
        artifacts.deleteNames(job.getMetadata().getName());
    }

    private void appendJsonEnd(String jobName, ExportJob.Format format, ExportJob.Status status)
        throws IOException {
        if (format == ExportJob.Format.JSON) {
            artifacts.append(jobName, format, "\n]\n");
        }
    }

    private Result fail(ExportJob job, String message) {
        removeArtifact(job);
        var status = job.getStatus() == null ? new ExportJob.Status() : job.getStatus();
        status.setPhase(ExportJob.Phase.FAILED);
        status.setMessage(message);
        status.setCompletedAt(Instant.now());
        job.setStatus(status);
        try {
            client.update(job);
        } catch (RuntimeException e) {
            log.warn("Unable to mark export job {} as failed", job.getMetadata().getName(), e);
        }
        return Result.doNotRetry();
    }

    private void removeArtifact(ExportJob job) {
        var spec = job.getSpec();
        if (spec == null || spec.getFormat() == null) {
            return;
        }
        artifacts.delete(job.getMetadata().getName(), spec.getFormat());
    }

    private void removeFinalizer(ExportJob job) {
        if (ExtensionUtil.removeFinalizers(job.getMetadata(), Set.of(FINALIZER))) {
            client.update(job);
        }
    }

    private ExportJob.Spec requireSpec(ExportJob job) {
        var spec = job.getSpec();
        if (spec == null) {
            throw new ExportFailure("导出任务缺少配置", null);
        }
        return spec;
    }

    private ExportJob.Status requireStatus(ExportJob job) {
        var status = job.getStatus();
        if (status == null) {
            throw new ExportFailure("导出任务状态异常，请重新导出", null);
        }
        return status;
    }

    private static ExportJob.Format requireFormat(ExportJob.Format format) {
        if (format == null) {
            throw new ExportFailure("导出格式无效", null);
        }
        return format;
    }

    private GroupVersionKind resolveGvk(ExportJob.Spec spec) {
        if (!StringUtils.hasText(spec.getApiVersion()) || !StringUtils.hasText(spec.getKind())) {
            throw new ExportFailure("导出任务缺少目标模型", null);
        }
        var gvk = GroupVersionKind.fromAPIVersionAndKind(spec.getApiVersion(), spec.getKind());
        try {
            schemeManager.get(gvk);
        } catch (RuntimeException e) {
            throw new ExportFailure("目标模型不存在或已被删除", e);
        }
        return gvk;
    }

    private static List<ExportColumn> normalizeColumns(ExportJob.Spec spec,
        ExportJob.Format format) {
        if (format != ExportJob.Format.CSV) {
            return List.of();
        }
        var columns = ExportRows.normalizeColumns(spec.getColumns());
        if (columns.isEmpty()) {
            throw new ExportFailure("CSV 导出至少需要配置一个字段", null);
        }
        return columns;
    }

    private static ListOptions listOptions(ExportJob.Spec spec) {
        try {
            var options = SelectorUtil.labelAndFieldSelectorToListOptions(
                spec.getLabelSelectors(), spec.getFieldSelectors());
            return CreationTimeRange.apply(options, spec.getCreatedAfter(),
                spec.getCreatedBefore());
        } catch (RuntimeException e) {
            throw new ExportFailure("筛选条件无效，请检查字段、标签或排序表达式", e);
        }
    }

    static Sort sortOf(List<String> sorts) {
        var orders = new ArrayList<Sort.Order>();
        if (sorts != null) {
            for (var term : sorts) {
                if (!StringUtils.hasText(term)) {
                    continue;
                }
                var parts = term.split(",", 2);
                var property = parts[0].trim();
                if (property.isEmpty()) {
                    continue;
                }
                var descending = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim());
                orders.add(descending ? Sort.Order.desc(property) : Sort.Order.asc(property));
            }
        }
        if (orders.isEmpty()) {
            orders.add(Sort.Order.desc("metadata.creationTimestamp"));
        }
        var hasName = orders.stream()
            .anyMatch(order -> "metadata.name".equals(order.getProperty()));
        if (!hasName) {
            orders.add(Sort.Order.asc("metadata.name"));
        }
        return Sort.by(orders);
    }

    private static String header(ExportJob.Format format, List<ExportColumn> columns) {
        return format == ExportJob.Format.CSV ? ExportRows.csvHeader(columns) : JSON_HEADER;
    }

    private String line(ExportJob.Format format, Unstructured item, List<ExportColumn> columns,
        boolean hasObject) throws IOException {
        if (format == ExportJob.Format.CSV) {
            return ExportRows.csvLine(item, columns, MAPPER);
        }
        var value = ExportRows.jsonLine(item, MAPPER);
        return hasObject ? ",\n" + value : value;
    }

    private static boolean isTerminal(ExportJob.Phase phase) {
        return phase == ExportJob.Phase.SUCCEEDED
            || phase == ExportJob.Phase.FAILED
            || phase == ExportJob.Phase.EXPIRED;
    }

    private static String fileName(ExportJob.Spec spec, ExportJob.Format format) {
        var kind = spec.getKind().toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9._-]", "-");
        var extension = format == ExportJob.Format.CSV ? "csv" : "json";
        return kind + "-export-" + FILE_TIME.format(Instant.now()) + "." + extension;
    }

    private static String mediaType(ExportJob.Format format) {
        return format == ExportJob.Format.CSV
            ? "text/csv;charset=UTF-8" : "application/json;charset=UTF-8";
    }

    private static String userMessage(Exception error) {
        if (error instanceof ExportFailure failure) {
            return failure.userMessage();
        }
        return "导出失败，请稍后重试";
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder.extension(new ExportJob()).build();
    }

    /**
     * Failure with a message safe to show in the console.
     */
    static class ExportFailure extends RuntimeException {

        private final String userMessage;

        ExportFailure(String userMessage, Throwable cause) {
            super(userMessage, cause);
            this.userMessage = userMessage;
        }

        String userMessage() {
            return userMessage;
        }
    }
}
