<script setup lang="ts">
import type {
  DataQuery,
  ExportColumn,
  ExportFormat,
  ExportJob,
  QueryPreset,
  Scheme,
} from '@/types';
import {
  apiErrorMessage,
  buildListParams,
  createExportJobName,
  EXPORT_JOB_API,
  fetchRecords,
  schemeApiVersion,
} from '@/utils/api';
import { formatDateRange } from '@/utils/date-range';
import { exportFieldPaths, normalizeExportConfig } from '@/utils/export';
import { axiosInstance } from '@halo-dev/api-client';
import { Toast, VButton, VDropdown, VDropdownItem, VModal, VSpace } from '@halo-dev/components';
import { useQuery } from '@tanstack/vue-query';
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue';
import TablerArrowDown from '~icons/tabler/arrow-down';
import TablerArrowUp from '~icons/tabler/arrow-up';
import TablerCalendar from '~icons/tabler/calendar';
import TablerGripVertical from '~icons/tabler/grip-vertical';
import TablerPlus from '~icons/tabler/plus';
import TablerX from '~icons/tabler/x';
import { useQueryPresets } from '../composables/use-query-presets';
import QueryPresetMenu from './QueryPresetMenu.vue';

const props = defineProps<{
  scheme: Scheme;
  query: DataQuery;
  keyword: string;
  /** Names of the selected records; when set, only these records are exported. */
  selection?: string[];
  /** Name of the preset applied on the list page. */
  activePreset?: string;
}>();
// Filters stay owned by the list page; the modal only reports changes back.
const emit = defineEmits<{
  close: [];
  created: [job: ExportJob];
  history: [];
  'update:query': [query: DataQuery];
  'update:keyword': [keyword: string];
  'select-preset': [preset: QueryPreset];
  'remove-preset': [preset: QueryPreset];
}>();

interface ColumnDraft extends ExportColumn {
  id: number;
}
let nextColumnId = 0;
function toDrafts(items: ExportColumn[]): ColumnDraft[] {
  return items.map((column) => ({
    id: nextColumnId++,
    field: column.field,
    header: column.header || '',
  }));
}

const format = ref<ExportFormat>('CSV');
const columns = ref<ColumnDraft[]>(
  toDrafts([
    { field: 'metadata.name', header: '名称' },
    { field: 'metadata.creationTimestamp', header: '创建时间' },
  ])
);
const submitting = shallowRef(false);

const selectionMode = computed(() => !!props.selection?.length);
const exportConfig = computed(() => ({ format: format.value, columns: columns.value }));

const listParams = computed(() =>
  buildListParams({
    keyword: props.keyword,
    fieldSelectors: props.query.fieldSelectors,
    labelSelectors: props.query.labelSelectors,
    sorts: props.query.sorts,
    createdRange: props.query.createdRange,
  })
);
const {
  data: preview,
  isFetching: previewLoading,
  isError: previewError,
} = useQuery({
  queryKey: ['plugin-data-studio:export-preview', props.scheme.type, listParams],
  queryFn: () => fetchRecords(props.scheme, { ...listParams.value, page: 1, size: 1 }),
  enabled: computed(() => !selectionMode.value),
  retry: false,
});
const total = computed(() =>
  selectionMode.value ? props.selection!.length : preview.value?.total
);
const hasFilter = computed(
  () =>
    !!props.keyword ||
    props.query.fieldSelectors.length > 0 ||
    props.query.labelSelectors.length > 0 ||
    !!props.query.createdRange
);
const scopeText = computed(() => {
  if (selectionMode.value) return `选中的 ${total.value} 条`;
  if (previewError.value) return '条件无效';
  const count = total.value == null ? (previewLoading.value ? '…' : '') : ` · ${total.value} 条`;
  return `${hasFilter.value ? '筛选结果' : '全部数据'}${count}`;
});
const submitText = computed(() => (total.value == null ? '导出' : `导出 ${total.value} 条`));
const canSubmit = computed(
  () =>
    !(format.value === 'CSV' && !normalizedColumns().length) &&
    !(!selectionMode.value && previewError.value) &&
    total.value !== 0
);

function sortTerm(term: string) {
  const [field, direction] = term.split(',');
  return { field, desc: direction?.trim().toLowerCase() === 'desc' };
}
function removeTerm(key: 'fieldSelectors' | 'labelSelectors' | 'sorts', index: number) {
  emit('update:query', {
    ...props.query,
    [key]: props.query[key].filter((_, i) => i !== index),
  });
}

const fieldPaths = computed(() => exportFieldPaths(props.scheme));
const fieldSearch = shallowRef('');
const fieldOptions = computed(() => {
  const used = new Set(columns.value.map((column) => column.field));
  const keyword = fieldSearch.value.trim().toLowerCase();
  return fieldPaths.value.filter(
    (path) => !used.has(path) && (!keyword || path.toLowerCase().includes(keyword))
  );
});
const customField = computed(() => {
  const value = fieldSearch.value.trim();
  if (!value || fieldPaths.value.includes(value)) return '';
  return columns.value.some((column) => column.field === value) ? '' : value;
});
function addColumn(field: string) {
  columns.value.push(...toDrafts([{ field }]));
  fieldSearch.value = '';
}
function addSearchedField() {
  const exact = fieldOptions.value.find((path) => path === fieldSearch.value.trim());
  const field = exact || fieldOptions.value[0] || customField.value;
  if (field) addColumn(field);
}
const fieldSearchInput = useTemplateRef<HTMLInputElement>('fieldSearchInput');
// The popper renders its content after `apply-show`, so focus on the next frame.
function focusFieldSearch() {
  requestAnimationFrame(() => fieldSearchInput.value?.focus());
}
function removeColumn(index: number) {
  columns.value.splice(index, 1);
}
function moveColumn(from: number, to: number) {
  if (to < 0 || to >= columns.value.length || from === to) return;
  const [column] = columns.value.splice(from, 1);
  columns.value.splice(to, 0, column!);
}
// Moving a focused node blurs it, so give focus back to the grip.
async function moveColumnByKey(event: KeyboardEvent, index: number, offset: number) {
  const grip = event.currentTarget as HTMLElement;
  moveColumn(index, index + offset);
  await nextTick();
  grip.focus();
}
// Only the grip is draggable, so text in the header input stays selectable.
const draggingRow = shallowRef<number>();
function startDrag(event: DragEvent, index: number) {
  draggingRow.value = index;
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', columns.value[index]!.field);
  const row = (event.currentTarget as HTMLElement).closest('li');
  if (row) event.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
}
function dropColumn(index: number) {
  if (draggingRow.value != null) moveColumn(draggingRow.value, index);
  draggingRow.value = undefined;
}

function normalizedColumns(): ExportColumn[] {
  return normalizeExportConfig({ format: 'CSV', columns: columns.value }).columns;
}
let prefilled = false;
function applyExportConfig(preset: QueryPreset) {
  const config = preset.spec.export;
  if (!config) return;
  format.value = config.format;
  // JSON presets store no columns; keep the current ones for switching back to CSV.
  if (config.format === 'CSV') columns.value = toDrafts(config.columns || []);
}
function selectPreset(preset: QueryPreset) {
  prefilled = true;
  applyExportConfig(preset);
  emit('select-preset', preset);
}
// Prefill once from the preset already active on the list page, as soon as presets load.
const { presets } = useQueryPresets(() => props.scheme);
watch(
  () => presets.value.find((preset) => preset.metadata.name === props.activePreset),
  (preset) => {
    if (!preset || prefilled) return;
    prefilled = true;
    applyExportConfig(preset);
  },
  { immediate: true }
);

function scopeSpec() {
  if (selectionMode.value) {
    const names = props.selection!;
    return {
      fieldSelectors: [
        names.length === 1 ? `metadata.name=${names[0]}` : `metadata.name=(${names.join(',')})`,
      ],
      labelSelectors: [],
      sorts: props.query.sorts,
    };
  }
  const { fieldSelector, labelSelector, sort, createdAfter, createdBefore } = listParams.value;
  return {
    fieldSelectors: fieldSelector || [],
    labelSelectors: labelSelector || [],
    sorts: sort || [],
    createdAfter,
    createdBefore,
  };
}

async function create() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const { data } = await axiosInstance.post<ExportJob>(EXPORT_JOB_API, {
      apiVersion: 'datastudio.halo.run/v1alpha1',
      kind: 'ExportJob',
      metadata: { name: createExportJobName() },
      spec: {
        apiVersion: schemeApiVersion(props.scheme),
        kind: props.scheme.groupVersionKind.kind,
        format: format.value,
        columns: format.value === 'CSV' ? normalizedColumns() : [],
        ...scopeSpec(),
      },
    });
    Toast.success('已开始后台导出');
    emit('created', data);
  } catch (error) {
    Toast.error(apiErrorMessage(error, '创建导出任务失败'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <VModal :title="`导出 ${scheme.groupVersionKind.kind}`" :width="640" @close="emit('close')">
    <div class="studio-export-form">
      <div class="studio-export-row">
        <span class="studio-export-label">导出方案</span>
        <div class=":uno: flex">
          <QueryPresetMenu
            :scheme="scheme"
            :query="query"
            :active="activePreset"
            :export-config="exportConfig"
            placeholder="选择方案"
            @select="selectPreset"
            @remove="emit('remove-preset', $event)"
          />
        </div>
      </div>

      <div class="studio-export-row">
        <span class="studio-export-label">范围</span>
        <div class="studio-export-scope">
          <span
            class="studio-export-count"
            :class="{ error: !selectionMode && previewError }"
            aria-live="polite"
            >{{ scopeText }}</span
          >
          <template v-if="!selectionMode">
            <span v-if="keyword" class="studio-query-term" title="名称">
              <span>{{ keyword }}</span>
              <button type="button" aria-label="移除名称条件" @click="emit('update:keyword', '')">
                <TablerX aria-hidden="true" />
              </button>
            </span>
            <span v-if="query.createdRange" class="studio-query-term" title="创建时间">
              <TablerCalendar aria-hidden="true" />
              <span>{{ formatDateRange(query.createdRange) }}</span>
              <button
                type="button"
                aria-label="移除创建时间"
                @click="emit('update:query', { ...query, createdRange: undefined })"
              >
                <TablerX aria-hidden="true" />
              </button>
            </span>
            <span
              v-for="(term, index) in query.fieldSelectors"
              :key="`field:${term}`"
              class="studio-query-term"
              title="字段条件"
            >
              <span>{{ term }}</span>
              <button
                type="button"
                :aria-label="`移除 ${term}`"
                @click="removeTerm('fieldSelectors', index)"
              >
                <TablerX aria-hidden="true" />
              </button>
            </span>
            <span
              v-for="(term, index) in query.labelSelectors"
              :key="`label:${term}`"
              class="studio-query-term label"
              title="标签条件"
            >
              <span>{{ term }}</span>
              <button
                type="button"
                :aria-label="`移除 ${term}`"
                @click="removeTerm('labelSelectors', index)"
              >
                <TablerX aria-hidden="true" />
              </button>
            </span>
          </template>
          <span
            v-for="(term, index) in query.sorts"
            :key="`sort:${term}`"
            class="studio-query-term sort"
            :title="term"
          >
            <component
              :is="sortTerm(term).desc ? TablerArrowDown : TablerArrowUp"
              aria-hidden="true"
            />
            <span>{{ sortTerm(term).field }}</span>
            <button type="button" :aria-label="`移除 ${term}`" @click="removeTerm('sorts', index)">
              <TablerX aria-hidden="true" />
            </button>
          </span>
        </div>
      </div>

      <div class="studio-export-row">
        <span id="studio-export-format-label" class="studio-export-label">格式</span>
        <div
          class="studio-segmented"
          role="radiogroup"
          aria-labelledby="studio-export-format-label"
        >
          <label v-for="option in ['CSV', 'JSON'] as const" :key="option">
            <input v-model="format" type="radio" name="studio-export-format" :value="option" />
            <span>{{ option }}</span>
          </label>
        </div>
      </div>

      <div v-if="format === 'CSV'" class="studio-export-row">
        <span class="studio-export-label">字段</span>
        <div class="studio-export-columns">
          <ol v-if="columns.length" class="studio-export-column-list">
            <li
              v-for="(column, index) in columns"
              :key="column.id"
              class="studio-export-column"
              :class="{ dragging: draggingRow === index }"
              @dragover.prevent
              @drop.prevent="dropColumn(index)"
            >
              <span
                class="studio-export-grip"
                role="button"
                tabindex="0"
                draggable="true"
                :aria-label="`移动 ${column.field}`"
                title="拖动或用 ↑ ↓ 调整顺序"
                @dragstart="startDrag($event, index)"
                @dragend="draggingRow = undefined"
                @keydown.up.prevent="moveColumnByKey($event, index, -1)"
                @keydown.down.prevent="moveColumnByKey($event, index, 1)"
              >
                <TablerGripVertical aria-hidden="true" />
              </span>
              <code class="studio-export-field" :title="column.field">{{ column.field }}</code>
              <input
                v-model="column.header"
                class="studio-export-input"
                :placeholder="column.field"
                :aria-label="`${column.field} 的表头`"
              />
              <button
                type="button"
                class="studio-export-remove"
                :aria-label="`移除 ${column.field}`"
                @click="removeColumn(index)"
              >
                <TablerX aria-hidden="true" />
              </button>
            </li>
          </ol>
          <VDropdown placement="bottom-start" no-auto-focus @apply-show="focusFieldSearch">
            <VButton size="sm" class="studio-export-add">
              <TablerPlus aria-hidden="true" />
              <span>添加字段</span>
            </VButton>
            <template #popper>
              <div class="studio-export-picker">
                <input
                  v-model="fieldSearch"
                  class="studio-export-input"
                  placeholder="搜索或输入字段路径"
                  aria-label="搜索字段"
                  ref="fieldSearchInput"
                  @keydown.enter.prevent="addSearchedField"
                />
                <div class="studio-export-picker-list">
                  <VDropdownItem v-for="path in fieldOptions" :key="path" @click="addColumn(path)">
                    <code>{{ path }}</code>
                  </VDropdownItem>
                  <VDropdownItem v-if="customField" @click="addColumn(customField)">
                    添加 <code>{{ customField }}</code>
                  </VDropdownItem>
                  <p v-if="!customField && !fieldOptions.length" class="studio-preset-hint">
                    没有更多字段
                  </p>
                </div>
              </div>
            </template>
          </VDropdown>
        </div>
      </div>
    </div>

    <template #footer>
      <div class=":uno: w-full flex items-center justify-between gap-3">
        <VSpace>
          <VButton type="secondary" :loading="submitting" :disabled="!canSubmit" @click="create">{{
            submitText
          }}</VButton>
          <VButton @click="emit('close')">取消</VButton>
        </VSpace>
        <button type="button" class="studio-export-link" @click="emit('history')">导出记录</button>
      </div>
    </template>
  </VModal>
</template>
