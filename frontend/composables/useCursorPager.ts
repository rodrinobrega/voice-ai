import { computed, ref, type Ref } from 'vue'

/**
 * DynamoDB only supports forward pagination (`LastEvaluatedKey`), so
 * "Previous" has to be implemented client-side with a stack of cursors
 * we've already visited: pushing the current cursor before moving forward,
 * and popping it to move back. This composable isolates that stack logic
 * so it can be unit-tested independently of the transcriptions store or
 * any network code.
 */
export interface CursorPager {
  /** Cursor to send with the next fetch request (`undefined` = first page). */
  currentCursor: Ref<string | undefined>
  /** True once at least one "next" has been taken (i.e. "Previous" is valid). */
  hasPrevious: Ref<boolean>
  /** Record the cursor used to reach the page that is about to be replaced,
   * then move forward to `nextCursor`. No-ops if `nextCursor` is null. */
  goNext: (nextCursor: string | null) => void
  /** Move back to the previously visited cursor. No-ops if there is none. */
  goPrevious: () => void
  /** Clear all history and return to the first page. */
  reset: () => void
}

export function useCursorPager(): CursorPager {
  const history = ref<Array<string | undefined>>([])
  const currentCursor = ref<string | undefined>(undefined)

  const hasPrevious = computed(() => history.value.length > 0)

  function goNext(nextCursor: string | null): void {
    if (nextCursor === null) {
      return
    }
    history.value.push(currentCursor.value)
    currentCursor.value = nextCursor
  }

  function goPrevious(): void {
    if (history.value.length === 0) {
      return
    }
    currentCursor.value = history.value.pop()
  }

  function reset(): void {
    history.value = []
    currentCursor.value = undefined
  }

  return { currentCursor, hasPrevious, goNext, goPrevious, reset }
}
