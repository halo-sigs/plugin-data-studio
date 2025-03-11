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
  }>(),
  {}
);

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const queryClient = useQueryClient();
const modal = ref<InstanceType<typeof VModal> | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isSubmitting = ref(false);
const selectedFiles = ref<File[]>([]);
const importResults = ref<Array<{ name: string; status: 'success' | 'error'; message?: string }>>([]);

const handleFileSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (files) {
    selectedFiles.value = Array.from(files);
  }
};

const handleBatchImport = async () => {
  if (!selectedFiles.value.length) {
    Toast.warning('请选择要导入的文件');
    return;
  }

  isSubmitting.value = true;
  importResults.value = [];

  try {
    for (const file of selectedFiles.value) {
      try {
        const content = await file.text();
        const data = JSON.parse(content);
        
        // 处理单个文件或多条数据的情况
        const dataArray = Array.isArray(data) ? data : [data];
        
        for (const item of dataArray) {
          try {
            await axiosInstance.post(buildBaseApiUrl(props.scheme), item);
            importResults.value.push({
              name: item.metadata?.name || file.name,
              status: 'success'
            });
          } catch (error: any) {
            importResults.value.push({
              name: item.metadata?.name || file.name,
              status: 'error',
              message: error.response?.data?.message || '导入失败'
            });
          }
        }
      } catch (error) {
        importResults.value.push({
          name: file.name,
          status: 'error',
          message: '文件格式错误'
        });
      }
    }

    const successCount = importResults.value.filter(r => r.status === 'success').length;
    const errorCount = importResults.value.filter(r => r.status === 'error').length;

    if (errorCount === 0) {
      Toast.success(`成功导入 ${successCount} 条数据`);
      queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
      modal.value?.close();
    } else {
      Toast.warning(`导入完成：${successCount} 条成功，${errorCount} 条失败`);
    }
  } finally {
    isSubmitting.value = false;
  }
};

const resetForm = () => {
  selectedFiles.value = [];
  importResults.value = [];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};
</script>

<template>
  <VModal ref="modal" title="批量导入数据" @close="emit('close')">
    <div class="p-4">
      <div class="mb-4">
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".json"
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          @change="handleFileSelect"
        />
        <p class="mt-2 text-sm text-gray-500">支持选择多个 JSON 文件，或包含多条数据的单个 JSON 文件</p>
      </div>

      <div v-if="importResults.length > 0" class="mt-4">
        <h3 class="text-sm font-medium mb-2">导入结果：</h3>
        <div class="max-h-60 overflow-y-auto">
          <div
            v-for="(result, index) in importResults"
            :key="index"
            class="text-sm p-2 mb-1 rounded"
            :class="{
              'bg-green-50 text-green-700': result.status === 'success',
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
          type="secondary"
          :loading="isSubmitting"
          :disabled="selectedFiles.length === 0"
          @click="handleBatchImport"
        >
          开始导入
        </VButton>
        <VButton @click="modal?.close()">关闭</VButton>
      </VSpace>
    </template>
  </VModal>
</template> 