import type { DateRange, ListResponse, Scheme, Unstructured } from '@/types';
import { axiosInstance } from '@halo-dev/api-client';
import { isAxiosError } from 'axios';
import { dateRangeBounds } from './date-range';
import { normalizePath } from './path';

export const QUERY_PRESET_API = '/apis/datastudio.halo.run/v1alpha1/querypresets';
export const EXPORT_JOB_API = '/apis/datastudio.halo.run/v1alpha1/exportjobs';
export const EXPORT_DOWNLOAD_API = '/apis/console.api.datastudio.halo.run/v1alpha1/exports';
export const RECORDS_API = '/apis/console.api.datastudio.halo.run/v1alpha1/records';

export interface DataListParams {
  page?: number;
  size?: number;
  keyword?: string;
  fieldSelectors?: string[];
  labelSelectors?: string[];
  sorts?: string[];
  createdRange?: DateRange;
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
  createdAfter?: string;
  createdBefore?: string;
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
  if (query.createdRange) Object.assign(params, dateRangeBounds(query.createdRange));
  return params;
}

/** Halo's own list API cannot filter by time, so ranged queries go through the plugin. */
export async function fetchRecords(scheme: Scheme, params: ListParams) {
  const ranged = !!(params.createdAfter || params.createdBefore);
  const { data } = await axiosInstance.get<ListResponse<Unstructured>>(
    ranged ? RECORDS_API : buildBaseApiUrl(scheme),
    {
      params: ranged
        ? { apiVersion: schemeApiVersion(scheme), kind: scheme.groupVersionKind.kind, ...params }
        : params,
    }
  );
  return data;
}

export function schemeApiVersion(scheme: Scheme): string {
  const { group, version } = scheme.groupVersionKind;
  return group ? `${group}/${version}` : version;
}

function createResourceName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createQueryPresetName(): string {
  return createResourceName('query-preset');
}

export function createExportJobName(): string {
  return createResourceName('export-job');
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
