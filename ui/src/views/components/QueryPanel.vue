<script setup lang="ts">
import type { DataQuery } from '@/types';
import { VButton } from '@halo-dev/components';
import { computed, shallowRef, watch } from 'vue';

const props = defineProps<{ query: DataQuery }>();
const emit = defineEmits<{ apply: [query: DataQuery]; close: [] }>();

function lines(value: string): string[] {
  return [
    ...new Set(
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ];
}

const fieldText = shallowRef('');
const labelText = shallowRef('');
const sortText = shallowRef('');
// Route updates can recreate equal arrays; only a real change may replace the draft.
watch(
  () => JSON.stringify(props.query),
  () => {
    const { query } = props;
    fieldText.value = query.fieldSelectors.join('\n');
    labelText.value = query.labelSelectors.join('\n');
    sortText.value = query.sorts.join('\n');
  },
  { immediate: true }
);
const draft = computed<DataQuery>(() => ({
  fieldSelectors: lines(fieldText.value),
  labelSelectors: lines(labelText.value),
  sorts: lines(sortText.value),
}));
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.query));

function apply() {
  if (dirty.value) emit('apply', draft.value);
}
</script>

<template>
  <form
    class="studio-query-panel"
    @submit.prevent="apply"
    @keydown.enter.meta.prevent="apply"
    @keydown.enter.ctrl.prevent="apply"
    @keydown.esc.stop="emit('close')"
  >
    <label>
      <span>字段</span>
      <textarea
        v-model="fieldText"
        rows="2"
        spellcheck="false"
        placeholder="spec.slug=hello&#10;metadata.name=post-1"
      ></textarea>
    </label>
    <label>
      <span>标签</span>
      <textarea
        v-model="labelText"
        rows="2"
        spellcheck="false"
        placeholder="app=halo&#10;env!=test"
      ></textarea>
    </label>
    <label>
      <span>排序</span>
      <textarea
        v-model="sortText"
        rows="2"
        spellcheck="false"
        placeholder="metadata.creationTimestamp,desc&#10;metadata.name"
      ></textarea>
    </label>
    <div class="studio-query-panel-actions">
      <VButton size="sm" @click="emit('close')">收起</VButton>
      <VButton size="sm" type="secondary" :disabled="!dirty" title="Ctrl / ⌘ + Enter" @click="apply"
        >应用</VButton
      >
    </div>
  </form>
</template>
