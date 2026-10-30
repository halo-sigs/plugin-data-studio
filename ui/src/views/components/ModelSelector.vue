<script setup lang="ts">
import type { Scheme } from '@/types';
import { VDropdown, VLoading } from '@halo-dev/components';
import { computed, nextTick, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';
import TablerChevronDown from '~icons/tabler/chevron-down';
import TablerChevronRight from '~icons/tabler/chevron-right';
import TablerSearch from '~icons/tabler/search';

const props = defineProps<{ schemes: Scheme[]; selected?: Scheme; loading: boolean }>();
const emit = defineEmits<{ select: [scheme: Scheme] }>();
const visible = shallowRef(false);
const panelId = useId();
const trigger = useTemplateRef('trigger');
const search = useTemplateRef('search');
const keyword = shallowRef('');
const expanded = ref(new Set<string>());
watch(
  () => props.selected,
  (scheme) => {
    if (scheme) expanded.value.add(scheme.groupVersionKind.group || '');
  },
  { immediate: true }
);
const groups = computed(() => {
  const result = new Map<string, Scheme[]>();
  const terms = keyword.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const scheme of props.schemes) {
    const { group = '', kind, version } = scheme.groupVersionKind;
    const searchable =
      `${group} ${kind} ${version} ${group ? '' : '核心模型'}`.toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;
    const items = result.get(group) || [];
    items.push(scheme);
    result.set(group, items);
  }
  return [...result]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([group, items]) => ({
      group,
      items: items.sort(
        (left, right) =>
          left.groupVersionKind.kind.localeCompare(right.groupVersionKind.kind) ||
          left.groupVersionKind.version.localeCompare(right.groupVersionKind.version)
      ),
    }));
});
const count = computed(() => groups.value.reduce((total, group) => total + group.items.length, 0));
function toggle(group: string) {
  if (expanded.value.has(group)) expanded.value.delete(group);
  else expanded.value.add(group);
}
function select(scheme: Scheme) {
  close();
  emit('select', scheme);
}
function close() {
  visible.value = false;
  trigger.value?.focus({ preventScroll: true });
}
async function focusSearch() {
  await nextTick();
  if (visible.value) search.value?.focus({ preventScroll: true });
}
</script>

<template>
  <VDropdown
    v-model:shown="visible"
    placement="bottom-start"
    :distance="6"
    :overflow-padding="8"
    :delay="0"
    auto-boundary-max-size
    no-auto-focus
    popper-class="studio-model-dropdown"
    @apply-show="focusSearch"
  >
    <button
      ref="trigger"
      type="button"
      class="studio-model-trigger"
      aria-haspopup="dialog"
      :aria-expanded="visible"
      :aria-controls="panelId"
      @keydown.esc.stop.prevent="close"
    >
      <span class=":uno: min-w-0 text-left">
        <span class=":uno: block truncate text-sm text-gray-900 font-medium">{{
          selected?.groupVersionKind.kind || '选择模型'
        }}</span>
        <span class=":uno: block truncate text-xs text-gray-500">{{
          selected
            ? [
                selected.groupVersionKind.group || '核心模型',
                selected.groupVersionKind.version,
              ].join(' / ')
            : '按 group 分组查找'
        }}</span>
      </span>
      <TablerChevronDown class=":uno: shrink-0 text-gray-500" />
    </button>
    <template #popper>
      <div
        :id="panelId"
        class="studio-model-panel"
        role="dialog"
        aria-label="选择模型"
        @keydown.esc.stop.prevent="close"
      >
        <div class="studio-model-panel-header">
          <div class="studio-search">
            <TablerSearch aria-hidden="true" />
            <input
              v-model="keyword"
              ref="search"
              aria-label="搜索模型或 group"
              placeholder="搜索模型、group 或 version"
            />
          </div>
          <p class=":uno: mt-3 text-xs text-gray-500" role="status">
            {{
              keyword ? `找到 ${count} / ${schemes.length} 个模型` : `共 ${schemes.length} 个模型`
            }}
          </p>
        </div>
        <VLoading v-if="loading" />
        <div v-else class="studio-model-groups">
          <div v-for="group in groups" :key="group.group">
            <button
              type="button"
              class="studio-model-group"
              :aria-expanded="!!keyword || expanded.has(group.group)"
              @click="toggle(group.group)"
            >
              <component
                :is="keyword || expanded.has(group.group) ? TablerChevronDown : TablerChevronRight"
                class=":uno: shrink-0"
              />
              <span class=":uno: min-w-0 flex-1 break-words text-left">{{
                group.group || '核心模型'
              }}</span>
              <span class=":uno: text-xs text-gray-500 font-normal">{{ group.items.length }}</span>
            </button>
            <ul v-if="keyword || expanded.has(group.group)">
              <li v-for="scheme in group.items" :key="scheme.type">
                <button
                  type="button"
                  class="studio-model-option"
                  :class="{ selected: selected?.type === scheme.type }"
                  :aria-current="selected?.type === scheme.type ? 'true' : undefined"
                  @click="select(scheme)"
                >
                  <span class=":uno: min-w-0 break-words">{{ scheme.groupVersionKind.kind }}</span>
                  <span class=":uno: shrink-0 text-xs text-gray-500">{{
                    scheme.groupVersionKind.version
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
          <p v-if="!groups.length" class=":uno: py-10 text-center text-sm text-gray-500">
            {{ keyword ? '没有匹配的模型，请尝试其他关键词。' : '当前没有可用模型。' }}
          </p>
        </div>
      </div>
    </template>
  </VDropdown>
</template>
