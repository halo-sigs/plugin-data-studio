<script lang="ts" setup>
import type { Scheme, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { Toast, VButton, VLoading, VSpace } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { defineAsyncComponent, ref } from 'vue';

const DataEditor = defineAsyncComponent({
  loader: () => import('@/components/DataEditor.vue'),
  loadingComponent: VLoading,
});

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

    // metadata.name may appear in a form similar to `posts.content.halo.run/5152aea5-c2e8-4717-8bba-2263d46e19d5`
    // so we need to use encodeURIComponent
    const name = encodeURIComponent(props.data?.metadata?.name);

    await axiosInstance.put(
      `${buildBaseApiUrl(props.scheme)}/${name}`,
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
  <div class=":uno: sticky top-0 z-10 h-12 flex items-center justify-between border-b bg-white px-4">
    <h2 class=":uno: font-semibold">{{ data?.metadata?.name }}</h2>
    <VSpace>
      <VButton size="sm" @click="emit('close')">返回</VButton>
      <VButton size="sm" type="secondary" :loading="isSubmitting" @click="handleSave">
        保存
      </VButton>
    </VSpace>
  </div>
  <div class=":uno: p-4">
    <DataEditor ref="dataEditorRef" :scheme="scheme" :data="data" />
  </div>
</template>
