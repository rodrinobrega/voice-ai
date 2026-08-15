import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'
import { useCursorPager } from '~/composables/useCursorPager'
import { toDisplayError, type AppError, type ListTranscriptionsResponse, type Transcription } from '~/types'

const PAGE_SIZE = 10

export const useTranscriptionsStore = defineStore('transcriptions', () => {
  const api = useApi()
  const pager = useCursorPager()

  const items = ref<Transcription[]>([])
  const loading = ref(false)
  const error = ref<AppError | null>(null)
  const nextCursor = ref<string | null>(null)

  const hasPrevious = computed<boolean>(() => pager.hasPrevious.value)
  const hasNext = computed<boolean>(() => nextCursor.value !== null)

  async function fetchPage(cursor: string | undefined): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = await api.get<ListTranscriptionsResponse>('/transcriptions', {
        cursor,
        limit: PAGE_SIZE,
      })
      items.value = response.items
      nextCursor.value = response.nextCursor
    } catch (err) {
      error.value = toDisplayError(err, 'Failed to load transcriptions.')
    } finally {
      loading.value = false
    }
  }

  async function loadFirstPage(): Promise<void> {
    pager.reset()
    await fetchPage(pager.currentCursor.value)
  }

  async function loadNextPage(): Promise<void> {
    if (!hasNext.value) return
    pager.goNext(nextCursor.value)
    await fetchPage(pager.currentCursor.value)
  }

  async function loadPreviousPage(): Promise<void> {
    if (!hasPrevious.value) return
    pager.goPrevious()
    await fetchPage(pager.currentCursor.value)
  }

  return {
    items,
    loading,
    error,
    hasPrevious,
    hasNext,
    loadFirstPage,
    loadNextPage,
    loadPreviousPage,
  }
})
