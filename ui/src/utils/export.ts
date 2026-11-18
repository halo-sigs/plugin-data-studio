import type { ExportConfig, ExportJob, Scheme } from '@/types';
import { EXPORT_DOWNLOAD_API } from './api';
import { isJsonObject } from './json';

const METADATA_FIELDS = [
  'metadata.name',
  'metadata.creationTimestamp',
  'metadata.labels',
  'metadata.annotations',
];
const MAX_PATHS = 300;
const MAX_DEPTH = 6;

function resolveSchema(node: unknown, root: unknown, depth = 0): unknown {
  if (!isJsonObject(node) || depth > 8 || typeof node.$ref !== 'string') {
    return node;
  }
  if (!node.$ref.startsWith('#/')) {
    return node;
  }
  const referenced = node.$ref
    .slice(2)
    .split('/')
    .reduce<unknown>(
      (value, segment) =>
        isJsonObject(value) ? value[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined,
      root
    );
  return resolveSchema(referenced, root, depth + 1);
}

function collectFields(
  node: unknown,
  path: string,
  root: unknown,
  depth: number,
  paths: string[],
  seen: Set<string>
) {
  if (depth > MAX_DEPTH || paths.length >= MAX_PATHS) return;
  const schema = resolveSchema(node, root);
  if (!isJsonObject(schema)) return;
  const properties = isJsonObject(schema.properties) ? schema.properties : undefined;
  if (schema.type === 'array' || !properties || !Object.keys(properties).length) {
    if (!seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
    return;
  }
  for (const [key, child] of Object.entries(properties)) {
    collectFields(child, `${path}.${key}`, root, depth + 1, paths, seen);
  }
}

/**
 * Lists field paths from the model schema for CSV column suggestions.
 */
export function exportFieldPaths(scheme: Scheme): string[] {
  const root = scheme.openApiSchema;
  const paths = [...METADATA_FIELDS];
  const seen = new Set(paths);
  const properties =
    isJsonObject(root) && isJsonObject(root.properties) ? root.properties : undefined;
  if (!properties) return paths;
  for (const [key, node] of Object.entries(properties)) {
    if (['apiVersion', 'kind', 'metadata'].includes(key)) continue;
    collectFields(node, key, root, 0, paths, seen);
  }
  return paths;
}

export function isExportJobActive(job: ExportJob): boolean {
  const phase = job.status?.phase;
  return !phase || phase === 'PENDING' || phase === 'RUNNING';
}

export function exportJobStatusLabel(job: ExportJob): string {
  switch (job.status?.phase) {
    case 'PENDING':
      return '等待中';
    case 'RUNNING':
      return '导出中';
    case 'SUCCEEDED':
      return '已完成';
    case 'FAILED':
      return '失败';
    case 'EXPIRED':
      return '已过期';
    default:
      return '等待中';
  }
}

export function exportJobStatusState(job: ExportJob): 'default' | 'success' | 'warning' | 'error' {
  switch (job.status?.phase) {
    case 'RUNNING':
      return 'warning';
    case 'SUCCEEDED':
      return 'success';
    case 'FAILED':
      return 'error';
    default:
      return 'default';
  }
}

export function exportJobDescription(job: ExportJob): string {
  const status = job.status;
  switch (status?.phase) {
    case 'RUNNING':
      return status.total
        ? `已导出 ${status.processed || 0} / ${status.total} 条`
        : `已导出 ${status.processed || 0} 条`;
    case 'SUCCEEDED':
      return `${job.spec.format} · ${status.processed || 0} 条`;
    case 'FAILED':
      return status.message || '导出失败，请重新导出';
    case 'EXPIRED':
      return '导出文件已过期';
    default:
      return '等待处理';
  }
}

export function exportDownloadUrl(name: string): string {
  return `${EXPORT_DOWNLOAD_API}/${encodeURIComponent(name)}/download`;
}

/**
 * Trims CSV columns, drops empty ones, and clears columns for JSON so configs compare reliably.
 */
export function normalizeExportConfig(config: ExportConfig): Required<ExportConfig> {
  return {
    format: config.format,
    columns:
      config.format === 'CSV'
        ? (config.columns || [])
            .map((column) => ({ field: column.field.trim(), header: column.header?.trim() || '' }))
            .filter((column) => column.field)
        : [],
  };
}
