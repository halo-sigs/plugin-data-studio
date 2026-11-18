import type { DataQuery, QueryPreset, Scheme } from '@/types';
import { EXPORT_JOB_API, QUERY_PRESET_API, RECORDS_API } from '@/utils/api';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataExportModal from '../DataExportModal.vue';
import QueryPresetMenu from '../QueryPresetMenu.vue';

type MockRequest = (url: string, body?: unknown) => Promise<{ data: unknown }>;
const { get, post, success, error } = vi.hoisted(() => ({
  get: vi.fn<MockRequest>(),
  post: vi.fn<MockRequest>(),
  success: vi.fn<(message: string) => void>(),
  error: vi.fn<(message: string) => void>(),
}));
vi.mock('@halo-dev/api-client', () => ({
  axiosInstance: { get, post },
}));
vi.mock('@halo-dev/components', async (importOriginal) => {
  const { defineComponent } = await import('vue');
  return {
    ...(await importOriginal<typeof import('@halo-dev/components')>()),
    Toast: { success, error },
    VModal: defineComponent({
      props: ['title', 'width'],
      emits: ['close'],
      template:
        '<div class="modal"><h2>{{ title }}</h2><slot name="actions" /><slot /><slot name="footer" /></div>',
    }),
    VButton: defineComponent({
      props: ['type', 'size', 'loading', 'disabled'],
      emits: ['click'],
      template:
        '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    }),
    VDropdown: defineComponent({ template: '<div><slot /><slot name="popper" /></div>' }),
    VDropdownItem: defineComponent({
      emits: ['click'],
      template: '<button type="button" class="item" @click="$emit(\'click\')"><slot /></button>',
    }),
    VSpace: defineComponent({ template: '<div><slot /></div>' }),
  };
});

const scheme: Scheme = {
  type: 'run.halo.app.core.extension.content.Post',
  plural: 'posts',
  singular: 'post',
  groupVersionKind: { group: 'content.halo.run', version: 'v1alpha1', kind: 'Post' },
  openApiSchema: {
    type: 'object',
    properties: {
      spec: { type: 'object', properties: { title: { type: 'string' } } },
    },
  },
};
const query: DataQuery = {
  fieldSelectors: ['spec.deleted=false'],
  labelSelectors: ['app=halo'],
  sorts: ['metadata.name,desc'],
};

const preset: QueryPreset = {
  apiVersion: 'datastudio.halo.run/v1alpha1',
  kind: 'QueryPreset',
  metadata: { name: 'titles' },
  spec: {
    displayName: '标题 CSV',
    apiVersion: 'content.halo.run/v1alpha1',
    kind: 'Post',
    fieldSelectors: ['spec.deleted=false'],
    export: { format: 'CSV', columns: [{ field: 'spec.title', header: '标题' }] },
  },
};
let presets: QueryPreset[] = [];

async function mountModal(
  options: { selection?: string[]; activePreset?: string; query?: DataQuery } = {}
) {
  const wrapper = mount(DataExportModal, {
    props: { scheme, query, keyword: 'hello', ...options },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { QueryPresetMenu: true },
    },
  });
  await flushPromises();
  return wrapper;
}
function button(wrapper: Awaited<ReturnType<typeof mountModal>>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text)!;
}
function fields(wrapper: Awaited<ReturnType<typeof mountModal>>) {
  return wrapper.findAll('.studio-export-field').map((item) => item.text());
}

beforeEach(() => {
  vi.clearAllMocks();
  presets = [];
  get.mockImplementation(async (url) =>
    url === QUERY_PRESET_API
      ? { data: { items: presets, hasNext: false } }
      : { data: { items: [], total: 12 } }
  );
  post.mockResolvedValue({
    data: {
      apiVersion: 'datastudio.halo.run/v1alpha1',
      kind: 'ExportJob',
      metadata: { name: 'job' },
    },
  });
});

describe('DataExportModal', () => {
  it('exports the page filters and keyword with default CSV columns', async () => {
    const wrapper = await mountModal();

    expect(wrapper.text()).toContain('筛选结果 · 12 条');
    await button(wrapper, '导出 12 条').trigger('click');
    await flushPromises();

    expect(post).toHaveBeenCalledWith(
      EXPORT_JOB_API,
      expect.objectContaining({
        apiVersion: 'datastudio.halo.run/v1alpha1',
        kind: 'ExportJob',
        metadata: { name: expect.stringMatching(/^export-job-/) },
        spec: {
          apiVersion: 'content.halo.run/v1alpha1',
          kind: 'Post',
          format: 'CSV',
          columns: [
            { field: 'metadata.name', header: '名称' },
            { field: 'metadata.creationTimestamp', header: '创建时间' },
          ],
          fieldSelectors: ['spec.deleted=false', 'metadata.name=hello'],
          labelSelectors: ['app=halo'],
          sorts: ['metadata.name,desc'],
        },
      })
    );
    expect(success).toHaveBeenCalledWith('已开始后台导出');
    expect(wrapper.emitted('created')?.[0]?.[0]).toMatchObject({ metadata: { name: 'job' } });
  });

  it('counts and exports within the creation range', async () => {
    const range = { start: '2026-11-01', end: '2026-11-18' };
    const wrapper = await mountModal({ query: { ...query, createdRange: range } });
    const bounds = {
      createdAfter: new Date(2026, 10, 1).toISOString(),
      createdBefore: new Date(2026, 10, 19).toISOString(),
    };

    expect(get).toHaveBeenCalledWith(RECORDS_API, {
      params: expect.objectContaining({ apiVersion: 'content.halo.run/v1alpha1', ...bounds }),
    });
    expect(wrapper.text()).toContain('2026-11-01 ~ 2026-11-18');
    await button(wrapper, '导出 12 条').trigger('click');
    await flushPromises();
    expect(post.mock.calls[0]![1]).toMatchObject({ spec: bounds });

    await wrapper.get('button[aria-label="移除创建时间"]').trigger('click');
    expect(wrapper.emitted('update:query')?.[0]?.[0]).toEqual({
      ...query,
      createdRange: undefined,
    });
  });

  it('exports only the selected records', async () => {
    const wrapper = await mountModal({
      selection: ['post-a', 'post-b'],
      query: { ...query, createdRange: { start: '2026-11-01', end: '2026-11-18' } },
    });

    // Only presets load; the selection needs no count request.
    expect(get.mock.calls.map(([url]) => url)).toEqual([QUERY_PRESET_API]);
    expect(wrapper.text()).toContain('选中的 2 条');
    expect(wrapper.text()).not.toContain('spec.deleted=false');
    await button(wrapper, '导出 2 条').trigger('click');
    await flushPromises();

    expect(post.mock.calls[0]![1]).toMatchObject({
      spec: {
        fieldSelectors: ['metadata.name=(post-a,post-b)'],
        labelSelectors: [],
        sorts: ['metadata.name,desc'],
      },
    });
    expect(post.mock.calls[0]![1]).not.toHaveProperty('spec.createdAfter');
    expect(wrapper.text()).not.toContain('2026-11-01');
  });

  it('uses an equality selector for a single selected record', async () => {
    const wrapper = await mountModal({ selection: ['a'] });

    await button(wrapper, '导出 1 条').trigger('click');
    await flushPromises();

    expect(post.mock.calls[0]![1]).toMatchObject({ spec: { fieldSelectors: ['metadata.name=a'] } });
  });

  it('adds schema and custom fields, renames headers and reorders columns', async () => {
    const wrapper = await mountModal();

    // Enter picks the first schema match, or the typed path when nothing matches.
    await wrapper.get('input[aria-label="搜索字段"]').setValue('TIT');
    await wrapper.get('input[aria-label="搜索字段"]').trigger('keydown', { key: 'Enter' });
    await wrapper.get('input[aria-label="搜索字段"]').setValue('status.phase');
    await wrapper.get('input[aria-label="搜索字段"]').trigger('keydown', { key: 'Enter' });
    expect(fields(wrapper)).toEqual([
      'metadata.name',
      'metadata.creationTimestamp',
      'spec.title',
      'status.phase',
    ]);
    // Added fields leave the picker.
    expect(button(wrapper, 'spec.title')).toBeUndefined();

    await wrapper.get('input[aria-label="spec.title 的表头"]').setValue('标题');
    await wrapper.get('[aria-label="移动 spec.title"]').trigger('keydown', { key: 'ArrowUp' });
    await wrapper.get('button[aria-label="移除 metadata.creationTimestamp"]').trigger('click');
    expect(fields(wrapper)).toEqual(['metadata.name', 'spec.title', 'status.phase']);

    await button(wrapper, '导出 12 条').trigger('click');
    await flushPromises();
    expect(post.mock.calls[0]![1]).toMatchObject({
      spec: {
        columns: [
          { field: 'metadata.name', header: '名称' },
          { field: 'spec.title', header: '标题' },
          { field: 'status.phase', header: '' },
        ],
      },
    });
  });

  it('reorders columns by dragging the grip onto another row', async () => {
    const wrapper = await mountModal();

    await wrapper.get('[aria-label="移动 metadata.creationTimestamp"]').trigger('dragstart');
    await wrapper.findAll('.studio-export-column')[0]!.trigger('drop');

    expect(fields(wrapper)).toEqual(['metadata.creationTimestamp', 'metadata.name']);
  });

  it('disables export when CSV has no fields', async () => {
    const wrapper = await mountModal();

    await wrapper.get('button[aria-label="移除 metadata.name"]').trigger('click');
    await wrapper.get('button[aria-label="移除 metadata.creationTimestamp"]').trigger('click');

    expect(button(wrapper, '导出 12 条').attributes('disabled')).toBeDefined();
    await button(wrapper, '导出 12 条').trigger('click');
    expect(post).not.toHaveBeenCalled();
  });

  it('disables export when nothing matches', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    const wrapper = await mountModal();

    expect(button(wrapper, '导出 0 条').attributes('disabled')).toBeDefined();
  });

  it('hides CSV columns and sends no columns for JSON', async () => {
    const wrapper = await mountModal();

    await wrapper.get('input[type="radio"][value="JSON"]').setValue(true);

    expect(wrapper.find('.studio-export-column').exists()).toBe(false);
    await button(wrapper, '导出 12 条').trigger('click');
    await flushPromises();

    expect(post.mock.calls[0]![1]).toMatchObject({ spec: { format: 'JSON', columns: [] } });
  });

  it('reports removed conditions to the list page instead of keeping a copy', async () => {
    const wrapper = await mountModal();

    await wrapper.get('button[aria-label="移除名称条件"]').trigger('click');
    await wrapper.get('button[aria-label="移除 app=halo"]').trigger('click');

    expect(wrapper.emitted('update:keyword')).toEqual([['']]);
    expect(wrapper.emitted('update:query')).toEqual([[{ ...query, labelSelectors: [] }]]);
  });

  it('follows filter changes made by the list page', async () => {
    const wrapper = await mountModal();

    await wrapper.setProps({
      keyword: '',
      query: { fieldSelectors: ['spec.slug=a'], labelSelectors: [], sorts: [] },
    });
    await flushPromises();
    await button(wrapper, '导出 12 条').trigger('click');
    await flushPromises();

    expect(post.mock.calls[0]![1]).toMatchObject({
      spec: { fieldSelectors: ['spec.slug=a'], labelSelectors: [], sorts: [] },
    });
  });

  it('prefills export settings from the preset active on the list page', async () => {
    presets = [preset];
    const wrapper = await mountModal({ activePreset: 'titles' });

    expect(fields(wrapper)).toEqual(['spec.title']);
    expect(wrapper.findComponent(QueryPresetMenu).props()).toMatchObject({
      active: 'titles',
      query,
      exportConfig: { format: 'CSV' },
    });
  });

  it('applies export settings of a preset picked in the modal and hands its filters to the page', async () => {
    const wrapper = await mountModal();

    wrapper.findComponent(QueryPresetMenu).vm.$emit('select', {
      ...preset,
      spec: { ...preset.spec, export: { format: 'JSON' } },
    });
    await flushPromises();

    expect(wrapper.emitted('select-preset')?.[0]?.[0]).toMatchObject({
      metadata: { name: 'titles' },
    });
    expect(wrapper.get<HTMLInputElement>('input[value="JSON"]').element.checked).toBe(true);
    // A JSON preset keeps the current CSV columns for switching back.
    await wrapper.get('input[value="CSV"]').setValue(true);
    expect(fields(wrapper)).toEqual(['metadata.name', 'metadata.creationTimestamp']);
  });

  it('keeps the current settings for a filter-only preset', async () => {
    const wrapper = await mountModal();

    wrapper
      .findComponent(QueryPresetMenu)
      .vm.$emit('select', { ...preset, spec: { ...preset.spec, export: undefined } });
    await flushPromises();

    expect(fields(wrapper)).toEqual(['metadata.name', 'metadata.creationTimestamp']);
  });

  it('opens export history', async () => {
    const wrapper = await mountModal();

    await button(wrapper, '导出记录').trigger('click');

    expect(wrapper.emitted('history')).toHaveLength(1);
  });
});
