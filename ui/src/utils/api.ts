import type { Scheme } from '@/types';
import { isAxiosError } from 'axios';
import { normalizePath } from './path';

export const QUERY_PRESET_API = '/apis/datastudio.halo.run/v1alpha1/querypresets';

export interface DataListParams {
  page?: number;
  size?: number;
  keyword?: string;
  fieldSelectors?: string[];
  labelSelectors?: string[];
  sorts?: string[];
}

export function buildBaseApiUrl(scheme: Scheme) {
  const { group, version } = scheme.groupVersionKind;

  const path = normalizePath(group ? '/apis/' : '/api/', group || '', version, scheme.plural);

  return path;
}

export interface ListParams {
  page?: number;
  size?: number;
  fieldSelector?: string[];
  labelSelector?: string[];
  sort?: string[];
}

export function buildListParams(query: DataListParams): ListParams {
  const params: ListParams = {};
  if (query.page != null) params.page = query.page;
  if (query.size != null) params.size = query.size;
  const fieldSelectors = [...(query.fieldSelectors || [])];
  if (query.keyword?.trim()) fieldSelectors.push(`metadata.name=${query.keyword.trim()}`);
  const allFieldSelectors = fieldSelectors.filter(Boolean);
  if (allFieldSelectors.length) params.fieldSelector = allFieldSelectors;
  const labelSelectors = (query.labelSelectors || []).filter(Boolean);
  if (labelSelectors.length) params.labelSelector = labelSelectors;
  const sorts = (query.sorts || []).filter(Boolean);
  if (sorts.length) params.sort = sorts;
  return params;
}

export function schemeApiVersion(scheme: Scheme): string {
  const { group, version } = scheme.groupVersionKind;
  return group ? `${group}/${version}` : version;
}

export function createQueryPresetName(): string {
  return `query-preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  const data = error.response?.data as
    { detail?: string; message?: string; title?: string } | undefined;
  return data?.detail || data?.message || data?.title || fallback;
}

export function apiErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}
