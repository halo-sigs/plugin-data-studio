import type { DataQuery } from '@/types';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import QueryPanel from '../QueryPanel.vue';

const VButton = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template:
    '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
});
const empty: DataQuery = { fieldSelectors: [], labelSelectors: [], sorts: [] };

function mountPanel(query: DataQuery = empty) {
  return mount(QueryPanel, { props: { query }, global: { stubs: { VButton } } });
}
function applyButton(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('button').find((button) => button.text() === '应用')!;
}

describe('QueryPanel', () => {
  it('applies one trimmed term per non-empty line', async () => {
    const wrapper = mountPanel();
    const [fields, labels, sorts] = wrapper.findAll('textarea');
    await fields!.setValue(' spec.slug=hello \n\nmetadata.name=post-1');
    await labels!.setValue('app=halo');
    await sorts!.setValue('metadata.creationTimestamp,desc');

    await applyButton(wrapper).trigger('click');

    expect(wrapper.emitted('apply')?.[0]).toEqual([
      {
        fieldSelectors: ['spec.slug=hello', 'metadata.name=post-1'],
        labelSelectors: ['app=halo'],
        sorts: ['metadata.creationTimestamp,desc'],
      },
    ]);
  });

  it('only enables apply when the draft differs from the applied query', async () => {
    const wrapper = mountPanel({ ...empty, labelSelectors: ['app=halo'] });

    expect(applyButton(wrapper).attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[1]!.setValue('app=halo\n');
    expect(applyButton(wrapper).attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[1]!.setValue('');
    expect(applyButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('applies with Ctrl+Enter and resets the draft when the applied query changes', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('textarea')[0]!.setValue('spec.deleted=false');
    await wrapper.get('form').trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(wrapper.emitted('apply')).toHaveLength(1);

    await wrapper.setProps({ query: { ...empty, sorts: ['metadata.name'] } });
    expect(wrapper.findAll('textarea').map((item) => item.element.value)).toEqual([
      '',
      '',
      'metadata.name',
    ]);
  });

  it('keeps the draft when the applied query is recreated with the same terms', async () => {
    const query = { ...empty, fieldSelectors: ['metadata.name!=a', 'metadata.name!=b'] };
    const wrapper = mountPanel(query);
    await wrapper.findAll('textarea')[1]!.setValue('app=draft');

    await wrapper.setProps({ query: { ...query, fieldSelectors: [...query.fieldSelectors] } });

    expect(wrapper.findAll('textarea')[1]!.element.value).toBe('app=draft');
  });

  it('drops duplicate lines', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('textarea')[0]!.setValue('spec.slug=a\nspec.slug=a');
    await applyButton(wrapper).trigger('click');

    expect(wrapper.emitted('apply')?.[0]?.[0]).toMatchObject({ fieldSelectors: ['spec.slug=a'] });
  });
});
