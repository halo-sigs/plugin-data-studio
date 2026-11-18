import type { Metadata } from '@halo-dev/api-client';

export interface Unstructured {
  kind: string;
  apiVersion: string;
  metadata: Metadata;
  [key: string]: unknown;
}

export interface ListResponse<T> {
  page: number;
  size: number;
  total: number;
  items: T[];
  first: boolean;
  last: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  totalPages: number;
}

export interface GroupVersionKind {
  kind: string;
  group?: string;
  version: string;
}

export interface Scheme {
  type: string;
  groupVersionKind: GroupVersionKind;
  plural: string;
  singular: string;
  openApiSchema: object;
}

export interface QueryPresetSpec {
  displayName: string;
  apiVersion: string;
  kind: string;
  fieldSelectors?: string[];
  labelSelectors?: string[];
  sorts?: string[];
  createdRange?: DateRange;
  /** Export settings applied when exporting with this preset. */
  export?: ExportConfig;
}

export interface QueryPreset {
  apiVersion: string;
  kind: string;
  metadata: Metadata;
  spec: QueryPresetSpec;
}

/** Inclusive local calendar dates, formatted as YYYY-MM-DD. */
export interface DateRange {
  start: string;
  end: string;
}

export interface DataQuery {
  fieldSelectors: string[];
  labelSelectors: string[];
  sorts: string[];
  /** Halo field selectors cannot compare, so this is sent separately. */
  createdRange?: DateRange;
}

export type ExportFormat = 'CSV' | 'JSON';

export interface ExportColumn {
  field: string;
  header?: string;
}

export interface ExportConfig {
  format: ExportFormat;
  columns?: ExportColumn[];
}

export type ExportJobPhase = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface ExportJobSpec {
  apiVersion: string;
  kind: string;
  format: ExportFormat;
  columns?: ExportColumn[];
  fieldSelectors?: string[];
  labelSelectors?: string[];
  sorts?: string[];
  /** Inclusive ISO instant. */
  createdAfter?: string;
  /** Exclusive ISO instant. */
  createdBefore?: string;
}

export interface ExportJobStatus {
  phase: ExportJobPhase;
  total?: number;
  processed?: number;
  bytes?: number;
  fileName?: string;
  mediaType?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExportJob {
  apiVersion: string;
  kind: string;
  metadata: Metadata;
  spec: ExportJobSpec;
  status?: ExportJobStatus;
}
