export function normalizePath(...paths: string[]): string {
  return paths.join('/').replace(/\/+/g, '/');
}
