import type { Scheme } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { Dialog, Toast } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { useFileDialog } from '@vueuse/core';
import axios from 'axios';
import { watch, type Ref } from 'vue';

export function useDataImport(scheme: Ref<Scheme>) {
  const queryClient = useQueryClient();

  const { files, open, reset } = useFileDialog({
    multiple: false,
  });

  watch(
    () => files.value,
    () => {
      const file = files.value?.item(0);
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target?.result;

          if (!content?.toString()) {
            Toast.warning('文件内容为空');
            return;
          }

          const data = JSON.parse(content?.toString() || '');

          const { group, version, kind } = scheme.value.groupVersionKind;

          if (
            kind !== data.kind ||
            [group, version].filter(Boolean).join('/') !== data.apiVersion
          ) {
            Toast.warning('导入的数据与当前模型不匹配');
            return;
          }

          let originData = undefined;

          try {
            originData = (await axios.get(`${buildBaseApiUrl(scheme.value)}/${data.metadata.name}`))
              .data;
          } catch (error) {}

          if (originData) {
            Dialog.warning({
              title: '数据已存在',
              description: '当前导入的数据已存在，是否更新？',
              onConfirm: async () => {
                try {
                  await axios.put(`${buildBaseApiUrl(scheme.value)}/${data.metadata.name}`, data);
                  Toast.success('更新成功');
                } catch (error) {
                  Toast.error('更新失败');
                }
              },
            });
          } else {
            await axios.post(buildBaseApiUrl(scheme.value), data);
            Toast.success('导入成功');
          }

          queryClient.invalidateQueries({ queryKey: ['plugin-data-studio:data'] });
        };
        reader.onloadend = () => {
          reset();
        };
        reader.readAsText(file);
      }
    }
  );

  return { open };
}
