/** Small helper to fail fast (and with a clear message) on missing configuration. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Same as `requireEnv` but returns `undefined` instead of throwing. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : value;
}
