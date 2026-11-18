package run.halo.studio.data;

import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.index.IndexSpecs;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;
import run.halo.studio.data.exporting.ExportArtifactStore;
import run.halo.studio.data.extension.ExportJob;
import run.halo.studio.data.extension.QueryPreset;

@Slf4j
@Component
public class StudioDataPlugin extends BasePlugin {

    private final SchemeManager schemeManager;
    private final ExportArtifactStore artifacts;

    public StudioDataPlugin(PluginContext pluginContext, SchemeManager schemeManager,
        ExportArtifactStore artifacts) {
        super(pluginContext);
        this.schemeManager = schemeManager;
        this.artifacts = artifacts;
    }

    @Override
    public void start() {
        schemeManager.register(QueryPreset.class);
        schemeManager.register(ExportJob.class, specs -> {
            specs.add(IndexSpecs.<ExportJob, String>single("spec.apiVersion", String.class)
                .indexFunc(job -> job.getSpec() == null
                    ? null : job.getSpec().getApiVersion()));
            specs.add(IndexSpecs.<ExportJob, String>single("spec.kind", String.class)
                .indexFunc(job -> job.getSpec() == null ? null : job.getSpec().getKind()));
        });
    }

    @Override
    public void stop() {
        schemeManager.unregister(Scheme.buildFromType(QueryPreset.class));
        schemeManager.unregister(Scheme.buildFromType(ExportJob.class));
    }

    /**
     * Called only on uninstall. Stopping, including Halo restarts, keeps the files so pending
     * downloads survive; the cleanup task expires them once the plugin runs again.
     */
    @Override
    public void delete() {
        try {
            artifacts.deleteAll();
        } catch (IOException e) {
            log.warn("Failed to remove export files of plugin {}", getContext().getName(), e);
        }
    }
}
