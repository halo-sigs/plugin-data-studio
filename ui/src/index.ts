import { definePlugin } from '@halo-dev/ui-shared';
import 'uno.css';
import { markRaw } from 'vue';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import './styles/main.scss';

export default definePlugin({
  components: {},
  routes: [
    {
      parentName: 'ToolsRoot',
      route: {
        path: 'data-studio',
        name: 'DataStudio',
        component: () => import('./views/DataStudio.vue'),
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
