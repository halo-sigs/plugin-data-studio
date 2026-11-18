<script setup lang="ts">
import WarningModal from '@/components/WarningModal.vue';
import type { DataQuery, QueryPreset, Scheme, Unstructured } from '@/types';
import {
  apiErrorMessage,
  apiErrorStatus,
  buildBaseApiUrl,
  buildListParams,
  fetchRecords,
} from '@/utils/api';
import { formatDateRange, parseDateRange, stringifyDateRange } from '@/utils/date-range';
import { axiosInstance } from '@halo-dev/api-client';
import {
  Dialog,
  Toast,
  VButton,
  VCard,
  VDropdown,
  VDropdownItem,
  VEntityContainer,
  VLoading,
  VPagination,
} from '@halo-dev/components';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouteQuery } from '@vueuse/router';
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import TablerArrowDown from '~icons/tabler/arrow-down';
import TablerArrowUp from '~icons/tabler/arrow-up';
import TablerCalendar from '~icons/tabler/calendar';
import TablerChevronLeft from '~icons/tabler/chevron-left';
import TablerChevronRight from '~icons/tabler/chevron-right';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import TablerFilter from '~icons/tabler/filter';
import TablerSearch from '~icons/tabler/search';
import TablerX from '~icons/tabler/x';
import DataBatchImportModal from './components/DataBatchImportModal.vue';
import DataExportModal from './components/DataExportModal.vue';
import DataListItem from './components/DataListItem.vue';
import DataUpdateSection from './components/DataUpdateSection.vue';
import ExportHistoryModal from './components/ExportHistoryModal.vue';
import ModelSelector from './components/ModelSelector.vue';
import QueryPanel from './components/QueryPanel.vue';
import QueryPresetMenu from './components/QueryPresetMenu.vue';
import { useDataImport } from './composables/use-data-import';

const queryClient = useQueryClient();
const {
  data: schemes,
  isLoading: loadingSchemes,
  isError: schemesError,
  refetch: reloadSchemes,
} = useQuery({
  queryKey: ['plugin-data-studio:schemes'],
  queryFn: async () =>
    (await axiosInstance.get<Scheme[]>('/apis/console.api.datastudio.halo.run/v1alpha1/schemes'))
      .data,
});
const selectedSchemeName = useRouteQuery<string>('scheme', '');
const selectedScheme = computed(() =>
  schemes.value?.find((scheme) => scheme.type === selectedSchemeName.value)
);
watch(
  schemes,
  (items) => {
    if (!selectedSchemeName.value && items?.[0]) selectedSchemeName.value = items[0].type;
  },
  { immediate: true }
);
const page = useRouteQuery<number>('page', 1, { transform: Number });
const size = useRouteQuery<number>('size', 20, { transform: Number });
const keyword = useRouteQuery<string>('keyword', '');
watch(keyword, () => {
  page.value = 1;
});
// Conditions live in the URL so a refresh or shared link keeps the same result set.
const toTerms = (value: string | string[]) => [...new Set([value].flat().filter(Boolean))];
const fieldSelectors = useRouteQuery<string | string[], string[]>('fieldSelector', [], {
  transform: toTerms,
});
const labelSelectors = useRouteQuery<string | string[], string[]>('labelSelector', [], {
  transform: toTerms,
});
const sorts = useRouteQuery<string | string[], string[]>('sort', [], { transform: toTerms });
const createdParam = useRouteQuery<string>('created', '');
const createdRange = computed(() => parseDateRange(createdParam.value));
const activePreset = useRouteQuery<string>('preset', '');
const appliedQuery = computed<DataQuery>(() => ({
  fieldSelectors: fieldSelectors.value,
  labelSelectors: labelSelectors.value,
  sorts: sorts.value,
  createdRange: createdRange.value,
}));
const queryPanelVisible = shallowRef(false);
const customQueryCount = computed(
  () =>
    fieldSelectors.value.length +
    labelSelectors.value.length +
    sorts.value.length +
    (createdRange.value ? 1 : 0)
);
const hasCustomQuery = computed(() => customQueryCount.value > 0);
function sortTerm(term: string) {
  const [field, direction] = term.split(',');
  return { field, desc: direction?.trim().toLowerCase() === 'desc' };
}
const { data, isLoading, isError, error, refetch } = useQuery({
  queryKey: [
    'plugin-data-studio:data',
    selectedScheme,
    page,
    size,
    keyword,
    fieldSelectors,
    labelSelectors,
    sorts,
    createdRange,
  ],
  queryFn: async () => {
    if (!selectedScheme.value) return;
    return fetchRecords(
      selectedScheme.value,
      buildListParams({
        page: page.value,
        size: size.value,
        keyword: keyword.value,
        ...appliedQuery.value,
      })
    );
  },
  refetchInterval: (data) =>
    data?.items.some((item) => !!item.metadata.deletionTimestamp) ? 1000 : false,
  enabled: computed(() => !!selectedScheme.value),
  // A rejected custom condition will fail the same way again.
  retry: (failureCount) => !hasCustomQuery.value && failureCount < 3,
});
const dataError = computed(() => apiErrorMessage(error.value, '数据加载失败'));
// Only rejections of the query itself (500) hint at a missing index.
const indexError = computed(() => hasCustomQuery.value && apiErrorStatus(error.value) === 500);
const hasFilter = computed(() => !!keyword.value || hasCustomQuery.value);
function resetFilters() {
  keyword.value = '';
  clearQuery();
}
function applyQuery(query: DataQuery) {
  fieldSelectors.value = query.fieldSelectors;
  labelSelectors.value = query.labelSelectors;
  sorts.value = query.sorts;
  createdParam.value = stringifyDateRange(query.createdRange);
  page.value = 1;
}
function applyPreset(preset: QueryPreset) {
  applyQuery({
    fieldSelectors: preset.spec.fieldSelectors || [],
    labelSelectors: preset.spec.labelSelectors || [],
    sorts: preset.spec.sorts || [],
    createdRange: preset.spec.createdRange,
  });
  activePreset.value = preset.metadata.name;
}
function removeTerm(key: 'fieldSelectors' | 'labelSelectors' | 'sorts', index: number) {
  applyQuery({
    ...appliedQuery.value,
    [key]: appliedQuery.value[key].filter((_, i) => i !== index),
  });
}
function presetRemoved(preset: QueryPreset) {
  if (preset.metadata.name === activePreset.value) activePreset.value = '';
}
function clearQuery() {
  applyQuery({ fieldSelectors: [], labelSelectors: [], sorts: [] });
  activePreset.value = '';
}

// The editor owns a snapshot; list refetches must not replace an active draft.
const selectedData = shallowRef<Unstructured>();
const isCreating = shallowRef(false);
const editSession = shallowRef(0);
const hasEditor = computed(() => !!selectedData.value || isCreating.value);
const detail = shallowRef<InstanceType<typeof DataUpdateSection>>();
const list = shallowRef<HTMLElement>();
let lastRecordName = '';
async function edit(item?: Unstructured) {
  if (item && !isCreating.value && selectedData.value?.metadata.name === item.metadata.name) return;
  if (detail.value && !(await detail.value.confirmLeave())) return;
  selectedData.value = item;
  isCreating.value = !item;
  editSession.value++;
  if (item) lastRecordName = item.metadata.name;
}
async function selectScheme(scheme: Scheme) {
  if (scheme.type === selectedSchemeName.value) return;
  if (detail.value && !(await detail.value.confirmLeave())) return;
  selectedSchemeName.value = scheme.type;
}
async function closeEditor() {
  selectedData.value = undefined;
  isCreating.value = false;
  await nextTick();
  list.value
    ?.querySelector<HTMLElement>(`[data-record-name="${CSS.escape(lastRecordName)}"]`)
    ?.focus();
}
function saved(item: Unstructured) {
  selectedData.value = item;
  isCreating.value = false;
}
const batchImportModalVisible = shallowRef(false);
const exportModalVisible = shallowRef(false);
const exportSelectionNames = shallowRef<string[]>();
const exportHistoryVisible = shallowRef(false);
function openExport(selection?: string[]) {
  exportSelectionNames.value = selection;
  exportModalVisible.value = true;
}
function openExportHistory() {
  exportModalVisible.value = false;
  exportHistoryVisible.value = true;
}
watch(selectedSchemeName, () => {
  selectedData.value = undefined;
  isCreating.value = false;
  keyword.value = '';
  exportModalVisible.value = false;
  exportHistoryVisible.value = false;
  clearQuery();
});

const { open } = useDataImport(selectedScheme);
const selectedItems = ref(new Set<string>());
const isSelectAll = computed(
  () =>
    !!data.value?.items.length &&
    data.value.items.every((item) => selectedItems.value.has(item.metadata.name))
);
const partiallySelected = computed(() => selectedItems.value.size > 0 && !isSelectAll.value);
watch([selectedSchemeName, page, size, keyword, fieldSelectors, labelSelectors, sorts], () =>
  selectedItems.value.clear()
);
watch(data, (value) => {
  const names = new Set(value?.items.map((item) => item.metadata.name));
  selectedItems.value = new Set([...selectedItems.value].filter((name) => names.has(name)));
});
function selectAll() {
  if (isSelectAll.value) selectedItems.value.clear();
  else data.value?.items.forEach((item) => selectedItems.value.add(item.metadata.name));
}
function selectItem(item: Unstructured) {
  if (selectedItems.value.has(item.metadata.name)) selectedItems.value.delete(item.metadata.name);
  else selectedItems.value.add(item.metadata.name);
}
function deleteSelection() {
  if (!selectedScheme.value) return;
  const url = buildBaseApiUrl(selectedScheme.value);
  const names = [...selectedItems.value];
  Dialog.warning({
    title: '删除数据',
    description: `请确认删除选中的 ${names.length} 条数据，删除后无法恢复。`,
    confirmType: 'danger',
    async onConfirm() {
      try {
        await Promise.all(
          names.map((name) => axiosInstance.delete(`${url}/${encodeURIComponent(name)}`))
        );
        Toast.success('删除成功');
        selectedItems.value.clear();
      } catch {
        Toast.error('部分数据可能未删除，请刷新后重试');
      } finally {
        void queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
      }
    },
  });
}
</script>

<template>
  <WarningModal />
  <DataBatchImportModal
    v-if="batchImportModalVisible && selectedScheme"
    :scheme="selectedScheme"
    @close="batchImportModalVisible = false"
  />
  <DataExportModal
    v-if="exportModalVisible && selectedScheme"
    :scheme="selectedScheme"
    v-model:keyword="keyword"
    :query="appliedQuery"
    :selection="exportSelectionNames"
    :active-preset="activePreset"
    @update:query="applyQuery"
    @select-preset="applyPreset"
    @remove-preset="presetRemoved"
    @close="exportModalVisible = false"
    @created="openExportHistory"
    @history="openExportHistory"
  />
  <ExportHistoryModal
    v-if="exportHistoryVisible && selectedScheme"
    :scheme="selectedScheme"
    @close="exportHistoryVisible = false"
  />
  <!-- Follow VPageHeader's title structure, with the model picker beside it. -->
  <header class="page-header studio-page-header">
    <h2 class="page-header__title">
      <TablerDatabaseEdit />
      <span class="page-header__title-text">Data Studio</span>
    </h2>
    <ModelSelector
      :schemes="schemes || []"
      :selected="selectedScheme"
      :loading="loadingSchemes"
      @select="selectScheme"
    />
  </header>
  <div class="studio-page">
    <VCard :body-class="['data-studio-card-body']" class="studio-card">
      <div v-if="schemesError" class="studio-empty" role="alert">
        <p>模型加载失败</p>
        <VButton size="sm" @click="reloadSchemes()">重试</VButton>
      </div>
      <VLoading v-else-if="loadingSchemes" />
      <div v-else-if="!selectedScheme" class="studio-empty">
        {{ schemes?.length ? '请选择一个模型' : '当前没有可用模型' }}
      </div>
      <div v-else class="studio-workspace" :class="{ 'has-editor': hasEditor }">
        <section ref="list" class="studio-records" aria-label="数据列表">
          <div class="studio-records-header">
            <div class=":uno: flex flex-wrap items-center justify-between gap-3">
              <h2 class=":uno: min-w-0 break-words text-base text-gray-900 font-semibold">
                {{ selectedScheme.groupVersionKind.kind }}
                <span v-if="!isError" class=":uno: text-gray-500 font-normal"
                  >({{ data?.total || 0 }})</span
                >
              </h2>
              <div v-if="!hasEditor" class=":uno: flex items-center gap-2">
                <VDropdown>
                  <VButton size="sm">导入</VButton>
                  <template #popper>
                    <VDropdownItem v-close-popper @click="open()">导入单条数据</VDropdownItem>
                    <VDropdownItem v-close-popper @click="batchImportModalVisible = true"
                      >批量导入</VDropdownItem
                    >
                  </template>
                </VDropdown>
                <VButton size="sm" @click="openExport()">导出</VButton>
                <VButton size="sm" type="secondary" @click="edit()">新增</VButton>
              </div>
            </div>
            <div class="studio-search-row">
              <form class="studio-search" @submit.prevent>
                <TablerSearch aria-hidden="true" />
                <input
                  v-model.lazy.trim="keyword"
                  aria-label="按名称精确查找"
                  placeholder="按名称精确查找"
                />
                <button
                  v-if="keyword"
                  type="button"
                  class=":uno: shrink-0 text-xs text-gray-500"
                  @click="keyword = ''"
                >
                  清空
                </button>
              </form>
              <div class="studio-query-actions">
                <VButton
                  class="studio-query-trigger"
                  :class="{ active: hasCustomQuery }"
                  :aria-expanded="queryPanelVisible"
                  @click="queryPanelVisible = !queryPanelVisible"
                >
                  <TablerFilter aria-hidden="true" />
                  查询条件<span v-if="customQueryCount"> · {{ customQueryCount }}</span>
                </VButton>
                <QueryPresetMenu
                  :scheme="selectedScheme"
                  :query="appliedQuery"
                  :active="activePreset"
                  @select="applyPreset"
                  @remove="presetRemoved"
                />
              </div>
            </div>
            <QueryPanel
              v-show="queryPanelVisible"
              :key="selectedSchemeName"
              :query="appliedQuery"
              @apply="applyQuery"
              @close="queryPanelVisible = false"
            />
            <div v-if="!queryPanelVisible && hasCustomQuery" class="studio-query-summary">
              <span v-if="createdRange" class="studio-query-term" title="创建时间"
                ><TablerCalendar aria-hidden="true" /><span>{{
                  formatDateRange(createdRange)
                }}</span
                ><button
                  type="button"
                  aria-label="移除创建时间"
                  @click="applyQuery({ ...appliedQuery, createdRange: undefined })"
                >
                  <TablerX aria-hidden="true" /></button
              ></span>
              <span
                v-for="(term, index) in fieldSelectors"
                :key="`field:${term}`"
                class="studio-query-term"
                title="字段条件"
                ><span>{{ term }}</span
                ><button
                  type="button"
                  :aria-label="`移除 ${term}`"
                  @click="removeTerm('fieldSelectors', index)"
                >
                  <TablerX aria-hidden="true" /></button
              ></span>
              <span
                v-for="(term, index) in labelSelectors"
                :key="`label:${term}`"
                class="studio-query-term label"
                title="标签条件"
                ><span>{{ term }}</span
                ><button
                  type="button"
                  :aria-label="`移除 ${term}`"
                  @click="removeTerm('labelSelectors', index)"
                >
                  <TablerX aria-hidden="true" /></button
              ></span>
              <span
                v-for="(term, index) in sorts"
                :key="`sort:${term}`"
                class="studio-query-term sort"
                :title="term"
                ><component
                  :is="sortTerm(term).desc ? TablerArrowDown : TablerArrowUp"
                  aria-hidden="true" /><span>{{ sortTerm(term).field }}</span
                ><button
                  type="button"
                  :aria-label="`移除 ${term}`"
                  @click="removeTerm('sorts', index)"
                >
                  <TablerX aria-hidden="true" /></button
              ></span>
              <button type="button" class="studio-query-clear" @click="clearQuery">清除</button>
            </div>
          </div>
          <div v-if="data?.items.length" class="studio-batch-bar">
            <label class=":uno: flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                :checked="isSelectAll"
                :indeterminate="partiallySelected"
                @change="selectAll"
              />全选本页
            </label>
            <template v-if="selectedItems.size">
              <span class=":uno: text-xs text-gray-500">已选 {{ selectedItems.size }} 条</span>
              <VButton size="xs" @click="openExport([...selectedItems])">导出</VButton>
              <VButton size="xs" type="danger" @click="deleteSelection">删除</VButton>
            </template>
          </div>
          <div class="studio-records-scroll">
            <VLoading v-if="isLoading" />
            <div v-else-if="isError" class="studio-empty" role="alert">
              <p>{{ indexError ? '条件无效或字段未建立索引' : dataError }}</p>
              <div class=":uno: flex items-center gap-2">
                <VButton
                  v-if="hasCustomQuery && !queryPanelVisible"
                  size="sm"
                  @click="queryPanelVisible = true"
                  >编辑条件</VButton
                >
                <VButton v-if="!indexError" size="sm" @click="refetch()">重试</VButton>
              </div>
            </div>
            <div v-else-if="!data?.items.length" class="studio-empty">
              <p>{{ hasFilter ? '没有匹配的数据' : '此模型当前没有数据' }}</p>
              <VButton v-if="hasFilter" size="sm" @click="resetFilters">清空筛选</VButton>
              <VButton v-else-if="!hasEditor" size="sm" @click="edit()">新增数据</VButton>
            </div>
            <VEntityContainer v-else>
              <DataListItem
                v-for="item in data.items"
                :key="item.metadata.name"
                :scheme="selectedScheme"
                :data="item"
                :selected-data="selectedData"
                :data-record-name="item.metadata.name"
                @select="edit(item)"
              >
                <template #checkbox>
                  <input
                    type="checkbox"
                    :checked="selectedItems.has(item.metadata.name)"
                    :aria-label="`选择 ${item.metadata.name}`"
                    @click.stop
                    @keydown.stop
                    @change="selectItem(item)"
                  />
                </template>
              </DataListItem>
            </VEntityContainer>
          </div>
          <div v-if="hasEditor || data?.total" class="studio-pagination">
            <template v-if="hasEditor">
              <span class=":uno: mr-auto text-xs text-gray-500">共 {{ data?.total || 0 }} 条</span>
              <VButton
                size="sm"
                :disabled="page <= 1 || isLoading"
                aria-label="上一页"
                @click="page--"
                ><TablerChevronLeft
              /></VButton>
              <span class=":uno: text-xs text-gray-600"
                >{{ page }} / {{ data?.totalPages || 1 }}</span
              >
              <VButton
                size="sm"
                :disabled="!data?.hasNext || isLoading"
                aria-label="下一页"
                @click="page++"
                ><TablerChevronRight
              /></VButton>
            </template>
            <VPagination
              v-else
              v-model:page="page"
              v-model:size="size"
              :total="data?.total || 0"
              :size-options="[20, 30, 50, 100]"
              size-label="条/页"
            />
          </div>
        </section>
        <DataUpdateSection
          v-if="hasEditor"
          :key="editSession"
          ref="detail"
          :scheme="selectedScheme"
          :data="selectedData"
          @close="closeEditor"
          @saved="saved"
        />
      </div>
    </VCard>
  </div>
</template>
