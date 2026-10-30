<script setup lang="ts">
import type { Scheme, Unstructured } from '@/types';
import { isJsonEqual, isJsonObject } from '@/utils/json';
import { createResourceTemplate } from '@/utils/resource';
import { VButton } from '@halo-dev/components';
import { computed, resolveComponent, shallowRef, watch } from 'vue';
import TablerBraces from '~icons/tabler/braces';
import TablerCheck from '~icons/tabler/check';
import TreeEditor from './TreeEditor.vue';

const props = defineProps<{ data?: Unstructured; scheme: Scheme }>();
const CodeEditor = resolveComponent('VCodemirror');
const schemaEditor = shallowRef<InstanceType<typeof TreeEditor>>();
const mode = shallowRef<'visual' | 'json'>('json');
const ready = shallowRef(false);
const schemaError = shallowRef('');
const notice = shallowRef('');
const errors = shallowRef<string[]>([]);
const initialValue = computed(() => props.data ?? createResourceTemplate(props.scheme));
const text = shallowRef(JSON.stringify(initialValue.value, null, 2));
const baseline = shallowRef(initialValue.value);
const parsed = computed(() => {
  try {
    const value: unknown = JSON.parse(text.value);
    if (!isJsonObject(value)) return { error: '资源必须是 JSON 对象。' };
    return { value, error: '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'JSON 语法错误' };
  }
});
const dirty = computed(
  () => !!parsed.value.error || !isJsonEqual(parsed.value.value, baseline.value)
);
const statusLabel = computed(() => {
  if (!props.data) return '尚未创建';
  return dirty.value ? '尚未保存' : '无未保存更改';
});

watch(
  () => props.data,
  () => {
    baseline.value = initialValue.value;
    text.value = JSON.stringify(initialValue.value, null, 2);
    errors.value = [];
    notice.value = '';
    if (mode.value === 'visual') {
      try {
        if (!schemaEditor.value?.prepare(initialValue.value)) mode.value = 'json';
      } catch {
        mode.value = 'json';
      }
    }
  }
);
watch(text, () => {
  errors.value = [];
});

function flush() {
  if (mode.value === 'visual' && ready.value)
    text.value = JSON.stringify(schemaEditor.value?.getValue(), null, 2);
}

function switchMode(next: 'visual' | 'json') {
  if (next === mode.value) return;
  notice.value = '';
  if (next === 'visual') {
    if (parsed.value.error) {
      notice.value = '请先修复 JSON 语法错误，再切换到可视化。当前内容已保留。';
      return;
    }
    try {
      if (!schemaEditor.value?.prepare(parsed.value.value)) {
        notice.value = '可视化编辑器尚未就绪，请继续使用 JSON 编辑。';
        return;
      }
    } catch {
      notice.value = '此数据暂时无法用可视化编辑器打开，请继续使用 JSON 编辑。';
      return;
    }
  }
  flush();
  mode.value = next;
}

function getData(): Unstructured | undefined {
  flush();
  if (!ready.value || schemaError.value) {
    errors.value = [schemaError.value || '正在加载模型定义，请稍后再保存。'];
    return;
  }
  if (parsed.value.error || !parsed.value.value) {
    errors.value = [parsed.value.error];
    return;
  }
  const value = parsed.value.value;
  if (
    props.data &&
    (value.kind !== props.data.kind ||
      value.apiVersion !== props.data.apiVersion ||
      !isJsonObject(value.metadata) ||
      value.metadata.name !== props.data.metadata.name)
  ) {
    errors.value = ['编辑已有记录时不能更改 apiVersion、kind 或 metadata.name。'];
    return;
  }
  errors.value = (schemaEditor.value?.validate(value) ?? []).map(
    (error) => `${error.path.join('.') || 'root'}: ${error.message}`
  );
  if (errors.value.length) return;
  return value as unknown as Unstructured;
}

defineExpose({ getData, dirty, flush });
</script>

<template>
  <div class="studio-editor">
    <div class="studio-editor-toolbar">
      <div class="studio-editor-modes" role="tablist" aria-label="编辑模式">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'visual'"
          :disabled="!ready || !!schemaError"
          :class="{ active: mode === 'visual' }"
          @click="switchMode('visual')"
        >
          可视化
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'json'"
          :class="{ active: mode === 'json' }"
          @click="switchMode('json')"
        >
          JSON
        </button>
      </div>
      <VButton
        v-if="mode === 'json'"
        size="sm"
        :disabled="!!parsed.error"
        @click="text = JSON.stringify(parsed.value, null, 2)"
      >
        <template #icon><TablerBraces /></template>格式化
      </VButton>
    </div>
    <div v-if="notice || schemaError" class="studio-editor-message" role="status">
      {{ schemaError || notice }}
    </div>
    <div v-if="errors.length" class="studio-editor-errors" role="alert">
      <p class=":uno: font-medium">无法保存，请检查以下内容：</p>
      <ul>
        <li v-for="error in errors" :key="error">{{ error }}</li>
      </ul>
    </div>
    <div v-show="mode === 'json'" class="studio-editor-code" aria-label="JSON 编辑器">
      <component :is="CodeEditor" v-model="text" language="json" height="100%" />
    </div>
    <div v-show="mode === 'visual'" class="studio-editor-form">
      <TreeEditor
        ref="schemaEditor"
        :scheme="scheme"
        :initial-value="initialValue"
        :active="mode === 'visual'"
        @ready="ready = true"
        @error="schemaError = $event"
        @change="text = JSON.stringify($event, null, 2)"
      />
    </div>
    <div class="studio-editor-status" :class="{ invalid: !!parsed.error }" role="status">
      <span class=":uno: min-w-0 flex items-center gap-2">
        <TablerCheck v-if="!parsed.error" class=":uno: shrink-0 text-green-600" />
        {{ parsed.error || (mode === 'json' ? 'JSON 语法有效' : '可视化编辑') }}
      </span>
      <span class=":uno: shrink-0">{{ statusLabel }}</span>
    </div>
  </div>
</template>
