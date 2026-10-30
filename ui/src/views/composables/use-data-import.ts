import type { Scheme } from '@/types';
import { buildBaseApiUrl } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { Dialog, Toast } from '@halo-dev/components';
import { useQueryClient } from '@tanstack/vue-query';
import { useFileDialog } from '@vueuse/core';
import { watch, type Ref } from 'vue';

export function useDataImport(scheme: Ref<Scheme | undefined>) {
  const queryClient = useQueryClient();

  const { files, open, reset } = useFileDialog({
    multiple: false,
  });

  watch(
    () => files.value,
    () => {
      const file = files.value?.item(0);
      const selectedScheme = scheme.value;
      if (file && selectedScheme) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target?.result;

          if (!content?.toString()) {
            Toast.warning('文件内容为空');
            return;
          }

          const data = JSON.parse(content?.toString() || '');

          const { group, version, kind } = selectedScheme.groupVersionKind;

          if (
            kind !== data.kind ||
            [group, version].filter(Boolean).join('/') !== data.apiVersion
          ) {
            Toast.warning('导入的数据与当前模型不匹配');
            return;
          }

          let originData = undefined;

          try {
            originData = (
              await axiosInstance.get(`${buildBaseApiUrl(selectedScheme)}/${data.metadata.name}`)
            ).data;
          } catch (error) {}

          if (originData) {
            Dialog.warning({
              title: '数据已存在',
              description: '当前导入的数据已存在，是否更新？',
              onConfirm: async () => {
                try {
                  await axiosInstance.put(
                    `${buildBaseApiUrl(selectedScheme)}/${data.metadata.name}`,
                    data
                  );
                  Toast.success('更新成功');
                } catch (error) {
                  Toast.error('更新失败');
                }
              },
            });
          } else {
            await axiosInstance.post(buildBaseApiUrl(selectedScheme), data);
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
