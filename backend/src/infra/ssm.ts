/**
 * SSM Parameter Store adapter. Reads `SecureString` parameters (the
 * Speechmatics permanent API key, the webhook shared secret) and caches
 * them in memory for the lifetime of the Lambda execution environment, per
 * `docs/ARCHITECTURE.md` §6.6.
 */
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

/** Module-level cache, reused across warm invocations of the same container. */
const parameterCache = new Map<string, string>();

/**
 * Fetches a (possibly encrypted) SSM parameter by name, decrypting it and
 * caching the plaintext value for subsequent calls in this container.
 */
export async function getSecureParam(name: string): Promise<string> {
  const cached = parameterCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const result = await ssmClient.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter "${name}" has no value`);
  }

  parameterCache.set(name, value);
  return value;
}

/** Test-only helper: clears the in-memory cache between test cases. */
export function clearParamCacheForTests(): void {
  parameterCache.clear();
}
