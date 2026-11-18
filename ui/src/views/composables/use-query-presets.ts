import type { ListResponse, QueryPreset, Scheme } from '@/types';
import { QUERY_PRESET_API, schemeApiVersion } from '@/utils/api';
import { axiosInstance } from '@halo-dev/api-client';
import { useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export const QUERY_PRESETS_KEY = ['plugin-data-studio:query-presets'];

/**
 * Loads saved presets once and exposes the ones that belong to the given model.
 */
export function useQueryPresets(scheme: MaybeRefOrGetter<Scheme>) {
  const query = useQuery({
    queryKey: QUERY_PRESETS_KEY,
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
  const presets = computed(() => {
    const target = toValue(scheme);
    return (query.data.value || [])
      .filter(
        (preset) =>
          !preset.metadata.deletionTimestamp &&
          preset.spec.apiVersion === schemeApiVersion(target) &&
          preset.spec.kind === target.groupVersionKind.kind
      )
      .sort((left, right) => left.spec.displayName.localeCompare(right.spec.displayName));
  });
  return { ...query, presets };
}
