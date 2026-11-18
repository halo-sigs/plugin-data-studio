<script setup lang="ts">
import type { DataQuery, ListResponse, QueryPreset, Scheme } from '@/types';
import {
  apiErrorMessage,
  createQueryPresetName,
  QUERY_PRESET_API,
  schemeApiVersion,
} from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import {
  Dialog,
  Toast,
  VButton,
  VDropdown,
  VDropdownDivider,
  VDropdownItem,
  VModal,
  VSpace,
} from '@halo-dev/components';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, shallowRef } from 'vue';
import TablerBookmark from '~icons/tabler/bookmark';
import TablerChevronDown from '~icons/tabler/chevron-down';

const props = defineProps<{ scheme: Scheme; query: DataQuery; active?: string }>();
const emit = defineEmits<{ select: [preset: QueryPreset]; remove: [preset: QueryPreset] }>();

const queryClient = useQueryClient();
const PRESETS_KEY = ['plugin-data-studio:query-presets'];
const {
  data: allPresets,
  isError,
  refetch,
} = useQuery({
  queryKey: PRESETS_KEY,
  queryFn: async () => {
    const items: QueryPreset[] = [];
    for (let page = 1; ; page++) {
      const { data } = await axiosInstance.get<ListResponse<QueryPreset>>(QUERY_PRESET_API, {
        params: { page, size: 1000 },
      });
      items.push(...data.items);
      if (!data.hasNext) return items;
    }
  },
});
const presets = computed(() =>
  (allPresets.value || [])
    .filter(
      (preset) =>
        !preset.metadata.deletionTimestamp &&
        preset.spec.apiVersion === schemeApiVersion(props.scheme) &&
        preset.spec.kind === props.scheme.groupVersionKind.kind
    )
    .sort((left, right) => left.spec.displayName.localeCompare(right.spec.displayName))
);
const activePreset = computed(() =>
  presets.value.find((preset) => preset.metadata.name === props.active)
);

function presetQuery(preset: QueryPreset): DataQuery {
  return {
    fieldSelectors: preset.spec.fieldSelectors || [],
    labelSelectors: preset.spec.labelSelectors || [],
    sorts: preset.spec.sorts || [],
  };
}
const hasConditions = computed(() =>
  Object.values(props.query).some((terms: string[]) => terms.length)
);
const modified = computed(
  () =>
    !!activePreset.value &&
    JSON.stringify(presetQuery(activePreset.value)) !== JSON.stringify(props.query)
);

const saveModalVisible = shallowRef(false);
const saving = shallowRef(false);
async function create({ displayName }: { displayName: string }) {
  const name = displayName?.trim();
  if (!name) {
    Toast.error('请输入方案名称');
    return;
  }
  if (saving.value) return;
  saving.value = true;
  try {
    const { data } = await axiosInstance.post<QueryPreset>(QUERY_PRESET_API, {
      apiVersion: 'datastudio.halo.run/v1alpha1',
      kind: 'QueryPreset',
      metadata: { name: createQueryPresetName() },
      spec: {
        displayName: name,
        apiVersion: schemeApiVersion(props.scheme),
        kind: props.scheme.groupVersionKind.kind,
        ...props.query,
      },
    });
    saveModalVisible.value = false;
    await queryClient.invalidateQueries({ queryKey: PRESETS_KEY });
    emit('select', data);
    Toast.success('已保存');
  } catch (error) {
    Toast.error(apiErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}
async function update(preset: QueryPreset) {
  try {
    const { data } = await axiosInstance.put<QueryPreset>(
      `${QUERY_PRESET_API}/${encodeURIComponent(preset.metadata.name)}`,
      { ...preset, spec: { ...preset.spec, ...props.query } }
    );
    await queryClient.invalidateQueries({ queryKey: PRESETS_KEY });
    emit('select', data);
    Toast.success('已更新');
  } catch (error) {
    Toast.error(apiErrorMessage(error, '更新失败'));
  }
}
function remove(preset: QueryPreset) {
  Dialog.warning({
    title: '删除查询方案',
    description: `确定删除「${preset.spec.displayName}」吗？`,
    confirmType: 'danger',
    async onConfirm() {
      try {
        await axiosInstance.delete(
          `${QUERY_PRESET_API}/${encodeURIComponent(preset.metadata.name)}`
        );
        // Deletion is finalized asynchronously, so a refetch may still return it.
        queryClient.setQueryData<QueryPreset[]>(PRESETS_KEY, (items) =>
          items?.filter((item) => item.metadata.name !== preset.metadata.name)
        );
        emit('remove', preset);
        Toast.success('已删除');
      } catch (error) {
        Toast.error(apiErrorMessage(error, '删除失败'));
      }
    },
  });
}
</script>

<template>
  <VDropdown>
    <VButton class="studio-preset-trigger" :class="{ active: !!activePreset }">
      <TablerBookmark aria-hidden="true" />
      <span class="studio-preset-trigger-name">{{ activePreset?.spec.displayName || '方案' }}</span>
      <span v-if="modified" class="studio-preset-modified" title="条件已修改">*</span>
      <TablerChevronDown aria-hidden="true" />
    </VButton>
    <template #popper>
      <div class="studio-preset-menu">
        <VDropdownItem v-if="isError" @click="refetch()">方案加载失败，点击重试</VDropdownItem>
        <VDropdownItem
          v-for="preset in presets"
          :key="preset.metadata.name"
          v-close-popper
          :selected="preset.metadata.name === activePreset?.metadata.name"
          @click="emit('select', preset)"
        >
          {{ preset.spec.displayName }}
        </VDropdownItem>
        <VDropdownDivider v-if="presets.length || isError" />
        <VDropdownItem v-close-popper :disabled="!hasConditions" @click="saveModalVisible = true"
          >保存为新方案…</VDropdownItem
        >
        <p v-if="!hasConditions" class="studio-preset-hint">先设置条件再保存</p>
        <template v-if="activePreset">
          <VDropdownItem v-if="modified" v-close-popper @click="update(activePreset)"
            >更新「{{ activePreset.spec.displayName }}」</VDropdownItem
          >
          <VDropdownItem v-close-popper type="danger" @click="remove(activePreset)"
            >删除「{{ activePreset.spec.displayName }}」</VDropdownItem
          >
        </template>
      </div>
    </template>
  </VDropdown>

  <VModal
    v-if="saveModalVisible"
    title="保存为新方案"
    :width="400"
    @close="saveModalVisible = false"
  >
    <FormKit
      id="studio-preset-form"
      type="form"
      :actions="false"
      :config="{ validationVisibility: 'submit' }"
      @submit="create"
    >
      <FormKit
        type="text"
        name="displayName"
        label="名称"
        placeholder="例如：已发布文章"
        validation="required|length:0,50"
        :validation-messages="{ required: '请输入方案名称' }"
      />
    </FormKit>
    <template #footer>
      <VSpace>
        <!-- @vue-ignore -->
        <VButton type="secondary" :loading="saving" @click="$formkit.submit('studio-preset-form')"
          >保存</VButton
        >
        <VButton @click="saveModalVisible = false">取消</VButton>
      </VSpace>
    </template>
  </VModal>
</template>
