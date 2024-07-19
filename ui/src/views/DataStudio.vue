<script setup lang="ts">
import WarningModal from '@/components/WarningModal.vue';
import type { ListResponse, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import {
  IconCloseCircle,
  VButton,
  VCard,
  VLoading,
  VPageHeader,
  VPagination,
  VSpace,
} from '@halo-dev/components';
import { useQuery } from '@tanstack/vue-query';
import { useRouteQuery } from '@vueuse/router';
import { computed, ref, watch } from 'vue';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import DataCreationModal from './components/DataCreationModal.vue';
import DataListItem from './components/DataListItem.vue';
import DataUpdateSection from './components/DataUpdateSection.vue';
import { useDataImport } from './composables/use-data-import';

const { data: schemes } = useQuery({
  queryKey: ['plugin-data-studio:schemes'],
  queryFn: async () => {
    const { data } = await axiosInstance.get(
      '/apis/console.api.datastudio.halo.run/v1alpha1/schemes'
    );
    return data;
  },
});

const selectedSchemeName = useRouteQuery<string>('scheme', '');
const selectedScheme = computed(() => {
  return schemes.value?.find((scheme: any) => scheme.type === selectedSchemeName.value);
});

watch(
  () => schemes.value,
  () => {
    if (!selectedSchemeName.value && schemes.value.length > 0) {
      selectedSchemeName.value = schemes.value[0].type;
    }
  },
  {
    immediate: true,
  }
);

const page = useRouteQuery<number>('page', 1, {
  transform: Number,
});
const size = useRouteQuery<number>('size', 20, {
  transform: Number,
});

const keyword = ref('');

const { data, isLoading } = useQuery({
  queryKey: ['plugin-data-studio:data', selectedScheme, page, size, keyword],
  queryFn: async () => {
    const { data } = await axiosInstance.get<ListResponse<Unstructured>>(
      buildBaseApiUrl(selectedScheme.value),
      {
        params: {
          page: page.value,
          size: size.value,
          fieldSelector: keyword.value ? `metadata.name=${keyword.value}` : undefined,
        },
      }
    );
    return data;
  },
  refetchInterval: (data) => {
    const hasDeletingData = data?.items?.some((data) => !!data.metadata.deletionTimestamp);

    return hasDeletingData ? 1000 : false;
  },
  enabled: computed(() => !!selectedScheme.value),
});

const selectedData = ref();

watch([() => selectedScheme.value, () => data.value], () => {
  selectedData.value = undefined;
});

watch(
  () => selectedScheme.value,
  () => {
    page.value = 1;
    size.value = 20;
  }
);

const creationModalVisible = ref();

// Import data
const { open } = useDataImport(selectedScheme);
</script>

<template>
  <WarningModal />
  <DataCreationModal
    v-if="creationModalVisible"
    :scheme="selectedScheme"
    @close="creationModalVisible = false"
  />
  <VPageHeader title="Data Studio">
    <template #icon>
      <TablerDatabaseEdit class="mr-2 self-center" />
    </template>
  </VPageHeader>
  <div class="m-0 md:m-4">
    <VCard style="height: calc(100vh - 5.5rem)" :body-class="['h-full', '!p-0']">
      <div class="h-full flex divide-x">
        <div class="w-64 flex-none overflow-auto">
          <div class="sticky top-0 z-10 h-12 flex items-center border-b bg-white px-4">
            <h2 class="text-green-900 font-semibold">所有模型（{{ schemes?.length || 0 }}）</h2>
          </div>
          <ul class="box-border h-full w-full divide-y divide-gray-100" role="list">
            <li
              v-for="scheme in schemes"
              :key="scheme.type"
              class="relative cursor-pointer"
              @click="selectedSchemeName = scheme.type"
            >
              <div
                v-show="selectedScheme?.type === scheme.type"
                class="bg-primary absolute inset-y-0 left-0 w-0.5"
              ></div>
              <div class="flex flex-col px-4 py-2.5 space-y-1.5 hover:bg-gray-50">
                <h3 class="text-sm text-gray-900 font-medium">
                  {{ scheme.groupVersionKind.kind }}
                </h3>
                <p class="line-clamp-1 text-xs text-gray-600">
                  {{
                    [
                      scheme.groupVersionKind.group,
                      scheme.groupVersionKind.version,
                      scheme.groupVersionKind.kind,
                    ]
                      .filter(Boolean)
                      .join('/')
                  }}
                </p>
              </div>
            </li>
          </ul>
        </div>
        <div class="flex flex-1 shrink flex-col" :class="{ 'w-auto flex-none': !!selectedData }">
          <div
            v-if="selectedScheme"
            class="sticky top-0 h-12 w-full flex items-center justify-between border-b px-4"
          >
            <div class="flex items-center gap-4">
              <h2 class="text-green-900 font-semibold">
                {{ selectedScheme?.groupVersionKind?.kind }}
              </h2>
              <input
                v-model.lazy="keyword"
                placeholder="输入 metadata.name 筛选"
                class="w-64 px-0 text-sm"
              />
              <IconCloseCircle
                v-if="keyword"
                class="text-primary cursor-pointer"
                @click="keyword = ''"
              />
            </div>
            <VSpace>
              <VButton size="sm" @click="open">导入</VButton>
              <VButton size="sm" type="secondary" @click="creationModalVisible = true">
                新增
              </VButton>
            </VSpace>
          </div>
          <VLoading v-if="isLoading" />
          <div v-else-if="!data?.items?.length" class="flex flex-1 shrink justify-center py-10">
            <span class="text-sm text-gray-600"> 此模型当前没有数据 </span>
          </div>
          <ul
            v-else
            class="box-border h-full w-full flex-1 shrink overflow-auto divide-y divide-gray-100"
            role="list"
          >
            <li
              v-for="item in data?.items"
              :key="item.metadata.name"
              class="cursor-pointer"
              @click="selectedData = item"
            >
              <DataListItem :scheme="selectedScheme" :data="item" :selected-data="selectedData" />
            </li>
          </ul>
          <div class="h-14 flex flex-none items-center justify-center border-t bg-white px-4">
            <VPagination
              v-model:page="page"
              v-model:size="size"
              :total="data?.total || 0"
              :size-options="[20, 30, 50, 100]"
            />
          </div>
        </div>
        <div v-if="selectedData && selectedScheme" class="h-full flex-1 shrink overflow-auto">
          <DataUpdateSection
            :scheme="selectedScheme"
            :data="selectedData"
            @close="selectedData = undefined"
          />
        </div>
      </div>
    </VCard>
  </div>
</template>
