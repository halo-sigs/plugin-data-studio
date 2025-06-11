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
  {
    data: undefined,
  }
);

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
