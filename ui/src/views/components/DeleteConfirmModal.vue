<script lang="ts" setup>
import { VModal, VSpace, VButton } from '@halo-dev/components';
import { ref } from 'vue';

const props = defineProps<{
  title?: string;
  description?: string;
  visible: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'confirm'): void;
}>();

const modal = ref<InstanceType<typeof VModal> | null>(null);
</script>

<template>
  <VModal
    ref="modal"
    :title="title || '确认删除'"
    :visible="visible"
    @close="emit('close')"
  >
    <div class="p-4">
      <p class="text-sm text-gray-600">
        {{ description || '确定要删除选中的数据吗？此操作不可恢复。' }}
      </p>
    </div>
    <template #footer>
      <VSpace>
        <VButton
          type="danger"
          :loading="loading"
          @click="emit('confirm')"
        >
          确认删除
        </VButton>
        <VButton
          @click="emit('close')"
        >
          取消
        </VButton>
      </VSpace>
    </template>
  </VModal>
</template> 