import type { Scheme } from '@/types';
import { normalizePath } from './path';

export function buildBaseApiUrl(scheme: Scheme) {
  const { group, version } = scheme.groupVersionKind;

  const path = normalizePath(group ? '/apis/' : '/api/', group || '', version, scheme.plural);

  return path;
}
