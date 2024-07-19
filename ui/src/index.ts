import { definePlugin } from '@halo-dev/console-shared';
import { markRaw } from 'vue';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import DataStudio from './views/DataStudio.vue';

export default definePlugin({
  components: {},
  routes: [
    {
      parentName: 'ToolsRoot',
      route: {
        path: 'data-studio',
        name: 'DataStudio',
        component: DataStudio,
        meta: {
          title: 'Data Studio（数据工厂）',
          description: '支持查询系统内所有模型，以及维护任意模型数据',
          searchable: true,
          hideFooter: true,
          permissions: ['*'],
          menu: {
            name: 'Data Studio',
            icon: markRaw(TablerDatabaseEdit),
            priority: 0,
          },
        },
      },
    },
  ],
  extensionPoints: {},
});
