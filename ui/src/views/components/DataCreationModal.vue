<script lang="ts" setup>
import DataEditor from '@/components/DataEditor.vue';
import type { Scheme } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { Toast, VButton, VModal, VSpace } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { ref } from 'vue';

const queryClient = useQueryClient();

const props = withDefaults(
  defineProps<{
    scheme: Scheme;
  }>(),
  {}
);

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const modal = ref<InstanceType<typeof VModal> | null>(null);

const dataEditorRef = ref<InstanceType<typeof DataEditor> | null>(null);

const isSubmitting = ref(false);

async function handleSave() {
  try {
    isSubmitting.value = true;
    await axiosInstance.post(buildBaseApiUrl(props.scheme), dataEditorRef.value?.getData());
    Toast.success('保存成功');
    queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
    modal.value?.close();
  } catch (error) {
    Toast.error('保存失败');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <VModal ref="modal" :width="1240" title="新增数据" @close="emit('close')">
    <DataEditor ref="dataEditorRef" :scheme="scheme" />
    <template #footer>
      <VSpace>
        <VButton type="secondary" :loading="isSubmitting" @click="handleSave">保存</VButton>
        <VButton @click="modal?.close()">关闭</VButton>
      </VSpace>
    </template>
  </VModal>
</template>
