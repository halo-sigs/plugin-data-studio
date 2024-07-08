<script lang="ts" setup>
import type { Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { formatDatetime } from '@/utils/date';
import { axiosInstance } from '@halo-dev/api-client';
import {
  Dialog,
  Toast,
  VDropdownDivider,
  VDropdownItem,
  VEntity,
  VEntityField,
  VStatusDot,
} from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';

const queryClient = useQueryClient();

const props = withDefaults(
  defineProps<{
    data: Unstructured;
    scheme: any;
    selectedData?: Unstructured;
  }>(),
  { selectedData: undefined }
);

function handleExport() {
  const blob = new Blob([JSON.stringify(props.data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.data.metadata.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleDelete() {
  Dialog.warning({
    title: '删除数据',
    description: '请确认是否删除该数据，删除后无法恢复',
    confirmType: 'danger',
    async onConfirm() {
      try {
        await axiosInstance.delete(`${buildBaseApiUrl(props.scheme)}/${props.data.metadata.name}`);
        Toast.success('删除成功');

        queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
      } catch (error) {
        Toast.error('删除失败');
      }
    },
  });
}
</script>

<template>
  <VEntity :is-selected="data.metadata.name === selectedData?.metadata.name">
    <template #start>
      <VEntityField :title="data.metadata.name">
        <template #description>
          <div class="ds-rounded-md ds-bg-gray-50 ds-p-1">
            <code class="ds-line-clamp-3 ds-break-all ds-text-xs ds-text-gray-600">
              {{ data }}
            </code>
          </div>
        </template>
      </VEntityField>
    </template>
    <template v-if="!selectedData" #end>
      <VEntityField v-if="data.metadata.deletionTimestamp">
        <template #description>
          <VStatusDot v-tooltip="'删除中'" state="warning" animate />
        </template>
      </VEntityField>
      <VEntityField :description="formatDatetime(data.metadata.creationTimestamp)"></VEntityField>
    </template>
    <template #dropdownItems>
      <VDropdownItem @click="handleExport()">导出</VDropdownItem>
      <VDropdownDivider></VDropdownDivider>
      <VDropdownItem type="danger" @click="handleDelete()">删除</VDropdownItem>
    </template>
  </VEntity>
</template>
