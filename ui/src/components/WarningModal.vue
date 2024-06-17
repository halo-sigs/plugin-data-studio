<script lang="ts" setup>
import { VButton, VModal, VSpace } from '@halo-dev/components';
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
    <div>
      <span class="ds-text-sm ds-font-semibold">
        此功能拥有极高的数据操作灵活度，在进行操作之前请务必熟悉 Halo
        的运行机制，避免造成数据异常或者不完整。在进行某些数据修改前也请尽可能提前备份数据。
      </span>

      <br />
      <br />

      <span class="ds-text-sm ds-font-semibold">相关资料：</span>

      <br />

      <ul class="mt-1 ds-space-y-1 ds-text-sm">
        <li>
          1.
          <a
            class="ds-text-indigo-600"
            href="https://github.com/halo-dev/rfcs/tree/main/extension"
            target="_blank"
            >自定义模型设计</a
          >
        </li>
        <li>
          2.
          <a
            class="ds-text-indigo-600"
            href="https://docs.halo.run/developer-guide/plugin/basics/framework"
            target="_blank"
            >Halo 架构概览
          </a>
        </li>
      </ul>
    </div>
    <template #footer>
      <div class="ds-flex ds-justify-between">
        <VSpace>
          <VButton type="danger" @click="modal?.close()">我已确认</VButton>
          <VButton @click="$router.back()">关闭</VButton>
          <VButton @click="handleSkip">不再提醒</VButton>
        </VSpace>
        <VButton @click="$router.push({ name: 'Backup' })" type="secondary">去备份</VButton>
      </div>
    </template>
  </VModal>
</template>
