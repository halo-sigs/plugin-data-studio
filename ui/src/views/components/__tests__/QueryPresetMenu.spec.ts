import type { DataQuery, QueryPreset, Scheme } from '@/types';
import { QUERY_PRESET_API } from '@/utils/api';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, type ComponentCustomProperties } from 'vue';
import QueryPresetMenu from '../QueryPresetMenu.vue';

type MockRequest = (url: string, body?: unknown) => Promise<{ data: unknown }>;
const { get, post, put, del, warning } = vi.hoisted(() => ({
  get: vi.fn<MockRequest>(),
  post: vi.fn<MockRequest>(),
  put: vi.fn<MockRequest>(),
  del: vi.fn<MockRequest>(),
  warning: vi.fn<(options: { onConfirm: () => Promise<void> }) => void>(),
}));
vi.mock('@halo-dev/api-client', () => ({
  axiosInstance: { get, post, put, delete: del },
}));
const toastError = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock('@halo-dev/components', async (importOriginal) => {
  const { defineComponent } = await import('vue');
  return {
    ...(await importOriginal<typeof import('@halo-dev/components')>()),
    Toast: { success: vi.fn<() => void>(), error: toastError },
    Dialog: { warning },
    // floating-vue renders the popper lazily; render both slots inline instead.
    VDropdown: defineComponent({ template: '<div><slot /><slot name="popper" /></div>' }),
    VDropdownDivider: defineComponent({ template: '<hr />' }),
    VDropdownItem: defineComponent({
      props: ['selected', 'disabled', 'type'],
      emits: ['click'],
      template:
        '<button type="button" class="item" :data-selected="selected" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    }),
    VModal: defineComponent({
      template: '<div class="modal"><slot /><slot name="footer" /></div>',
    }),
    VSpace: defineComponent({ template: '<div><slot /></div>' }),
  };
});

// FormKit is registered globally by the Halo console; emulate its submit event.
const FormKit = defineComponent({
  props: ['id', 'type', 'name', 'label', 'validation', 'validationMessages', 'actions', 'config'],
  emits: ['submit'],
  template: '<div class="formkit"><slot /></div>',
});
const submitForm = vi.fn<(id: string) => void>();

const scheme: Scheme = {
  type: 'run.halo.app.core.extension.content.Post',
  plural: 'posts',
  singular: 'post',
  groupVersionKind: { group: 'content.halo.run', version: 'v1alpha1', kind: 'Post' },
  openApiSchema: {},
};
const preset: QueryPreset = {
  apiVersion: 'datastudio.halo.run/v1alpha1',
  kind: 'QueryPreset',
  metadata: { name: 'preset-1', version: 3 },
  spec: {
    displayName: '已发布文章',
    apiVersion: 'content.halo.run/v1alpha1',
    kind: 'Post',
    fieldSelectors: ['spec.deleted=false'],
    labelSelectors: [],
    sorts: [],
  },
};
const presetQuery: DataQuery = {
  fieldSelectors: ['spec.deleted=false'],
  labelSelectors: [],
  sorts: [],
};

async function mountMenu(props: { query: DataQuery; active?: string }) {
  const wrapper = mount(QueryPresetMenu, {
    props: { scheme, ...props },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
      directives: { closePopper: {} },
      components: { FormKit },
      config: {
        globalProperties: {
          $formkit: { submit: submitForm },
        } as unknown as ComponentCustomProperties,
      },
    },
  });
  await flushPromises();
  return wrapper;
}
function item(wrapper: Awaited<ReturnType<typeof mountMenu>>, text: string) {
  return wrapper.findAll('.item').find((button) => button.text() === text);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({
    data: {
      items: [
        preset,
        { ...preset, metadata: { name: 'page' }, spec: { ...preset.spec, kind: 'Page' } },
      ],
    },
  });
});

describe('QueryPresetMenu', () => {
  it('lists only presets of the current model and selects one', async () => {
    const wrapper = await mountMenu({ query: presetQuery });

    expect(wrapper.findAll('.item').map((button) => button.text())).toEqual([
      '已发布文章',
      '保存为新方案…',
    ]);
    await item(wrapper, '已发布文章')!.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([preset]);
  });

  it('loads presets from every page', async () => {
    get.mockResolvedValueOnce({ data: { items: [preset], hasNext: true } }).mockResolvedValueOnce({
      data: {
        items: [
          {
            ...preset,
            metadata: { name: 'preset-2' },
            spec: { ...preset.spec, displayName: '最近创建' },
          },
        ],
        hasNext: false,
      },
    });
    const wrapper = await mountMenu({ query: presetQuery });

    expect(get.mock.calls.map(([, config]) => (config as { params: unknown }).params)).toEqual([
      { page: 1, size: 1000 },
      { page: 2, size: 1000 },
    ]);
    // Presets are sorted by display name; pagination only affects what is fetched.
    expect(wrapper.findAll('.item').map((button) => button.text())).toEqual([
      '最近创建',
      '已发布文章',
      '保存为新方案…',
    ]);
  });

  it('cannot save an empty query', async () => {
    const wrapper = await mountMenu({
      query: { fieldSelectors: [], labelSelectors: [], sorts: [] },
    });
    expect(item(wrapper, '保存为新方案…')!.attributes('disabled')).toBeDefined();
  });

  it('saves the applied query under the name submitted by the FormKit form', async () => {
    const created = { ...preset, metadata: { name: 'new' } };
    post.mockResolvedValue({ data: created });
    const wrapper = await mountMenu({ query: presetQuery });

    await item(wrapper, '保存为新方案…')!.trigger('click');
    const form = wrapper.findComponent(FormKit);
    expect(form.props('id')).toBe('studio-preset-form');
    form.vm.$emit('submit', { displayName: '  已发布  ' });
    await flushPromises();

    expect(post).toHaveBeenCalledWith(
      QUERY_PRESET_API,
      expect.objectContaining({
        spec: {
          displayName: '已发布',
          apiVersion: 'content.halo.run/v1alpha1',
          kind: 'Post',
          ...presetQuery,
        },
      })
    );
    expect(wrapper.emitted('select')?.[0]).toEqual([created]);
    expect(wrapper.find('.modal').exists()).toBe(false);
  });

  it('submits the FormKit form from the footer and ignores an empty name', async () => {
    const wrapper = await mountMenu({ query: presetQuery });

    await item(wrapper, '保存为新方案…')!.trigger('click');
    await wrapper
      .findAll('.modal button')
      .find((button) => button.text() === '保存')!
      .trigger('click');
    expect(submitForm).toHaveBeenCalledWith('studio-preset-form');

    wrapper.findComponent(FormKit).vm.$emit('submit', { displayName: '   ' });
    await flushPromises();
    expect(post).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('请输入方案名称');
  });

  it('marks the active preset and only offers update after its conditions change', async () => {
    const unchanged = await mountMenu({ query: presetQuery, active: 'preset-1' });
    expect(item(unchanged, '已发布文章')!.attributes('data-selected')).toBe('true');
    expect(item(unchanged, '更新「已发布文章」')).toBeUndefined();
    expect(unchanged.find('.studio-preset-modified').exists()).toBe(false);

    const changed = { ...presetQuery, sorts: ['metadata.name,desc'] };
    put.mockResolvedValue({ data: preset });
    const wrapper = await mountMenu({ query: changed, active: 'preset-1' });
    expect(wrapper.find('.studio-preset-modified').exists()).toBe(true);

    await item(wrapper, '更新「已发布文章」')!.trigger('click');
    await flushPromises();
    expect(put).toHaveBeenCalledWith(`${QUERY_PRESET_API}/preset-1`, {
      ...preset,
      spec: { ...preset.spec, ...changed },
    });
  });

  it('hides presets the server still lists while deleting them', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          preset,
          {
            ...preset,
            metadata: { name: 'dying', deletionTimestamp: '2026-01-01T00:00:00Z' },
            spec: { ...preset.spec, displayName: '正在删除' },
          },
        ],
      },
    });
    const wrapper = await mountMenu({ query: presetQuery });

    expect(wrapper.findAll('.item').map((button) => button.text())).toEqual([
      '已发布文章',
      '保存为新方案…',
    ]);
  });

  it('drops a deleted preset from the menu without waiting for the server', async () => {
    del.mockResolvedValue({ data: {} });
    const wrapper = await mountMenu({ query: presetQuery, active: 'preset-1' });

    await item(wrapper, '删除「已发布文章」')!.trigger('click');
    await warning.mock.calls[0]![0].onConfirm();
    await flushPromises();

    expect(del).toHaveBeenCalledWith(`${QUERY_PRESET_API}/preset-1`);
    expect(item(wrapper, '已发布文章')).toBeUndefined();
    expect(wrapper.get('.studio-preset-trigger-name').text()).toBe('方案');
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ metadata: { name: 'preset-1' } });
  });
});
