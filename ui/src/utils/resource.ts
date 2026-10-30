import type { Scheme, Unstructured } from '@/types';
import { isJsonObject } from './json';

export function summarizeResource(resource: Unstructured): string {
  const fields: { path: string; value: unknown }[] = [];
  function collect(value: unknown, path: string, depth: number) {
    if (isJsonObject(value) && depth < 3) {
      Object.entries(value).forEach(([key, child]) =>
        collect(child, path ? `${path}.${key}` : key, depth + 1)
      );
    } else if (!isJsonObject(value)) fields.push({ path, value });
  }
  Object.entries(resource)
    .filter(([key]) => !['apiVersion', 'kind', 'metadata'].includes(key))
    .forEach(([key, value]) => collect(value, key === 'spec' ? '' : key, 0));
  const priority = (path: string) => (/(^|\.)(title|displayName|name|appName)$/.test(path) ? 0 : 1);
  return fields
    .sort((a, b) => priority(a.path) - priority(b.path))
    .slice(0, 3)
    .map(
      ({ path, value }) =>
        `${path}: ${Array.isArray(value) ? `[${value.length} 项]` : typeof value === 'string' ? JSON.stringify(value.slice(0, 120)) + (value.length > 120 ? '…' : '') : JSON.stringify(value)}`
    )
    .join(' · ');
}

// Initial values only: never apply defaults or coercion to existing resources.
function schemaInitialValue(schema: unknown, depth = 0, rootSchema: unknown = schema): unknown {
  if (!isJsonObject(schema) || depth > 8) return undefined;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const referenced = schema.$ref
      .slice(2)
      .split('/')
      .reduce<unknown>(
        (value, segment) =>
          isJsonObject(value) ? value[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined,
        rootSchema
      );
    return schemaInitialValue(referenced, depth + 1, rootSchema);
  }
  if ('default' in schema) return JSON.parse(JSON.stringify(schema.default));
  if ('const' in schema) return JSON.parse(JSON.stringify(schema.const));
  if (Array.isArray(schema.enum) && schema.enum.length)
    return JSON.parse(JSON.stringify(schema.enum[0]));
  switch (schema.type) {
    case 'object': {
      const required = Array.isArray(schema.required) ? schema.required : [];
      return Object.fromEntries(
        Object.entries(isJsonObject(schema.properties) ? schema.properties : {})
          .filter(
            ([key, value]) => required.includes(key) || (isJsonObject(value) && 'default' in value)
          )
          .map(([key, value]) => [key, schemaInitialValue(value, depth + 1, rootSchema)])
          .filter(([, value]) => value !== undefined)
      );
    }
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'null':
      return null;
    default:
      return undefined;
  }
}

export function createResourceTemplate(scheme: Scheme): Unstructured {
  const initial = schemaInitialValue(scheme.openApiSchema);
  return {
    ...(isJsonObject(initial) ? initial : {}),
    apiVersion: [scheme.groupVersionKind.group, scheme.groupVersionKind.version]
      .filter(Boolean)
      .join('/'),
    kind: scheme.groupVersionKind.kind,
    metadata: {
      ...(isJsonObject(initial) && isJsonObject(initial.metadata) ? initial.metadata : {}),
      name: '',
    },
  };
}
