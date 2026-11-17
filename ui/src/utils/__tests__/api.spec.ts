import type { Scheme } from '@/types';
import { describe, expect, it } from 'vitest';
import { apiErrorStatus, buildListParams, schemeApiVersion } from '../api';

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
