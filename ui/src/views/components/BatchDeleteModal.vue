<script lang="ts" setup>
import type { Scheme } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { Toast, VButton, VModal, VSpace } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    scheme: Scheme;
    selectedItems: Set<string>;
  }>(),
  {}
);

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'deleted'): void;
}>();

const queryClient = useQueryClient();
const modal = ref<InstanceType<typeof VModal> | null>(null);
const isDeleting = ref(false);
const deleteResults = ref<Array<{ name: string; status: 'success' | 'error'; message?: string }>>([]);

const handleBatchDelete = async () => {
  if (!props.selectedItems.size) {
    Toast.warning('请选择要删除的数据');
    return;
  }

  isDeleting.value = true;
  deleteResults.value = [];

  try {
    for (const name of props.selectedItems) {
      try {
        await axiosInstance.delete(`${buildBaseApiUrl(props.scheme)}/${name}`);
        deleteResults.value.push({
          name: name,
          status: 'success'
        });
      } catch (error: any) {
        deleteResults.value.push({
          name: name,
          status: 'error',
          message: error.response?.data?.message || '删除失败'
        });
      }
    }

    const successCount = deleteResults.value.filter(r => r.status === 'success').length;
    const errorCount = deleteResults.value.filter(r => r.status === 'error').length;

    if (errorCount === 0) {
      Toast.success(`成功删除 ${successCount} 条数据`);
      queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
      emit('deleted');
      modal.value?.close();
    } else {
      Toast.warning(`删除完成：${successCount} 条成功，${errorCount} 条失败`);
    }
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <VModal ref="modal" title="批量删除数据" @close="emit('close')">
    <div class="p-4">
      <div class="mb-4">
        <p class="text-sm text-gray-600">
          确定要删除选中的 {{ selectedItems.size }} 条数据吗？此操作不可恢复。
        </p>
      </div>

      <div v-if="deleteResults.length > 0" class="mt-4">
        <h3 class="text-sm font-medium mb-2">删除结果：</h3>
        <div class="max-h-60 overflow-y-auto">
          <div
            v-for="(result, index) in deleteResults"
            :key="index"
            class="text-sm p-2 mb-1 rounded"
            :class="{
              'bg-gray-50 text-gray-700': result.status === 'success',
              'bg-red-50 text-red-700': result.status === 'error'
            }"
          >
            <div class="flex items-center justify-between">
              <span>{{ result.name }}</span>
              <span>{{ result.status === 'success' ? '成功' : '失败' }}</span>
            </div>
            <div v-if="result.message" class="text-xs mt-1">{{ result.message }}</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <VSpace>
        <VButton
          type="danger"
          :loading="isDeleting"
          @click="handleBatchDelete"
        >
          确认删除
        </VButton>
        <VButton @click="modal?.close()">取消</VButton>
      </VSpace>
    </template>
  </VModal>
</template> 