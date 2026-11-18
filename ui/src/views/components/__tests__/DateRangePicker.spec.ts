import { getLocalTimeZone, today } from '@internationalized/date';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import DateRangePicker from '../DateRangePicker.vue';

const hide = vi.hoisted(() => vi.fn<() => void>());
vi.mock('@halo-dev/components', async () => {
  const { defineComponent } = await import('vue');
  return {
    // floating-vue renders the popper lazily; render both slots inline instead.
    VDropdown: defineComponent({
      setup: (_, { expose }) => expose({ hide }),
      template: '<div><slot /><slot name="popper" /></div>',
    }),
  };
});

function mountPicker(modelValue?: { start: string; end: string }) {
  return mount(
    defineComponent({
      components: { DateRangePicker },
      data: () => ({ range: modelValue }),
      template: '<DateRangePicker v-model="range" />',
    })
  );
}
function presetButton(wrapper: ReturnType<typeof mountPicker>, label: string) {
  return wrapper.findAll('.studio-date-presets button').find((item) => item.text() === label)!;
}

describe('DateRangePicker', () => {
  it('shows the current range or that none is set', () => {
    expect(mountPicker().get('.studio-date-trigger').text()).toBe('不限');
    expect(
      mountPicker({ start: '2026-11-01', end: '2026-11-18' }).get('.studio-date-trigger').text()
    ).toBe('2026-11-01 ~ 2026-11-18');
  });

  it('commits a quick range and closes', async () => {
    const wrapper = mountPicker();
    const now = today(getLocalTimeZone());

    await presetButton(wrapper, '最近 7 天').trigger('click');

    expect(wrapper.vm.range).toEqual({
      start: now.subtract({ days: 6 }).toString(),
      end: now.toString(),
    });
    expect(hide).toHaveBeenCalled();
  });

  it('commits a range picked on the calendar once both ends are chosen', async () => {
    const wrapper = mountPicker({ start: '2026-11-01', end: '2026-11-18' });
    const day = (date: string) => wrapper.get(`[data-value="${date}"]`);

    await day('2026-11-03').trigger('click');
    expect(wrapper.vm.range).toEqual({ start: '2026-11-01', end: '2026-11-18' });
    // The end is taken from the hovered range, as in a browser.
    await day('2026-11-10').trigger('mouseenter');
    await day('2026-11-10').trigger('click');

    expect(wrapper.vm.range).toEqual({ start: '2026-11-03', end: '2026-11-10' });
  });
});
