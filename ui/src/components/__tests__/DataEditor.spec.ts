import type { Scheme, Unstructured } from '@/types';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import DataEditor from '../DataEditor.vue';

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
        required: ['text', 'count', 'enabled'],
        properties: {
          text: { type: 'string' },
          count: { type: 'integer' },
          enabled: { type: 'boolean' },
        },
      },
    },
  },
};
const resource: Unstructured = {
  apiVersion: 'test.halo.run/v1',
  kind: 'Example',
  metadata: { name: 'example' },
  spec: { text: '', count: 0, enabled: false },
};
const wrappers: ReturnType<typeof mount<typeof DataEditor>>[] = [];
async function editor(data: Unstructured | null = structuredClone(resource)) {
  const wrapper = mount(DataEditor, {
    props: { scheme, data: data ?? undefined },
    attachTo: document.body,
    global: {
      components: { VCodemirror: CodeEditor },
      stubs: { VButton: { template: '<button><slot /></button>' } },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await vi.waitFor(() =>
    expect(wrapper.get('[role="tab"]').attributes('disabled')).toBeUndefined()
  );
  return wrapper;
}
async function editTreeValue(
  wrapper: Awaited<ReturnType<typeof editor>>,
  pointer: string,
  value: string
) {
  await wrapper.get('.jse-expand-all').trigger('click');
  await flushPromises();
  const node = wrapper.get(`[data-path="${encodeURIComponent(pointer)}"]`);
  await node.get('.jse-value').trigger('dblclick');
  await flushPromises();
  const input = node.get<HTMLElement>('[contenteditable="true"]');
  input.element.focus();
  input.element.innerText = value;
  await input.trigger('input');
}
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('DataEditor draft preservation', () => {
  it('starts new records with schema fields so visual editing is available immediately', async () => {
    const wrapper = await editor(null);
    expect(wrapper.vm.getData()?.spec).toEqual({ text: '', count: 0, enabled: false });
    expect(wrapper.vm.dirty).toBe(false);
    expect(wrapper.text()).toContain('尚未创建');
    await wrapper.get('[role="tab"]').trigger('click');
    expect(wrapper.get('[role="tab"]').attributes('aria-selected')).toBe('true');
    await editTreeValue(wrapper, '/metadata/name', 'created');
    expect(wrapper.vm.getData()?.metadata.name).toBe('created');
    expect(wrapper.vm.dirty).toBe(true);
  });

  it('preserves incomplete JSON when switching modes or attempting to save', async () => {
    const wrapper = await editor();
    await wrapper.get<HTMLTextAreaElement>('textarea[aria-label="JSON"]').setValue('{ "spec":');
    await wrapper.get('[role="tab"]').trigger('click');
    expect(wrapper.get<HTMLTextAreaElement>('textarea[aria-label="JSON"]').element.value).toBe(
      '{ "spec":'
    );
    expect(wrapper.text()).toContain('请先修复 JSON 语法错误');
    expect(wrapper.vm.getData()).toBeUndefined();
    expect(wrapper.vm.dirty).toBe(true);
  });

  it('blocks schema errors even when the JSON syntax is valid', async () => {
    const wrapper = await editor();
    await wrapper
      .get<HTMLTextAreaElement>('textarea[aria-label="JSON"]')
      .setValue(
        JSON.stringify({ ...resource, spec: { text: '', count: 'wrong', enabled: false } })
      );
    expect(wrapper.vm.getData()).toBeUndefined();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('spec.count');
  });

  it('round trips false, zero and empty strings through the actual tree renderer', async () => {
    const wrapper = await editor();
    await wrapper.get('[role="tab"]').trigger('click');
    expect(wrapper.get('[role="tab"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.vm.getData()).toEqual(resource);
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(
      JSON.parse(wrapper.get<HTMLTextAreaElement>('textarea[aria-label="JSON"]').element.value)
    ).toEqual(resource);
    expect(wrapper.vm.dirty).toBe(false);
  });

  it('flushes the last inline edit before saving or switching to JSON', async () => {
    const wrapper = await editor();
    await wrapper.get('[role="tab"]').trigger('click');
    await editTreeValue(wrapper, '/spec/text', 'changed');
    expect(wrapper.vm.getData()?.spec).toEqual({ text: 'changed', count: 0, enabled: false });
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(
      JSON.parse(wrapper.get<HTMLTextAreaElement>('textarea[aria-label="JSON"]').element.value).spec
        .text
    ).toBe('changed');
  });

  it('never discards unknown fields or coerces null just to enter visual mode', async () => {
    const value = { ...resource, extra: { arbitrary: [null, false, 0, ''] } };
    const wrapper = await editor(value);
    await wrapper.get('[role="tab"]').trigger('click');
    await wrapper.get('.jse-expand-all').trigger('click');
    await flushPromises();
    await wrapper
      .get('[data-path="%2Fextra%2Farbitrary%2F1"] .jse-boolean-toggle')
      .trigger('mousedown', { button: 0 });
    expect(wrapper.vm.getData()?.extra).toEqual({ arbitrary: [null, true, 0, ''] });
    await wrapper.get('.jse-undo').trigger('click');
    await flushPromises();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(wrapper.vm.getData()).toEqual(value);
    expect(wrapper.vm.dirty).toBe(false);
  });

  it('keeps independent instances and accepts the server response as the new baseline', async () => {
    const first = await editor();
    const second = await editor({ ...resource, metadata: { name: 'second' } });
    await first
      .get<HTMLTextAreaElement>('textarea[aria-label="JSON"]')
      .setValue(JSON.stringify({ ...resource, spec: { text: 'edit', count: 1, enabled: true } }));
    expect(first.vm.dirty).toBe(true);
    expect(second.vm.getData()?.metadata.name).toBe('second');
    const saved = { ...first.vm.getData()!, metadata: { name: 'example', version: 2 } };
    await first.setProps({ data: saved });
    expect(first.vm.getData()).toEqual(saved);
    expect(first.vm.dirty).toBe(false);
  });

  it('does not treat formatting or key order as a data change', async () => {
    const wrapper = await editor();
    await wrapper.get<HTMLTextAreaElement>('textarea[aria-label="JSON"]').setValue(
      JSON.stringify({
        spec: resource.spec,
        metadata: resource.metadata,
        kind: resource.kind,
        apiVersion: resource.apiVersion,
      })
    );
    expect(wrapper.vm.dirty).toBe(false);
  });

  it('blocks identity changes when editing an existing record', async () => {
    const wrapper = await editor();
    await wrapper
      .get<HTMLTextAreaElement>('textarea[aria-label="JSON"]')
      .setValue(JSON.stringify({ ...resource, metadata: { name: 'different' } }));
    expect(wrapper.vm.getData()).toBeUndefined();
  });
});
