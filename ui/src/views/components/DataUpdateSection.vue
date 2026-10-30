<script setup lang="ts">
import type { Scheme, Unstructured } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { Toast, VButton, VLoading, VModal, VSpace } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { isAxiosError } from 'axios';
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

const DataEditor = defineAsyncComponent({
  loader: () => import('@/components/DataEditor.vue'),
  loadingComponent: VLoading,
});
const props = defineProps<{ data?: Unstructured; scheme: Scheme }>();
const emit = defineEmits<{ close: []; saved: [data: Unstructured] }>();
const queryClient = useQueryClient();
const source = shallowRef(props.data);
watch(
  () => props.data,
  (value) => {
    source.value = value;
  }
);
const dataEditor = shallowRef<InstanceType<typeof DataEditor>>();
const isSubmitting = shallowRef(false);
const saveError = shallowRef('');
const dirty = computed(() => dataEditor.value?.dirty ?? false);
const leaveDialogVisible = shallowRef(false);
let resolveLeave: ((leave: boolean) => void) | undefined;

async function save(): Promise<boolean> {
  if (isSubmitting.value || (source.value && !dirty.value)) return false;
  const value = dataEditor.value?.getData?.();
  if (!value) return false;
  try {
    isSubmitting.value = true;
    saveError.value = '';
    const response = source.value
      ? await axiosInstance.put<Unstructured>(
          `${buildBaseApiUrl(props.scheme)}/${encodeURIComponent(source.value.metadata.name)}`,
          value
        )
      : await axiosInstance.post<Unstructured>(buildBaseApiUrl(props.scheme), value);
    source.value = response.data;
    emit('saved', response.data);
    Toast.success('保存成功');
    void queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
    return true;
  } catch (error) {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    saveError.value =
      status === 409
        ? '数据已被其他操作更新。当前草稿已保留，请确认最新数据后再保存。'
        : status === 404
          ? '此记录已不存在。当前草稿已保留，可复制 JSON 后重新创建。'
          : status === 403
            ? '没有保存此模型的权限。当前草稿已保留。'
            : '保存失败，当前草稿已保留。请检查网络或数据后重试。';
    return false;
  } finally {
    isSubmitting.value = false;
  }
}

function resolveNavigation(leave: boolean) {
  leaveDialogVisible.value = false;
  resolveLeave?.(leave);
  resolveLeave = undefined;
}
function confirmLeave(): Promise<boolean> {
  dataEditor.value?.flush?.();
  if (isSubmitting.value || resolveLeave) return Promise.resolve(false);
  if (!dirty.value) return Promise.resolve(true);
  leaveDialogVisible.value = true;
  return new Promise((resolve) => {
    resolveLeave = resolve;
  });
}
async function saveAndLeave() {
  if (await save()) resolveNavigation(true);
  else resolveNavigation(false);
}
async function close() {
  if (await confirmLeave()) emit('close');
}
function beforeUnload(event: BeforeUnloadEvent) {
  dataEditor.value?.flush?.();
  if (!dirty.value && !isSubmitting.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(() => confirmLeave());
onBeforeRouteUpdate((to, from) => (to.query.scheme === from.query.scheme ? true : confirmLeave()));
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  resolveLeave?.(false);
});
defineExpose({ confirmLeave });
</script>

<template>
  <section
    class="studio-detail"
    aria-label="编辑记录"
    @keydown.ctrl.s.capture.prevent="save"
    @keydown.meta.s.capture.prevent="save"
  >
    <div class="studio-detail-header">
      <div class=":uno: min-w-0 flex items-center gap-3">
        <h2 class=":uno: min-w-0 break-words text-base text-gray-900 font-semibold">
          {{ source?.metadata.name || '新增数据' }}
        </h2>
        <span
          v-if="dirty"
          class=":uno: shrink-0 rounded bg-gray-100 px-2 py-1 text-xs text-gray-500"
          >未保存</span
        >
      </div>
      <VSpace class=":uno: shrink-0">
        <VButton size="sm" :disabled="isSubmitting" @click="close">返回列表</VButton>
        <VButton
          size="sm"
          type="secondary"
          :loading="isSubmitting"
          :disabled="isSubmitting || (!!source && !dirty)"
          @click="save"
          >保存</VButton
        >
      </VSpace>
    </div>
    <div v-if="saveError" class="studio-editor-errors" role="alert">{{ saveError }}</div>
    <DataEditor ref="dataEditor" :inert="isSubmitting" :scheme="scheme" :data="source" />
  </section>
  <VModal
    v-if="leaveDialogVisible"
    title="有尚未保存的更改"
    :width="480"
    :layer-closable="false"
    @close="resolveNavigation(false)"
  >
    <p class=":uno: text-sm text-gray-600">离开当前记录前，是否保存更改？</p>
    <template #footer>
      <div class=":uno: flex flex-wrap justify-end gap-2">
        <VButton :disabled="isSubmitting" @click="resolveNavigation(false)">继续编辑</VButton>
        <VButton :disabled="isSubmitting" type="danger" @click="resolveNavigation(true)"
          >放弃修改</VButton
        >
        <VButton type="secondary" :loading="isSubmitting" @click="saveAndLeave">保存并离开</VButton>
      </div>
    </template>
  </VModal>
</template>
