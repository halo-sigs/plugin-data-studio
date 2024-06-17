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
    @apply ds-py-1.5;
  }
  .je-object__controls {
    @apply ds-space-x-1.5;
  }

  .je-form-input-label {
    @apply ds-text-sm;
  }

  .je-modal {
    button {
      @apply ds-m-1;
    }

    .je-edit-json--textarea {
      @apply ds-w-96 ds-border-b ds-border-solid ds-border-gray-100;
    }
  }

  .form-control {
    @apply ds-space-y-1.5 ds-py-1.5;

    input,
    select {
      @apply ds-h-9 ds-w-1/2 ds-rounded-md ds-border ds-border-solid ds-border-gray-200 ds-text-sm ds-text-gray-800 focus:ds-ring-1 #{!important};
    }
  }

  .je-indented-panel {
    @apply ds-m-0 ds-mb-2 ds-mt-3 ds-rounded-md ds-p-3 #{!important};
  }

  .je-header {
    span {
      @apply ds-text-sm ds-font-bold;
    }

    button {
      span {
        @apply ds-text-xs ds-font-normal;
      }
    }
  }

  p {
    @apply ds-py-1 ds-text-xs ds-font-normal ds-text-gray-600 #{!important};
  }

  button {
    @apply ds-h-6 ds-rounded-md ds-border ds-border-solid ds-border-gray-200 ds-px-1 ds-text-xs ds-font-normal ds-text-gray-800 hover:ds-bg-gray-100 #{!important};
  }
}
</style>
