/**
 * Unit tests for the pure parsing helpers in `infra/speechmatics.ts`. The
 * HTTP-calling functions in that module are exercised through the handler
 * tests, which mock the whole adapter.
 */
import { extractDetectedLanguage } from '../../src/infra/speechmatics';

function jsonV2(metadata: unknown): string {
  return JSON.stringify({ format: '2.9', metadata, results: [] });
}

describe('infra/speechmatics — extractDetectedLanguage', () => {
  it('returns the highest-confidence Language Identification result', () => {
    const transcript = jsonV2({
      transcription_config: { language: 'auto' },
      language_identification: {
        results: [
          { language: 'en', confidence: 0.08 },
          { language: 'pt', confidence: 0.87 },
          { language: 'es', confidence: 0.41 },
        ],
      },
    });

    expect(extractDetectedLanguage(transcript)).toBe('pt');
  });

  it('does not rely on the results being pre-sorted by confidence', () => {
    const transcript = jsonV2({
      language_identification: {
        results: [
          { language: 'de', confidence: 0.2 },
          { language: 'nl', confidence: 0.9 },
        ],
      },
    });

    expect(extractDetectedLanguage(transcript)).toBe('nl');
  });

  it('falls back to the echoed transcription_config language for an explicit-language job', () => {
    expect(extractDetectedLanguage(jsonV2({ transcription_config: { language: 'ja' } }))).toBe('ja');
  });

  it('does not report "auto" as a detected language', () => {
    expect(extractDetectedLanguage(jsonV2({ transcription_config: { language: 'auto' } }))).toBeUndefined();
  });

  it('ignores identification entries without a usable language code', () => {
    const transcript = jsonV2({
      transcription_config: { language: 'auto' },
      language_identification: { results: [{ confidence: 0.99 }, { language: '', confidence: 0.98 }, 'nonsense'] },
    });

    expect(extractDetectedLanguage(transcript)).toBeUndefined();
  });

  it('treats a missing confidence as zero rather than discarding the entry', () => {
    const transcript = jsonV2({ language_identification: { results: [{ language: 'ca' }] } });

    expect(extractDetectedLanguage(transcript)).toBe('ca');
  });

  it.each([
    ['a non-JSON body', 'plain text transcript'],
    ['valid JSON that is not an object', '"just a string"'],
    ['an object with no metadata', '{"results":[]}'],
    ['metadata that is not an object', '{"metadata":"nope"}'],
  ])('returns undefined for %s', (_label, body) => {
    expect(extractDetectedLanguage(body)).toBeUndefined();
  });
});
