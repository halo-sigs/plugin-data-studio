package run.halo.studio.data;

import org.springframework.stereotype.Component;
import run.halo.app.extension.Scheme;
import run.halo.app.extension.SchemeManager;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;
import run.halo.studio.data.extension.QueryPreset;

@Component
public class StudioDataPlugin extends BasePlugin {

    private final SchemeManager schemeManager;

    public StudioDataPlugin(PluginContext pluginContext, SchemeManager schemeManager) {
        super(pluginContext);
        this.schemeManager = schemeManager;
    }

    @Override
    public void start() {
        schemeManager.register(QueryPreset.class);
    }

    @Override
    public void stop() {
        schemeManager.unregister(Scheme.buildFromType(QueryPreset.class));
    }
}
