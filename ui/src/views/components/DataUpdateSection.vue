<script lang="ts" setup>
import DataEditor from '@/components/DataEditor.vue';
import type { Scheme, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { Toast, VButton, VSpace } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import axios from 'axios';
import { ref } from 'vue';

const queryClient = useQueryClient();

const props = withDefaults(
  defineProps<{
    data: Unstructured;
    scheme: Scheme;
  }>(),
  {}
);

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const dataEditorRef = ref<InstanceType<typeof DataEditor> | null>(null);

const isSubmitting = ref(false);

async function handleSave() {
  try {
    isSubmitting.value = true;
    await axios.put(
      `${buildBaseApiUrl(props.scheme)}/${props.data?.metadata?.name}`,
      dataEditorRef.value?.getData()
    );
    Toast.success('保存成功');
    queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
  } catch (error) {
    Toast.error('保存失败');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    class="ds-sticky ds-top-0 ds-z-10 ds-flex ds-h-12 ds-items-center ds-justify-between ds-border-b ds-bg-white ds-px-4"
  >
    <h2 class="ds-font-semibold">{{ data?.metadata?.name }}</h2>
    <VSpace>
      <VButton size="sm" @click="emit('close')">返回</VButton>
      <VButton size="sm" type="secondary" :loading="isSubmitting" @click="handleSave">
        保存
      </VButton>
    </VSpace>
  </div>
  <div class="ds-p-4">
    <DataEditor ref="dataEditorRef" :scheme="scheme" :data="data" />
  </div>
</template>
