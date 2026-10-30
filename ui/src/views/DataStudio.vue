<script setup lang="ts">
import WarningModal from '@/components/WarningModal.vue';
import type { ListResponse, Scheme, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
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
import TablerChevronLeft from '~icons/tabler/chevron-left';
import TablerChevronRight from '~icons/tabler/chevron-right';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import TablerSearch from '~icons/tabler/search';
import DataBatchImportModal from './components/DataBatchImportModal.vue';
import DataListItem from './components/DataListItem.vue';
import DataUpdateSection from './components/DataUpdateSection.vue';
import ModelSelector from './components/ModelSelector.vue';
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
const keyword = shallowRef('');
watch(keyword, () => {
  page.value = 1;
});
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: ['plugin-data-studio:data', selectedScheme, page, size, keyword],
  queryFn: async () => {
    if (!selectedScheme.value) return;
    return (
      await axiosInstance.get<ListResponse<Unstructured>>(buildBaseApiUrl(selectedScheme.value), {
        params: {
          page: page.value,
          size: size.value,
          fieldSelector: keyword.value ? `metadata.name=${keyword.value}` : undefined,
        },
      })
    ).data;
  },
  refetchInterval: (data) =>
    data?.items.some((item) => !!item.metadata.deletionTimestamp) ? 1000 : false,
  enabled: computed(() => !!selectedScheme.value),
});

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
watch(selectedSchemeName, () => {
  selectedData.value = undefined;
  isCreating.value = false;
  keyword.value = '';
  page.value = 1;
});

const batchImportModalVisible = shallowRef(false);
const { open } = useDataImport(selectedScheme);
const selectedItems = ref(new Set<string>());
const isSelectAll = computed(
  () =>
    !!data.value?.items.length &&
    data.value.items.every((item) => selectedItems.value.has(item.metadata.name))
);
const partiallySelected = computed(() => selectedItems.value.size > 0 && !isSelectAll.value);
watch([selectedSchemeName, page, size, keyword], () => selectedItems.value.clear());
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
function exportSelection() {
  const items = data.value?.items.filter((item) => selectedItems.value.has(item.metadata.name));
  if (!items?.length) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${selectedScheme.value?.groupVersionKind.kind}-batch-export.json`;
  link.click();
  URL.revokeObjectURL(url);
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
                <span class=":uno: text-gray-500 font-normal">({{ data?.total || 0 }})</span>
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
                <VButton size="sm" type="secondary" @click="edit()">新增</VButton>
              </div>
            </div>
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
              <VButton size="xs" @click="exportSelection">导出</VButton>
              <VButton size="xs" type="danger" @click="deleteSelection">删除</VButton>
            </template>
          </div>
          <div class="studio-records-scroll">
            <VLoading v-if="isLoading" />
            <div v-else-if="isError" class="studio-empty" role="alert">
              <p>数据加载失败</p>
              <VButton size="sm" @click="refetch()">重试</VButton>
            </div>
            <div v-else-if="!data?.items.length" class="studio-empty">
              <p>{{ keyword ? '没有匹配的数据' : '此模型当前没有数据' }}</p>
              <VButton v-if="keyword" size="sm" @click="keyword = ''">清空筛选</VButton>
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
