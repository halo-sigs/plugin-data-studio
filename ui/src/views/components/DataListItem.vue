<script lang="ts" setup>
import type { Scheme, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { summarizeResource } from '@/utils/resource';
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
import { utils } from '@halo-dev/ui-shared';
import { useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

const queryClient = useQueryClient();
const emit = defineEmits<{ select: [] }>();

const props = withDefaults(
  defineProps<{
    data: Unstructured;
    scheme: Scheme;
    selectedData?: Unstructured;
  }>(),
  { selectedData: undefined }
);
const summary = computed(() => summarizeResource(props.data));

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
        await axiosInstance.delete(
          `${buildBaseApiUrl(props.scheme)}/${encodeURIComponent(props.data.metadata.name)}`
        );
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
  <VEntity
    class=":uno: cursor-pointer"
    role="button"
    tabindex="0"
    :aria-label="`编辑 ${data.metadata.name}`"
    @click="emit('select')"
    @keydown.enter.self="emit('select')"
    @keydown.space.self.prevent="emit('select')"
    :is-selected="data.metadata.name === selectedData?.metadata.name"
  >
    <template #checkbox>
      <slot name="checkbox" />
    </template>
    <template #start>
      <VEntityField :title="data.metadata.name">
        <template #description>
          <div class=":uno: min-w-0 w-full">
            <span v-if="summary" class="studio-record-summary" :title="summary">{{ summary }}</span>
          </div>
        </template>
      </VEntityField>
    </template>
    <template #end>
      <VEntityField
        v-if="!selectedData"
        :description="utils.date.format(data.metadata.creationTimestamp)"
      />
      <VEntityField v-if="data.metadata.deletionTimestamp">
        <template #description>
          <VStatusDot v-tooltip="'删除中'" state="warning" animate />
        </template>
      </VEntityField>
    </template>
    <template #dropdownItems>
      <VDropdownItem @click.stop="handleExport()">导出</VDropdownItem>
      <VDropdownDivider></VDropdownDivider>
      <VDropdownItem type="danger" @click.stop="handleDelete()">删除</VDropdownItem>
    </template>
  </VEntity>
</template>
