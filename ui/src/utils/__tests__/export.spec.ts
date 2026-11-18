import type { ExportJob, Scheme } from '@/types';
import { describe, expect, it } from 'vitest';
import {
  exportDownloadUrl,
  exportFieldPaths,
  exportJobDescription,
  exportJobStatusLabel,
  isExportJobActive,
} from '../export';

const scheme = {
  type: 'Post',
  plural: 'posts',
  singular: 'post',
  groupVersionKind: { group: 'content.halo.run', version: 'v1alpha1', kind: 'Post' },
  openApiSchema: {
    type: 'object',
    properties: {
      apiVersion: { type: 'string' },
      kind: { type: 'string' },
      metadata: { $ref: '#/components/schemas/Metadata' },
      spec: { $ref: '#/components/schemas/PostSpec' },
      status: { $ref: '#/components/schemas/PostStatus' },
    },
    components: {
      schemas: {
        PostSpec: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            excerpt: { $ref: '#/components/schemas/Excerpt' },
            tags: { type: 'array', items: { type: 'string' } },
            extra: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        Excerpt: {
          type: 'object',
          properties: {
            raw: { type: 'string' },
            autoGenerate: { type: 'boolean' },
          },
        },
        PostStatus: {
          type: 'object',
          properties: {
            phase: { type: 'string' },
            conditions: { type: 'array', items: { $ref: '#/components/schemas/Condition' } },
          },
        },
        Condition: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  },
} as unknown as Scheme;

function job(status?: ExportJob['status']): ExportJob {
  return {
    apiVersion: 'datastudio.halo.run/v1alpha1',
    kind: 'ExportJob',
    metadata: { name: 'export-1' },
    spec: { apiVersion: 'content.halo.run/v1alpha1', kind: 'Post', format: 'CSV' },
    status,
  };
}

describe('exportFieldPaths', () => {
  it('resolves schema references and skips non-exportable envelope fields', () => {
    const paths = exportFieldPaths(scheme);

    expect(paths.slice(0, 4)).toEqual([
      'metadata.name',
      'metadata.creationTimestamp',
      'metadata.labels',
      'metadata.annotations',
    ]);
    expect(paths).toContain('spec.title');
    expect(paths).toContain('spec.excerpt.raw');
    expect(paths).toContain('spec.excerpt.autoGenerate');
    expect(paths).toContain('spec.tags');
    expect(paths).toContain('spec.extra');
    expect(paths).toContain('status.phase');
    expect(paths).toContain('status.conditions');
    expect(paths).not.toContain('apiVersion');
    expect(paths).not.toContain('kind');
    expect(paths).not.toContain('metadata');
  });
});

describe('export job presentation', () => {
  it('describes progress without exposing enum values', () => {
    expect(exportJobDescription(job())).toBe('等待处理');
    expect(isExportJobActive(job())).toBe(true);
    expect(isExportJobActive(job({ phase: 'PENDING' }))).toBe(true);
    expect(isExportJobActive(job({ phase: 'RUNNING', processed: 20, total: 50 }))).toBe(true);
    expect(exportJobDescription(job({ phase: 'RUNNING', processed: 20, total: 50 }))).toBe(
      '已导出 20 / 50 条'
    );
    expect(exportJobStatusLabel(job({ phase: 'SUCCEEDED' }))).toBe('已完成');
    expect(
      exportJobDescription(job({ phase: 'SUCCEEDED', processed: 50, fileName: 'post-export.csv' }))
    ).toBe('CSV · 50 条');
    expect(exportJobDescription(job({ phase: 'FAILED', message: '磁盘空间不足' }))).toBe(
      '磁盘空间不足'
    );
    expect(exportJobStatusLabel(job({ phase: 'EXPIRED' }))).toBe('已过期');
    expect(isExportJobActive(job({ phase: 'FAILED' }))).toBe(false);
  });

  it('builds an encoded download URL', () => {
    expect(exportDownloadUrl('export job/1')).toBe(
      '/apis/console.api.datastudio.halo.run/v1alpha1/exports/export%20job%2F1/download'
    );
  });
});
