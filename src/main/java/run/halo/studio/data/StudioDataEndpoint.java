package run.halo.studio.data;

import io.swagger.v3.oas.annotations.enums.ParameterIn;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import lombok.RequiredArgsConstructor;
import org.springdoc.webflux.core.fn.SpringdocRouteBuilder;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.GroupVersionKind;
import run.halo.app.extension.ListResult;
import run.halo.app.extension.ReactiveExtensionClient;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.router.SortableRequest;
import run.halo.studio.data.exporting.ExportArtifactStore;
import run.halo.studio.data.extension.ExportJob;

import static org.springdoc.core.fn.builders.apiresponse.Builder.responseBuilder;
import static org.springdoc.core.fn.builders.parameter.Builder.parameterBuilder;

@Component
@RequiredArgsConstructor
public class StudioDataEndpoint implements CustomEndpoint {


    private final SchemeManager schemeManager;
    private final ReactiveExtensionClient client;
    private final ExportArtifactStore artifacts;

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        final var tag = groupVersion().toString() + "/datastudio";
        return SpringdocRouteBuilder.route()
            .GET("schemes", this::getSchemes, builder -> {
                builder.operationId("GetSchemes")
                    .description("Get all schemes.")
                    .tag(tag)
                    .response(responseBuilder().implementation(Scheme.class));
            })
            .GET("records", this::listRecords, builder -> {
                builder.operationId("ListRecords")
                    .description("List records of any model, optionally within a creation time "
                        + "range. Other parameters match the model's own list API.")
                    .tag(tag)
                    .parameter(parameterBuilder().name("apiVersion").in(ParameterIn.QUERY)
                        .required(true).description("API version of the model"))
                    .parameter(parameterBuilder().name("kind").in(ParameterIn.QUERY)
                        .required(true).description("Kind of the model"))
                    .parameter(parameterBuilder().name("createdAfter").in(ParameterIn.QUERY)
                        .description("Inclusive lower bound of metadata.creationTimestamp"))
                    .parameter(parameterBuilder().name("createdBefore").in(ParameterIn.QUERY)
                        .description("Exclusive upper bound of metadata.creationTimestamp"))
                    .response(responseBuilder().implementation(ListResult.class));
                SortableRequest.buildParameters(builder);
            })
            .GET("exports/{name}/download", this::downloadExport, builder -> {
                builder.operationId("DownloadExportFile")
                    .description("Download a completed export file.")
                    .tag(tag)
                    .parameter(parameterBuilder().name("name").in(ParameterIn.PATH).required(true)
                        .description("Export job metadata.name"))
                    .response(responseBuilder().description("The exported file."));
            })
            .build();
    }

    private Mono<ServerResponse> getSchemes(ServerRequest request) {
        var schemes = schemeManager.schemes().stream()
            .sorted(Comparator.comparing(Scheme::singular))
            .toList();
        return ServerResponse.ok().bodyValue(schemes);
    }

    private Mono<ServerResponse> listRecords(ServerRequest request) {
        var apiVersion = request.queryParam("apiVersion").filter(StringUtils::hasText);
        var kind = request.queryParam("kind").filter(StringUtils::hasText);
        if (apiVersion.isEmpty() || kind.isEmpty()) {
            return Mono.error(new ServerWebInputException("apiVersion 和 kind 不能为空"));
        }
        var gvk = GroupVersionKind.fromAPIVersionAndKind(apiVersion.get(), kind.get());
        var scheme = schemeManager.fetch(gvk);
        if (scheme.isEmpty()) {
            return Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "模型不存在"));
        }
        // The same parameters as the model's own list API, plus the creation time range.
        var params = new SortableRequest(request.exchange());
        return Mono.fromCallable(() -> CreationTimeRange.apply(params.toListOptions(),
                instantParam(request, "createdAfter"), instantParam(request, "createdBefore")))
            .flatMap(options -> client.listBy(scheme.get().type(), options,
                params.toPageRequest()))
            .flatMap(result -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(result));
    }

    private static Instant instantParam(ServerRequest request, String name) {
        var value = request.queryParam(name).filter(StringUtils::hasText);
        if (value.isEmpty()) {
            return null;
        }
        try {
            return Instant.parse(value.get());
        } catch (DateTimeParseException e) {
            throw new ServerWebInputException(name + " 不是有效的时间");
        }
    }

    private Mono<ServerResponse> downloadExport(ServerRequest request) {
        var name = request.pathVariable("name");
        return client.fetch(ExportJob.class, name)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND,
                "导出记录不存在")))
            .flatMap(job -> {
                var spec = job.getSpec();
                var status = job.getStatus();
                if (spec == null || spec.getFormat() == null || status == null
                    || status.getPhase() != ExportJob.Phase.SUCCEEDED) {
                    return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT,
                        "导出文件尚未生成或已过期"));
                }
                return artifacts.read(name, spec.getFormat())
                    .onErrorResume(error -> Mono.error(new ResponseStatusException(
                        HttpStatus.GONE, "导出文件不存在或已过期")))
                    .flatMap(resource -> ServerResponse.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + safeFileName(job) + "\"")
                        .contentType(mediaType(spec.getFormat(), status.getMediaType()))
                        .bodyValue(resource));
            });
    }

    private static String safeFileName(ExportJob job) {
        var status = job.getStatus();
        var fileName = status == null ? null : status.getFileName();
        if (!StringUtils.hasText(fileName)) {
            var extension = job.getSpec().getFormat() == ExportJob.Format.CSV ? "csv" : "json";
            fileName = job.getMetadata().getName() + "." + extension;
        }
        return fileName.replaceAll("[\\r\\n\"]", "");
    }

    private static MediaType mediaType(ExportJob.Format format, String value) {
        if (StringUtils.hasText(value)) {
            try {
                return MediaType.parseMediaType(value);
            } catch (RuntimeException ignored) {
                // Fall back to the format default.
            }
        }
        return format == ExportJob.Format.CSV
            ? new MediaType("text", "csv", StandardCharsets.UTF_8) : MediaType.APPLICATION_JSON;
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.datastudio.halo.run", "v1alpha1");
    }
}
