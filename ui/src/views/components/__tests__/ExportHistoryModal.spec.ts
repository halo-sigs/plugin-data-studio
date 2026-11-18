import type { ExportJob, Scheme } from '@/types';
import { EXPORT_JOB_API } from '@/utils/api';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExportHistoryModal from '../ExportHistoryModal.vue';

type MockRequest = (url: string) => Promise<{ data: unknown }>;
const { get, remove, warning, success, error } = vi.hoisted(() => ({
  get: vi.fn<MockRequest>(),
  remove: vi.fn<MockRequest>(),
  warning: vi.fn<(options: { onConfirm: () => Promise<void> }) => void>(),
  success: vi.fn<(message: string) => void>(),
  error: vi.fn<(message: string) => void>(),
}));
vi.mock('@halo-dev/api-client', () => ({
  axiosInstance: { get, delete: remove },
}));
vi.mock('@halo-dev/ui-shared', () => ({
  utils: { date: { format: (value: string) => value } },
}));
vi.mock('@halo-dev/components', async (importOriginal) => {
  const { defineComponent } = await import('vue');
  const button = defineComponent({
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
  });
  return {
    ...(await importOriginal<typeof import('@halo-dev/components')>()),
    Dialog: { warning },
    Toast: { success, error },
    VModal: defineComponent({
      props: ['title', 'width'],
      emits: ['close'],
      template: '<div class="modal"><slot /><slot name="footer" /></div>',
    }),
    VButton: button,
    VDropdownItem: button,
    VSpace: defineComponent({ template: '<div><slot /></div>' }),
    VLoading: defineComponent({ template: '<div class="loading" />' }),
    VEmpty: defineComponent({
      props: ['title', 'message'],
      template: '<div class="empty">{{ title }}</div>',
    }),
    VEntityContainer: defineComponent({ template: '<div><slot /></div>' }),
    VEntity: defineComponent({
      template:
        '<div class="entity"><slot name="start" /><slot name="end" /><div class="actions"><slot name="dropdownItems" /></div></div>',
    }),
    VEntityField: defineComponent({
      props: ['title', 'description'],
      template:
        '<div class="field"><span v-if="title">{{ title }}</span><span v-if="description">{{ description }}</span><slot name="description" /></div>',
    }),
    VPagination: defineComponent({
      props: ['page', 'size', 'total'],
      emits: ['update:page', 'update:size'],
      template:
        '<button type="button" class="next-page" @click="$emit(\'update:page\', page + 1)">{{ page }} / {{ total }}</button>',
    }),
    VStatusDot: defineComponent({
      props: ['state', 'animate', 'text'],
      template: '<span class="status" :data-state="state">{{ text }}</span>',
    }),
  };
});

const scheme: Scheme = {
  type: 'run.halo.app.core.extension.content.Post',
  plural: 'posts',
  singular: 'post',
  groupVersionKind: { group: 'content.halo.run', version: 'v1alpha1', kind: 'Post' },
  openApiSchema: {},
};

function job(name: string, status: ExportJob['status']): ExportJob {
  return {
    apiVersion: 'datastudio.halo.run/v1alpha1',
    kind: 'ExportJob',
    metadata: { name, creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { apiVersion: 'content.halo.run/v1alpha1', kind: 'Post', format: 'CSV' },
    status,
  };
}

async function mountModal() {
  const wrapper = mount(ExportHistoryModal, {
    props: { scheme },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { items: [], hasNext: false } });
});

describe('ExportHistoryModal', () => {
  it('lists jobs for the current model with localized status and progress', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          job('done', { phase: 'SUCCEEDED', processed: 2, fileName: 'post-export.csv' }),
          job('running', { phase: 'RUNNING', processed: 1, total: 10 }),
          job('failed', { phase: 'FAILED', message: '磁盘空间不足' }),
        ],
        hasNext: false,
      },
    });
    const wrapper = await mountModal();

    expect(get).toHaveBeenCalledWith(EXPORT_JOB_API, {
      params: {
        page: 1,
        size: 20,
        sort: 'metadata.creationTimestamp,desc',
        fieldSelector: ['spec.apiVersion=content.halo.run/v1alpha1', 'spec.kind=Post'],
      },
    });
    expect(wrapper.text()).toContain('post-export.csv');
    expect(wrapper.text()).toContain('CSV · 2 条');
    expect(wrapper.text()).toContain('已导出 1 / 10 条');
    expect(wrapper.text()).toContain('磁盘空间不足');
    expect(wrapper.text()).toContain('导出中');
    expect(wrapper.text()).toContain('失败');
    expect(wrapper.find('.status[data-state="warning"]').exists()).toBe(true);
  });

  it('opens the download URL only for finished jobs', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          job('done', { phase: 'SUCCEEDED', processed: 2 }),
          job('running', { phase: 'RUNNING', processed: 1, total: 10 }),
        ],
        hasNext: false,
      },
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = await mountModal();

    const downloads = wrapper.findAll('button').filter((item) => item.text() === '下载');
    expect(downloads).toHaveLength(1);
    await downloads[0]!.trigger('click');

    expect(open).toHaveBeenCalledWith(
      '/apis/console.api.datastudio.halo.run/v1alpha1/exports/done/download',
      '_blank'
    );
    open.mockRestore();
  });

  it('deletes a job after confirmation', async () => {
    const running = job('running', { phase: 'RUNNING', processed: 1, total: 10 });
    get.mockResolvedValue({ data: { items: [running], hasNext: false } });
    remove.mockResolvedValue({ data: running });
    let confirm: (() => Promise<void>) | undefined;
    warning.mockImplementation((options) => {
      confirm = options.onConfirm;
    });
    const wrapper = await mountModal();

    await wrapper
      .findAll('button')
      .find((item) => item.text() === '删除')!
      .trigger('click');
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ description: '导出将停止，已生成的部分文件会被删除。' })
    );

    await confirm!();
    await flushPromises();

    expect(remove).toHaveBeenCalledWith(`${EXPORT_JOB_API}/running`);
    expect(success).toHaveBeenCalledWith('已删除');
  });

  it('pages through older jobs', async () => {
    get.mockImplementation(async () => ({
      data: {
        items: [job('job', { phase: 'SUCCEEDED', fileName: `job-${get.mock.calls.length}.csv` })],
        total: 25,
        hasNext: get.mock.calls.length === 1,
      },
    }));
    const wrapper = await mountModal();
    expect(wrapper.text()).toContain('job-1');

    await wrapper.get('.next-page').trigger('click');
    await flushPromises();

    expect(get).toHaveBeenLastCalledWith(EXPORT_JOB_API, {
      params: expect.objectContaining({ page: 2, size: 20 }),
    });
    expect(wrapper.text()).toContain('job-2');
  });

  it('hides the pagination when everything fits on one page', async () => {
    get.mockResolvedValue({
      data: { items: [job('only', { phase: 'SUCCEEDED' })], total: 1, hasNext: false },
    });
    const wrapper = await mountModal();
    expect(wrapper.find('.next-page').exists()).toBe(false);
  });
});
