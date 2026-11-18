package run.halo.studio.data.exporting;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;
import org.springframework.util.FileSystemUtils;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.halo.app.plugin.PluginContext;
import run.halo.app.plugin.PluginsRootGetter;
import run.halo.studio.data.extension.ExportJob;

/**
 * Stores export files outside the attachment storage so downloads never become public.
 */
@Component
public class ExportArtifactStore {

    private static final String PRIVATE_DIR_SUFFIX = "-private";
    private static final String NAMES_EXTENSION = ".names";

    private final Path directory;

    public ExportArtifactStore(PluginsRootGetter pluginsRoot, PluginContext pluginContext) {
        this.directory = pluginsRoot.get()
            .resolveSibling(pluginContext.getName() + PRIVATE_DIR_SUFFIX)
            .resolve("exports")
            .toAbsolutePath()
            .normalize();
    }

    public void reset(String jobName, ExportJob.Format format, String header) throws IOException {
        Files.createDirectories(directory);
        var path = path(jobName, format);
        Files.writeString(path, header, StandardCharsets.UTF_8,
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE);
    }

    public void append(String jobName, ExportJob.Format format, String content) throws IOException {
        Files.createDirectories(directory);
        Files.writeString(path(jobName, format), content, StandardCharsets.UTF_8,
            StandardOpenOption.CREATE, StandardOpenOption.APPEND, StandardOpenOption.WRITE);
    }

    public long size(String jobName, ExportJob.Format format) throws IOException {
        var path = path(jobName, format);
        return Files.isRegularFile(path) ? Files.size(path) : -1;
    }

    public void truncate(String jobName, ExportJob.Format format, long size) throws IOException {
        try (var channel = FileChannel.open(path(jobName, format), StandardOpenOption.WRITE)) {
            channel.truncate(size);
        }
    }

    /**
     * Saves the names of the records to export, fixing the set when the job starts.
     */
    public void writeNames(String jobName, List<String> names) throws IOException {
        Files.createDirectories(directory);
        Files.write(path(jobName, NAMES_EXTENSION), names, StandardCharsets.UTF_8);
    }

    public List<String> readNames(String jobName, long skip, int limit) throws IOException {
        var path = path(jobName, NAMES_EXTENSION);
        if (!Files.isRegularFile(path)) {
            throw new IOException("Missing record names of export " + jobName);
        }
        try (var lines = Files.lines(path, StandardCharsets.UTF_8)) {
            return lines.skip(skip).limit(limit).toList();
        }
    }

    public void deleteNames(String jobName) {
        deleteQuietly(path(jobName, NAMES_EXTENSION));
    }

    public void delete(String jobName, ExportJob.Format format) {
        deleteQuietly(path(jobName, format));
        deleteNames(jobName);
    }

    /**
     * Removes every export file, used when the plugin is uninstalled.
     */
    public void deleteAll() throws IOException {
        FileSystemUtils.deleteRecursively(directory.getParent());
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Expired or deleted records must not block on an unreadable file.
        }
    }

    public Mono<FileSystemResource> read(String jobName, ExportJob.Format format) {
        return Mono.fromCallable(() -> {
            var path = path(jobName, format);
            if (!Files.isRegularFile(path)) {
                throw new IllegalStateException("EXPORT_FILE_MISSING");
            }
            return new FileSystemResource(path);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * Removes files that are no longer referenced by any job record.
     */
    public int cleanAbandoned(Duration ttl) {
        var cutoff = Instant.now().minus(ttl);
        if (!Files.isDirectory(directory)) {
            return 0;
        }
        var removed = 0;
        try (var files = Files.list(directory)) {
            var iterator = files.iterator();
            while (iterator.hasNext() && removed < 1000) {
                removed += deleteIfOlder(iterator.next(), cutoff);
            }
        } catch (IOException ignored) {
            return removed;
        }
        return removed;
    }

    private int deleteIfOlder(Path file, Instant cutoff) throws IOException {
        if (!Files.isRegularFile(file)
            || !Files.getLastModifiedTime(file).toInstant().isBefore(cutoff)) {
            return 0;
        }
        return Files.deleteIfExists(file) ? 1 : 0;
    }

    private Path path(String jobName, ExportJob.Format format) {
        if (format == null) {
            throw new IllegalStateException("EXPORT_FILE_MISSING");
        }
        return path(jobName, format == ExportJob.Format.CSV ? ".csv" : ".json");
    }

    private Path path(String jobName, String extension) {
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalStateException("EXPORT_FILE_MISSING");
        }
        var resolved = directory.resolve(jobName + extension).normalize();
        if (!directory.equals(resolved.getParent())) {
            throw new IllegalStateException("EXPORT_FILE_MISSING");
        }
        return resolved;
    }
}
