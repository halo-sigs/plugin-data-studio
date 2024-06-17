<script setup lang="ts">
import WarningModal from '@/components/WarningModal.vue';
import type { ListResponse, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { VButton, VCard, VLoading, VPageHeader, VPagination, VSpace } from '@halo-dev/components';
import { useQuery } from '@tanstack/vue-query';
import { useRouteQuery } from '@vueuse/router';
import axios from 'axios';
import { computed, ref, watch } from 'vue';
import TablerDatabaseEdit from '~icons/tabler/database-edit';
import DataCreationModal from './components/DataCreationModal.vue';
import DataListItem from './components/DataListItem.vue';
import DataUpdateSection from './components/DataUpdateSection.vue';
import { useDataImport } from './composables/use-data-import';

const { data: schemes } = useQuery({
  queryKey: ['plugin-data-studio:schemes'],
  queryFn: async () => {
    const { data } = await axios.get('/apis/console.api.datastudio.halo.run/v1alpha1/schemes');
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

const { data, isLoading } = useQuery({
  queryKey: ['plugin-data-studio:data', selectedScheme, page, size],
  queryFn: async () => {
    const { data } = await axios.get<ListResponse<Unstructured>>(
      buildBaseApiUrl(selectedScheme.value),
      {
        params: {
          page: page.value,
          size: size.value,
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
      <TablerDatabaseEdit class="ds-mr-2 ds-self-center" />
    </template>
  </VPageHeader>
  <div class="ds-m-0 md:ds-m-4">
    <VCard style="height: calc(100vh - 5.5rem)" :body-class="['ds-h-full', '!ds-p-0']">
      <div class="ds-flex ds-h-full ds-divide-x">
        <div class="ds-w-64 ds-flex-none ds-overflow-auto">
          <div
            class="ds-sticky ds-top-0 ds-z-10 ds-flex ds-h-12 ds-items-center ds-border-b ds-bg-white ds-px-4"
          >
            <h2 class="ds-font-semibold ds-text-green-900">
              所有模型（{{ schemes?.length || 0 }}）
            </h2>
          </div>
          <ul class="ds-box-border ds-h-full ds-w-full ds-divide-y ds-divide-gray-100" role="list">
            <li
              v-for="scheme in schemes"
              :key="scheme.type"
              class="ds-relative ds-cursor-pointer"
              @click="selectedSchemeName = scheme.type"
            >
              <div
                v-show="selectedScheme?.type === scheme.type"
                class="bg-primary ds-absolute ds-inset-y-0 ds-left-0 ds-w-0.5"
              ></div>
              <div class="ds-flex ds-flex-col ds-space-y-1.5 ds-px-4 ds-py-2.5 hover:ds-bg-gray-50">
                <h3 class="ds-text-sm ds-font-medium ds-text-gray-900">
                  {{ scheme.groupVersionKind.kind }}
                </h3>
                <p class="ds-line-clamp-1 ds-text-xs ds-text-gray-600">
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
        <div
          class="ds-flex ds-flex-1 ds-shrink ds-flex-col"
          :class="{ 'ds-w-auto ds-flex-none': !!selectedData }"
        >
          <div
            v-if="selectedScheme"
            class="ds-sticky ds-top-0 ds-flex ds-h-12 ds-w-full ds-items-center ds-justify-between ds-border-b ds-px-4"
          >
            <h2 class="ds-font-semibold ds-text-green-900">
              {{ selectedScheme?.groupVersionKind?.kind }}
            </h2>
            <VSpace>
              <VButton size="sm" @click="open">导入</VButton>
              <VButton size="sm" type="secondary" @click="creationModalVisible = true">
                新增
              </VButton>
            </VSpace>
          </div>
          <VLoading v-if="isLoading" />
          <div
            v-else-if="!data?.items?.length"
            class="ds-flex ds-flex-1 ds-shrink ds-justify-center ds-py-10"
          >
            <span class="ds-text-sm ds-text-gray-600"> 此模型当前没有数据 </span>
          </div>
          <ul
            v-else
            class="ds-box-border ds-h-full ds-w-full ds-flex-1 ds-shrink ds-divide-y ds-divide-gray-100 ds-overflow-auto"
            role="list"
          >
            <li
              v-for="item in data?.items"
              :key="item.metadata.name"
              class="ds-cursor-pointer"
              @click="selectedData = item"
            >
              <DataListItem :scheme="selectedScheme" :data="item" :selected-data="selectedData" />
            </li>
          </ul>
          <div
            class="ds-flex ds-h-14 ds-flex-none ds-items-center ds-justify-center ds-border-t ds-bg-white ds-px-4"
          >
            <VPagination
              v-model:page="page"
              v-model:size="size"
              :total="data?.total || 0"
              :size-options="[20, 30, 50, 100]"
            />
          </div>
        </div>
        <div
          v-if="selectedData && selectedScheme"
          class="ds-h-full ds-flex-1 ds-shrink ds-overflow-auto"
        >
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
