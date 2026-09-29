export function getFileUploadIdempotencyKey<T extends object>(
  keys: WeakMap<T, string>,
  file: T,
  createKey: () => string,
) {
  const existing = keys.get(file);
  if (existing) return existing;
  const key = createKey();
  keys.set(file, key);
  return key;
}
