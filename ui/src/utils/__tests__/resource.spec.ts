import type { Scheme, Unstructured } from '@/types';
import { describe, expect, it } from 'vitest';
import { readonly } from 'vue';
import { createResourceTemplate, summarizeResource } from '../resource';

const resource: Unstructured = {
  apiVersion: 'test/v1',
  kind: 'Example',
  metadata: { name: 'id', version: 3 },
};
describe('resource summaries', () => {
  it('puts human-readable identity before other data and omits the resource envelope', () => {
    const result = summarizeResource({
      ...resource,
      spec: { source: 'account', appName: 'Halo Pro', licenseName: 'license-a' },
    });
    expect(result).toBe('appName: "Halo Pro" · source: "account" · licenseName: "license-a"');
  });
  it('keeps false, zero and null and summarizes arrays without dumping their contents', () => {
    expect(
      summarizeResource({ ...resource, settings: { enabled: false, retries: 0, value: null } })
    ).toBe('settings.enabled: false · settings.retries: 0 · settings.value: null');
    expect(summarizeResource({ ...resource, entries: [{ large: 'payload' }] })).toBe(
      'entries: [1 项]'
    );
  });
  it('bounds long values and leaves envelope-only records without a redundant summary', () => {
    expect(summarizeResource({ ...resource, body: 'x'.repeat(10000) }).length).toBeLessThan(160);
    expect(summarizeResource(resource)).toBe('');
  });
});
it('initializes required fields and clones defaults from reactive schemas without mutation', () => {
  const scheme = readonly({
    type: 'Example',
    plural: 'examples',
    singular: 'example',
    groupVersionKind: { group: 'test', version: 'v1', kind: 'Example' },
    openApiSchema: {
      type: 'object',
      required: ['spec'],
      properties: {
        spec: {
          type: 'object',
          required: ['count', 'enabled'],
          properties: {
            count: { type: 'integer' },
            enabled: { type: 'boolean' },
            labels: { default: ['initial'] },
            optional: { type: 'string' },
          },
        },
      },
    },
  }) as Scheme;
  const result = createResourceTemplate(scheme);
  expect(result.spec).toEqual({ count: 0, enabled: false, labels: ['initial'] });
  (result.spec as { labels: string[] }).labels.push('edited');
  expect(createResourceTemplate(scheme).spec).toEqual({
    count: 0,
    enabled: false,
    labels: ['initial'],
  });
});

it('resolves local schema references when initializing required fields', () => {
  const scheme = {
    type: 'Example',
    plural: 'examples',
    singular: 'example',
    groupVersionKind: { group: 'test', version: 'v1', kind: 'Example' },
    openApiSchema: {
      type: 'object',
      required: ['spec'],
      properties: {
        spec: { $ref: '#/components/schemas/ExampleSpec' },
      },
      components: {
        schemas: {
          ExampleSpec: {
            type: 'object',
            required: ['title', 'excerpt'],
            properties: {
              title: { type: 'string' },
              excerpt: { $ref: '#/components/schemas/Excerpt' },
            },
          },
          Excerpt: {
            type: 'object',
            required: ['autoGenerate'],
            properties: {
              autoGenerate: { type: 'boolean', default: true },
            },
          },
        },
      },
    },
  } as Scheme;

  expect(createResourceTemplate(scheme).spec).toEqual({
    title: '',
    excerpt: { autoGenerate: true },
  });
});
