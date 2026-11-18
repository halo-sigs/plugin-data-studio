<script setup lang="ts">
import type { DateRange } from '@/types';
import { formatDateRange } from '@/utils/date-range';
import { VDropdown } from '@halo-dev/components';
import {
  endOfMonth,
  getLocalTimeZone,
  parseDate,
  startOfMonth,
  today,
  type CalendarDate,
} from '@internationalized/date';
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
  type DateRange as CalendarRange,
} from 'reka-ui';
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import TablerCalendar from '~icons/tabler/calendar';
import TablerChevronDown from '~icons/tabler/chevron-down';
import TablerChevronLeft from '~icons/tabler/chevron-left';
import TablerChevronRight from '~icons/tabler/chevron-right';

const model = defineModel<DateRange>();

function toCalendarRange(range?: DateRange): CalendarRange {
  return {
    start: range ? parseDate(range.start) : undefined,
    end: range ? parseDate(range.end) : undefined,
  };
}

const draft = shallowRef<CalendarRange>(toCalendarRange(model.value));
watch(model, (range) => {
  draft.value = toCalendarRange(range);
});

const dropdown = useTemplateRef<{ hide: () => void }>('dropdown');
// A range is committed once both ends are picked.
watch(draft, (range) => {
  const start = range.start?.toString();
  const end = range.end?.toString();
  if (!start || !end) return;
  if (start !== model.value?.start || end !== model.value?.end) model.value = { start, end };
  dropdown.value?.hide();
});

const currentDate = shallowRef<CalendarDate>(today(getLocalTimeZone()));
function refreshPresets() {
  currentDate.value = today(getLocalTimeZone());
}
const presets = computed(() => {
  const now = currentDate.value;
  const yesterday = now.subtract({ days: 1 });
  const lastMonth = now.subtract({ months: 1 });
  return [
    { label: '今天', start: now, end: now },
    { label: '昨天', start: yesterday, end: yesterday },
    { label: '最近 7 天', start: now.subtract({ days: 6 }), end: now },
    { label: '最近 30 天', start: now.subtract({ days: 29 }), end: now },
    { label: '本月', start: startOfMonth(now), end: now },
    { label: '上月', start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) },
  ];
});
function applyPreset(preset: CalendarRange) {
  draft.value = { start: preset.start, end: preset.end };
}
</script>

<template>
  <VDropdown
    ref="dropdown"
    placement="bottom-start"
    popper-class="studio-date-popper"
    @show="refreshPresets"
  >
    <button type="button" class="studio-date-trigger" :class="{ empty: !model }">
      <TablerCalendar aria-hidden="true" />
      <span>{{ model ? formatDateRange(model) : '不限' }}</span>
      <TablerChevronDown aria-hidden="true" />
    </button>
    <template #popper>
      <div class="studio-date-picker">
        <div class="studio-date-presets">
          <button
            v-for="preset in presets"
            :key="preset.label"
            type="button"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
        <RangeCalendarRoot
          v-slot="{ grid, weekDays }"
          v-model="draft"
          locale="zh-CN"
          :number-of-months="2"
          fixed-weeks
          weekday-format="narrow"
          class="studio-date-calendar"
        >
          <RangeCalendarHeader class="studio-date-header">
            <RangeCalendarPrev class="studio-date-nav">
              <TablerChevronLeft />
            </RangeCalendarPrev>
            <RangeCalendarHeading class="studio-date-heading" />
            <RangeCalendarNext class="studio-date-nav">
              <TablerChevronRight />
            </RangeCalendarNext>
          </RangeCalendarHeader>
          <div class="studio-date-months">
            <RangeCalendarGrid
              v-for="month in grid"
              :key="month.value.toString()"
              class="studio-date-grid"
            >
              <RangeCalendarGridHead>
                <RangeCalendarGridRow>
                  <RangeCalendarHeadCell
                    v-for="day in weekDays"
                    :key="day"
                    class="studio-date-weekday"
                  >
                    {{ day }}
                  </RangeCalendarHeadCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridHead>
              <RangeCalendarGridBody>
                <RangeCalendarGridRow
                  v-for="(weekDates, index) in month.rows"
                  :key="`week-${index}`"
                >
                  <RangeCalendarCell
                    v-for="day in weekDates"
                    :key="day.toString()"
                    :date="day"
                    class="studio-date-cell"
                  >
                    <RangeCalendarCellTrigger
                      :day="day"
                      :month="month.value"
                      class="studio-date-day"
                    />
                  </RangeCalendarCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridBody>
            </RangeCalendarGrid>
          </div>
        </RangeCalendarRoot>
      </div>
    </template>
  </VDropdown>
</template>
