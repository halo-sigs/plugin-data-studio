package run.halo.studio.data;

import lombok.RequiredArgsConstructor;
import org.springdoc.webflux.core.fn.SpringdocRouteBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;

import java.util.Comparator;

import static org.springdoc.core.fn.builders.apiresponse.Builder.responseBuilder;

@Component
@RequiredArgsConstructor
public class StudioDataEndpoint implements CustomEndpoint {


    private final SchemeManager schemeManager;

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
            .build();
    }

    private Mono<ServerResponse> getSchemes(ServerRequest request) {
        var schemes = schemeManager.schemes().stream()
            .sorted(Comparator.comparing(Scheme::singular))
            .toList();
        return ServerResponse.ok().bodyValue(schemes);
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.datastudio.halo.run", "v1alpha1");
    }
}
