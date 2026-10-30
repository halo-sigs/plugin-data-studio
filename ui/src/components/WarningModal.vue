<script lang="ts" setup>
import { VButton, VModal } from '@halo-dev/components';
import { useLocalStorage } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const modal = ref<InstanceType<typeof VModal> | null>(null);
const skipWarning = useLocalStorage('plugin-data-studio:skip-warning', false);

const warningModalVisible = ref();

onMounted(() => {
  setTimeout(() => {
    if (!skipWarning.value) {
      warningModalVisible.value = true;
    }
  }, 300);
});

const handleSkip = () => {
  skipWarning.value = true;
  modal.value?.close();
};
</script>

<template>
  <VModal v-if="warningModalVisible" ref="modal" title="警告" :width="520" @close="emit('close')">
    <p class=":uno: text-sm text-gray-600 leading-6">
      此功能拥有极高的数据操作灵活度，在进行操作之前请务必熟悉 Halo
      的运行机制，避免造成数据异常或者不完整。在进行某些数据修改前也请尽可能提前备份数据。
    </p>

    <h3 class=":uno: mt-5 text-sm text-gray-900 font-medium">相关资料：</h3>
    <ol class=":uno: mt-2 list-decimal list-inside text-sm space-y-1">
      <li>
        <a
          class=":uno: text-indigo-600"
          href="https://github.com/halo-dev/rfcs/tree/main/extension"
          target="_blank"
          >自定义模型设计</a
        >
      </li>
      <li>
        <a
          class=":uno: text-indigo-600"
          href="https://docs.halo.run/developer-guide/core/framework"
          target="_blank"
          >Halo 架构概览</a
        >
      </li>
    </ol>
    <template #footer>
      <div class=":uno: flex flex-wrap justify-end gap-2">
        <VButton @click="$router.back()">返回</VButton>
        <VButton @click="handleSkip">不再提醒</VButton>
        <VButton @click="$router.push({ name: 'Backup' })">去备份</VButton>
        <VButton type="secondary" @click="modal?.close()">我已确认</VButton>
      </div>
    </template>
  </VModal>
</template>
