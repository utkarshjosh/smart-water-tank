const readMetaEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }

  return undefined;
};

export function getEnv(key: string, fallback?: string) {
  const metaValue = readMetaEnv(key);
  if (typeof metaValue === 'string' && metaValue.length > 0) {
    return metaValue;
  }

  const processValue = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (typeof processValue === 'string' && processValue.length > 0) {
    return processValue;
  }

  return fallback;
}
