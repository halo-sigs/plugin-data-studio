<script lang="ts" setup>
import type { Scheme, Unstructured } from '@/types';
import { Toast } from '@halo-dev/components';
// @ts-ignore
import { JSONEditor } from '@json-editor/json-editor';
import { onMounted, shallowRef, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    data?: Unstructured;
    scheme: Scheme;
  }>(),
  {}
);

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const editor = shallowRef();

function createJSONEditor() {
  if (editor.value) {
    editor.value.destroy();
  }

  editor.value = new JSONEditor(document.getElementById('jsonEditorContainer'), {
    schema: props.scheme.openApiSchema,
    theme: 'html',
    show_errors: 'always',
    keep_oneof_values: false,
  });

  editor.value.on('ready', () => {
    if (props.data) {
      editor.value.setValue(props.data);
    }
  });
}

watch(
  () => props.data,
  () => {
    createJSONEditor();
  }
);

onMounted(() => {
  createJSONEditor();
});

defineExpose({
  getData: () => {
    if (!editor.value.validate()) {
      Toast.success('数据校验失败');
      return;
    }
    return editor.value.getValue();
  },
});
</script>

<template>
  <div id="jsonEditorContainer"></div>
</template>

<style lang="scss">
#jsonEditorContainer {
  .row {
    @apply py-1.5;
  }
  .je-object__controls {
    @apply space-x-1.5;
  }

  .je-form-input-label {
    @apply text-sm;
  }

  .je-modal {
    button {
      @apply m-1;
    }

    .je-edit-json--textarea {
      @apply w-96 border-b border-solid border-gray-100;
    }
  }

  .form-control {
    @apply space-y-1.5 py-1.5;

    input,
    select {
      @apply h-9 w-1/2 rounded-md border border-solid border-gray-200 text-sm text-gray-800 focus:ring-1 #{!important};
    }
  }

  .je-indented-panel {
    @apply m-0 mb-2 mt-3 rounded-md p-3 #{!important};
  }

  .je-header {
    span {
      @apply text-sm font-bold;
    }

    button {
      span {
        @apply text-xs font-normal;
      }
    }
  }

  p {
    @apply py-1 text-xs font-normal text-gray-600 #{!important};
  }

  button {
    @apply h-6 rounded-md border border-solid border-gray-200 px-1 text-xs font-normal text-gray-800 hover:bg-gray-100 #{!important};
  }
}
</style>
