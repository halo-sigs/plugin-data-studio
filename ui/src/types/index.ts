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
}

export interface QueryPreset {
  apiVersion: string;
  kind: string;
  metadata: Metadata;
  spec: QueryPresetSpec;
}

export interface DataQuery {
  fieldSelectors: string[];
  labelSelectors: string[];
  sorts: string[];
}
