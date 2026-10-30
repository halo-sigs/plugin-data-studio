import type { Scheme, Unstructured } from '@/types';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import DataUpdateSection from '../DataUpdateSection.vue';

const { invalidateQueries, put } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  put: vi.fn(),
}));
vi.mock('@halo-dev/api-client', () => ({ axiosInstance: { put } }));
vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock('@halo-dev/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@halo-dev/components')>()),
  Toast: { success: vi.fn(), error: vi.fn() },
}));

const CodeEditor = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<textarea aria-label="JSON" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});
const scheme: Scheme = {
  type: 'Example',
  plural: 'examples',
  singular: 'example',
  groupVersionKind: { group: 'test.halo.run', version: 'v1', kind: 'Example' },
  openApiSchema: {
    type: 'object',
    required: ['apiVersion', 'kind', 'metadata', 'spec'],
    properties: {
      apiVersion: { type: 'string' },
      kind: { type: 'string' },
      metadata: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      spec: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
    },
  },
};
const resource: Unstructured = {
  apiVersion: 'test.halo.run/v1',
  kind: 'Example',
  metadata: { name: 'example' },
  spec: { text: 'initial' },
};
const wrappers: ReturnType<typeof mount<typeof DataUpdateSection>>[] = [];

async function editor() {
  const wrapper = mount(DataUpdateSection, {
    props: { scheme, data: structuredClone(resource) },
    attachTo: document.body,
    global: {
      components: { VCodemirror: CodeEditor },
      stubs: {
        VButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled"><slot /></button>',
        },
        VSpace: { template: '<div><slot /></div>' },
        VModal: true,
        VLoading: true,
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await vi.waitFor(() =>
    expect(wrapper.get('[role="tab"]').attributes('disabled')).toBeUndefined()
  );
  return wrapper;
}

async function activeTreeEdit(wrapper: Awaited<ReturnType<typeof editor>>) {
  await wrapper.get('[role="tab"]').trigger('click');
  await wrapper.get('.jse-expand-all').trigger('click');
  await flushPromises();
  const node = wrapper.get('[data-path="%2Fspec%2Ftext"]');
  await node.get('.jse-value').trigger('dblclick');
  await flushPromises();
  const input = node.get<HTMLElement>('[contenteditable="true"]');
  input.element.focus();
  input.element.innerText = 'changed';
  await input.trigger('input');
  return input;
}

function saveButton(wrapper: Awaited<ReturnType<typeof editor>>) {
  return wrapper.findAll('button').find((button) => button.text() === '保存')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  put.mockImplementation(async (_url, value) => ({ data: structuredClone(value) }));
});
afterEach(() => {
  vi.restoreAllMocks();
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('DataUpdateSection saving', () => {
  it('flushes the first active tree edit before a keyboard save', async () => {
    const wrapper = await editor();
    const input = await activeTreeEdit(wrapper);

    await input.trigger('keydown', { key: 's', ctrlKey: true });

    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ spec: { text: 'changed' } })
    );
  });

  it('allows the save button to commit the first active tree edit', async () => {
    const wrapper = await editor();
    await activeTreeEdit(wrapper);

    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined();
    await saveButton(wrapper).trigger('click');

    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ spec: { text: 'changed' } })
    );
  });

  it('does not update an unchanged existing record', async () => {
    const wrapper = await editor();

    await saveButton(wrapper).trigger('click');

    expect(put).not.toHaveBeenCalled();
  });
});
