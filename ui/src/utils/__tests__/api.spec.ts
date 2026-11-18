import type { Scheme } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorStatus,
  buildListParams,
  fetchRecords,
  RECORDS_API,
  schemeApiVersion,
} from '../api';

const get = vi.hoisted(() => vi.fn<(url: string, config: unknown) => Promise<{ data: unknown }>>());
vi.mock('@halo-dev/api-client', () => ({ axiosInstance: { get } }));

const scheme: Scheme = {
  type: 'run.halo.app.core.extension.content.Post',
  plural: 'posts',
  singular: 'post',
  groupVersionKind: { group: 'content.halo.run', version: 'v1alpha1', kind: 'Post' },
  openApiSchema: {},
};

describe('buildListParams', () => {
  it('sends repeated selectors and keeps the keyword as an additional field selector', () => {
    const params = buildListParams({
      page: 2,
      size: 50,
      keyword: ' post-1 ',
      fieldSelectors: ['spec.slug=hello'],
      labelSelectors: ['app=halo', 'tier=(frontend,backend)'],
      sorts: ['metadata.creationTimestamp,desc'],
    });

    expect(params.page).toBe(2);
    expect(params.size).toBe(50);
    expect(params.fieldSelector).toEqual(['spec.slug=hello', 'metadata.name=post-1']);
    expect(params.labelSelector).toEqual(['app=halo', 'tier=(frontend,backend)']);
    expect(params.sort).toEqual(['metadata.creationTimestamp,desc']);
  });

  it('omits empty selectors', () => {
    const params = buildListParams({
      keyword: ' ',
      fieldSelectors: [''],
      labelSelectors: [''],
      sorts: [''],
    });

    expect(params).toEqual({});
  });

  it('turns the creation date range into instant bounds', () => {
    const params = buildListParams({ createdRange: { start: '2026-11-01', end: '2026-11-18' } });

    expect(params).toEqual({
      createdAfter: new Date(2026, 10, 1).toISOString(),
      createdBefore: new Date(2026, 10, 19).toISOString(),
    });
  });
});

describe('fetchRecords', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: { items: [], total: 0 } });
  });

  it("uses the model's own list API without a time range", async () => {
    await fetchRecords(scheme, { page: 1, fieldSelector: ['spec.slug=a'] });

    expect(get).toHaveBeenCalledWith('/apis/content.halo.run/v1alpha1/posts', {
      params: { page: 1, fieldSelector: ['spec.slug=a'] },
    });
  });

  it('routes ranged queries through the plugin with the model identity', async () => {
    await fetchRecords(scheme, { page: 1, createdAfter: 'a', createdBefore: 'b' });

    expect(get).toHaveBeenCalledWith(RECORDS_API, {
      params: {
        apiVersion: 'content.halo.run/v1alpha1',
        kind: 'Post',
        page: 1,
        createdAfter: 'a',
        createdBefore: 'b',
      },
    });
  });
});

describe('schemeApiVersion', () => {
  it('keeps the group for namespaced models and only the version for core models', () => {
    expect(schemeApiVersion(scheme)).toBe('content.halo.run/v1alpha1');
    expect(
      schemeApiVersion({
        ...scheme,
        groupVersionKind: { group: '', version: 'v1alpha1', kind: 'ConfigMap' },
      })
    ).toBe('v1alpha1');
  });
});

describe('apiErrorStatus', () => {
  it('returns the HTTP status of an axios error only', () => {
    expect(apiErrorStatus({ isAxiosError: true, response: { status: 500 } })).toBe(500);
    expect(apiErrorStatus(new Error('network'))).toBeUndefined();
  });
});
