<script setup lang="ts">
import type { ExportJob, ListResponse, Scheme } from '@/types';
import { apiErrorMessage, EXPORT_JOB_API, schemeApiVersion } from '@/utils/api';
import {
  exportDownloadUrl,
  exportJobDescription,
  exportJobStatusLabel,
  exportJobStatusState,
  isExportJobActive,
} from '@/utils/export';
import { axiosInstance } from '@halo-dev/api-client';
import {
  Dialog,
  Toast,
  VButton,
  VDropdownItem,
  VEmpty,
  VEntity,
  VEntityContainer,
  VEntityField,
  VLoading,
  VModal,
  VPagination,
  VSpace,
  VStatusDot,
} from '@halo-dev/components';
import { utils } from '@halo-dev/ui-shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

const props = defineProps<{ scheme: Scheme }>();
const emit = defineEmits<{ close: [] }>();

const queryClient = useQueryClient();
const JOBS_KEY = ['plugin-data-studio:export-jobs', props.scheme.type];
const page = ref(1);
const size = ref(20);
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: [...JOBS_KEY, page, size],
  queryFn: async () => {
    const { data } = await axiosInstance.get<ListResponse<ExportJob>>(EXPORT_JOB_API, {
      params: {
        page: page.value,
        size: size.value,
        sort: 'metadata.creationTimestamp,desc',
        fieldSelector: [
          `spec.apiVersion=${schemeApiVersion(props.scheme)}`,
          `spec.kind=${props.scheme.groupVersionKind.kind}`,
        ],
      },
    });
    return data;
  },
  keepPreviousData: true,
  refetchInterval: (result) => (result?.items.some(isExportJobActive) ? 1500 : false),
});
const jobs = computed(() =>
  (data.value?.items || []).filter((job) => !job.metadata.deletionTimestamp)
);
// Deleting the last record of a page would otherwise leave an empty page.
watch(data, (result) => {
  if (result && !result.items.length && page.value > 1) page.value--;
});

function download(job: ExportJob) {
  window.open(exportDownloadUrl(job.metadata.name), '_blank');
}
function remove(job: ExportJob) {
  const active = isExportJobActive(job);
  Dialog.warning({
    title: '删除导出记录',
    description: active ? '导出将停止，已生成的部分文件会被删除。' : '删除后文件将无法下载。',
    confirmType: 'danger',
    async onConfirm() {
      try {
        await axiosInstance.delete(`${EXPORT_JOB_API}/${encodeURIComponent(job.metadata.name)}`);
        await queryClient.invalidateQueries({ queryKey: JOBS_KEY });
        Toast.success('已删除');
      } catch (error) {
        Toast.error(apiErrorMessage(error, '删除失败'));
      }
    },
  });
}
</script>

<template>
  <VModal
    title="导出记录"
    :width="640"
    :body-class="['studio-export-history-body']"
    @close="emit('close')"
  >
    <div class="studio-export-history">
      <VLoading v-if="isLoading" />
      <div v-else-if="isError" class="studio-empty" role="alert">
        <p>导出记录加载失败</p>
        <VButton size="sm" @click="refetch()">重试</VButton>
      </div>
      <VEmpty v-else-if="!jobs.length" title="暂无导出记录" />
      <VEntityContainer v-else>
        <VEntity v-for="job in jobs" :key="job.metadata.name">
          <template #start>
            <VEntityField
              :title="job.status?.fileName || `${job.spec.kind} 导出`"
              :description="exportJobDescription(job)"
            />
          </template>
          <template #end>
            <VEntityField :description="utils.date.format(job.metadata.creationTimestamp)" />
            <VEntityField>
              <template #description>
                <VButton v-if="job.status?.phase === 'SUCCEEDED'" size="sm" @click="download(job)"
                  >下载</VButton
                >
                <VStatusDot
                  v-else
                  :state="exportJobStatusState(job)"
                  :animate="isExportJobActive(job)"
                  :text="exportJobStatusLabel(job)"
                />
              </template>
            </VEntityField>
          </template>
          <template #dropdownItems>
            <VDropdownItem type="danger" @click="remove(job)">删除</VDropdownItem>
          </template>
        </VEntity>
      </VEntityContainer>
      <div v-if="(data?.total || 0) > 20" class="studio-export-history-pagination">
        <VPagination
          v-model:page="page"
          v-model:size="size"
          :total="data?.total || 0"
          :size-options="[20, 50, 100]"
          size-label="条/页"
        />
      </div>
    </div>
    <template #footer>
      <div class=":uno: w-full flex items-center justify-between gap-3">
        <span class="studio-export-hint">文件保留 24 小时</span>
        <VSpace>
          <VButton @click="emit('close')">关闭</VButton>
        </VSpace>
      </div>
    </template>
  </VModal>
</template>
