<script setup lang="ts">
import type { Scheme } from '@/types';
import { isJsonObject } from '@/utils/json';
import { Toast } from '@halo-dev/components';
import {
  createAjvValidator,
  createJSONEditor,
  isJSONContent,
  Mode,
  renderJSONSchemaEnum,
  renderValue,
  type Content,
  type ContextMenuItem,
  type JSONSchema,
  type MenuItem,
  type RenderValueProps,
  type Validator,
} from 'vanilla-jsoneditor';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';

const props = defineProps<{ scheme: Scheme; active: boolean; initialValue: unknown }>();
const emit = defineEmits<{ change: [value: unknown]; ready: []; error: [message: string] }>();
const container = shallowRef<HTMLElement>();
let editor: ReturnType<typeof createJSONEditor> | undefined;
let validate: Validator | undefined;
const schema = props.scheme.openApiSchema as JSONSchema;
const menuLabels: Record<string, string> = {
  'jse-expand-all': '展开全部',
  'jse-collapse-all': '折叠全部',
  'jse-search': '查找字段或值',
  'jse-contextmenu': '添加、删除或修改类型',
  'jse-undo': '撤销',
  'jse-redo': '重做',
};
const actionLabels: Record<string, string> = {
  'Edit key': '修改字段名',
  'Edit value': '修改值',
  'Enforce string': '保持字符串类型',
  'Convert to:': '转换类型：',
  Cut: '剪切',
  'Cut formatted': '剪切（格式化）',
  'Cut compacted': '剪切（紧凑）',
  Copy: '复制',
  'Copy formatted': '复制（格式化）',
  'Copy compacted': '复制（紧凑）',
  Paste: '粘贴',
  Duplicate: '创建副本',
  Extract: '提取',
  Sort: '排序',
  Transform: '转换',
  Remove: '删除',
  Structure: '结构',
  Object: '对象',
  Array: '数组',
  Value: '值',
  String: '字符串',
  Number: '数字',
  Boolean: '布尔值',
  Null: '空值',
  'Insert before': '在前面插入',
  'Insert after': '在后面插入',
  'Insert:': '插入：',
  Insert: '插入',
  Append: '追加',
};
function translateAction<T>(item: T): T {
  if (!isJsonObject(item)) return item;
  return {
    ...item,
    ...(typeof item.text === 'string' ? { text: actionLabels[item.text] || item.text } : {}),
    ...(Array.isArray(item.items) ? { items: item.items.map(translateAction) } : {}),
    ...('main' in item ? { main: translateAction(item.main) } : {}),
  };
}
function renderMenu(items: MenuItem[]) {
  return items
    .filter((item) => item.type !== 'button' || !!menuLabels[item.className || ''])
    .map((item) =>
      item.type === 'button' ? { ...item, title: menuLabels[item.className || ''] } : item
    );
}
onMounted(() => {
  if (!container.value) return;
  try {
    validate = createAjvValidator({
      schema,
      ajvOptions: {
        strict: false,
        validateFormats: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
      },
    });
    editor = createJSONEditor({
      target: container.value,
      props: {
        content: { json: JSON.parse(JSON.stringify(props.initialValue)) },
        mode: Mode.tree,
        ariaLabel: '可视化 JSON 编辑器',
        navigationBar: false,
        statusBar: false,
        validator: validate,
        onRenderMenu: renderMenu,
        onRenderContextMenu: (items: ContextMenuItem[]) => items.map(translateAction),
        onRenderValue: (value: RenderValueProps) =>
          renderJSONSchemaEnum(value, schema) || renderValue(value),
        onChange: (content: Content) => {
          if (props.active && isJSONContent(content)) emit('change', content.json);
        },
        onError: () => Toast.error('此操作未完成，当前内容已保留。'),
      },
    });
    // Open the resource and spec, while keeping system metadata out of the way.
    editor.expand([], (path) => path.length < 2 && path[0] !== 'metadata');
    if (
      isJsonObject(props.initialValue) &&
      isJsonObject(props.initialValue.metadata) &&
      props.initialValue.metadata.name
    ) {
      editor.collapse(['metadata']);
    }
    emit('ready');
  } catch {
    emit('error', '模型 Schema 无法加载，请检查模型定义后重试。');
  }
});
function getValue() {
  // Commit an active inline edit before a shortcut, mode switch or navigation.
  const active = document.activeElement;
  if (active instanceof HTMLElement && container.value?.contains(active)) active.blur();
  editor?.updateProps({});
  const content = editor?.get();
  return content && isJSONContent(content) ? content.json : undefined;
}
onBeforeUnmount(() => {
  void editor?.destroy();
});
defineExpose({
  getValue,
  prepare: (value: unknown) => {
    if (!editor) return false;
    editor.update({ json: JSON.parse(JSON.stringify(value)) });
    return true;
  },
  validate: (value: unknown) => validate?.(value) ?? [],
});
</script>

<template>
  <div class="studio-tree">
    <p class="studio-tree-help">双击字段或值进行编辑 · 右键添加、删除或修改类型</p>
    <div ref="container" class="studio-tree-content"></div>
  </div>
</template>
