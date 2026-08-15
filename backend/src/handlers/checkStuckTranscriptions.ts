/**
 * EventBridge scheduled trigger (every 5 minutes).
 *
 * Fallback for a missed Speechmatics webhook: finds transcriptions stuck in
 * `PROCESSING` for longer than `STUCK_PROCESSING_THRESHOLD_MINUTES` and
 * re-polls the Speechmatics job status directly to reconcile.
 */
import type { ScheduledHandler } from 'aws-lambda';
import { queryStuckProcessing, updateTranscriptionStatus } from '../infra/dynamo';
import { persistTranscriptOutputs } from '../infra/s3';
import { getJobStatus, getJobTranscript } from '../infra/speechmatics';
import { errorMessage, logger } from '../shared/logger';
import { STUCK_PROCESSING_THRESHOLD_MINUTES, Transcription } from '../shared/types';

const MILLISECONDS_PER_MINUTE = 60_000;
const SUCCESS_STATUSES = new Set(['done', 'success']);
const FAILURE_STATUSES = new Set(['rejected', 'failed', 'expired']);

function thresholdIso(): string {
  return new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MINUTES * MILLISECONDS_PER_MINUTE).toISOString();
}

async function completeFromFallback(transcription: Transcription, jobId: string): Promise<void> {
  const [text, json] = await Promise.all([getJobTranscript(jobId, 'txt'), getJobTranscript(jobId, 'json-v2')]);
  const { textKey } = await persistTranscriptOutputs(transcription.userId, transcription.transcriptionId, text, json);
  await updateTranscriptionStatus(transcription.transcriptionId, { status: 'COMPLETED', transcriptS3Key: textKey });
}

async function reconcileOne(transcription: Transcription): Promise<void> {
  if (!transcription.speechmaticsJobId) {
    await updateTranscriptionStatus(transcription.transcriptionId, {
      status: 'FAILED',
      errorMessage: 'No Speechmatics job id recorded; cannot reconcile',
    });
    return;
  }

  const { status } = await getJobStatus(transcription.speechmaticsJobId);
  if (SUCCESS_STATUSES.has(status)) {
    await completeFromFallback(transcription, transcription.speechmaticsJobId);
  } else if (FAILURE_STATUSES.has(status)) {
    await updateTranscriptionStatus(transcription.transcriptionId, { status: 'FAILED', errorMessage: `Speechmatics job ${status}` });
  }
  // Still running/queued: leave as PROCESSING, it will be re-checked on the next scheduled run.
}

export const handler: ScheduledHandler = async (): Promise<void> => {
  const stuck = await queryStuckProcessing(thresholdIso());
  logger.info('Reconciling stuck transcriptions', { count: stuck.length });

  await Promise.all(
    stuck.map((transcription) =>
      reconcileOne(transcription).catch((error) => {
        logger.error('Failed to reconcile stuck transcription', {
          transcriptionId: transcription.transcriptionId,
          error: errorMessage(error),
        });
      }),
    ),
  );
};
