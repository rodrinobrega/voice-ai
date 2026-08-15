import { createPinia, setActivePinia } from 'pinia'
import { useTranscriptionsStore } from './transcriptions'
import { useApi } from '~/composables/useApi'
import type { ListTranscriptionsResponse, Transcription } from '~/types'

jest.mock('~/composables/useApi')

const mockGet = jest.fn()
const mockedUseApi = useApi as jest.MockedFunction<typeof useApi>

function makeTranscription(id: string): Transcription {
  return {
    transcriptionId: id,
    userId: 'user-123',
    type: 'FILE',
    status: 'COMPLETED',
    sourceFileName: `${id}.mp3`,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:05:00.000Z',
  }
}

function makePage(ids: string[], nextCursor: string | null): ListTranscriptionsResponse {
  return { items: ids.map(makeTranscription), nextCursor }
}

describe('transcriptions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockedUseApi.mockReturnValue({ get: mockGet, post: jest.fn() })
  })

  it('loads the first page and exposes hasNext when a cursor is returned', async () => {
    mockGet.mockResolvedValueOnce(makePage(['t1', 't2'], 'cursor-2'))

    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    expect(mockGet).toHaveBeenCalledWith('/transcriptions', { cursor: undefined, limit: 10 })
    expect(store.items).toHaveLength(2)
    expect(store.hasNext).toBe(true)
    expect(store.hasPrevious).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('pushes the cursor stack forward on loadNextPage', async () => {
    mockGet.mockResolvedValueOnce(makePage(['t1', 't2'], 'cursor-2'))
    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    mockGet.mockResolvedValueOnce(makePage(['t3', 't4'], null))
    await store.loadNextPage()

    expect(mockGet).toHaveBeenLastCalledWith('/transcriptions', { cursor: 'cursor-2', limit: 10 })
    expect(store.items.map((i) => i.transcriptionId)).toEqual(['t3', 't4'])
    expect(store.hasNext).toBe(false)
    expect(store.hasPrevious).toBe(true)
  })

  it('is a no-op when loadNextPage is called with no next cursor available', async () => {
    mockGet.mockResolvedValueOnce(makePage(['t1'], null))
    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    await store.loadNextPage()

    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('pops the cursor stack back to the first page on loadPreviousPage', async () => {
    mockGet.mockResolvedValueOnce(makePage(['t1', 't2'], 'cursor-2'))
    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    mockGet.mockResolvedValueOnce(makePage(['t3', 't4'], null))
    await store.loadNextPage()

    mockGet.mockResolvedValueOnce(makePage(['t1', 't2'], 'cursor-2'))
    await store.loadPreviousPage()

    expect(mockGet).toHaveBeenLastCalledWith('/transcriptions', { cursor: undefined, limit: 10 })
    expect(store.items.map((i) => i.transcriptionId)).toEqual(['t1', 't2'])
    expect(store.hasPrevious).toBe(false)
  })

  it('is a no-op when loadPreviousPage is called on the first page', async () => {
    mockGet.mockResolvedValueOnce(makePage(['t1'], null))
    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    await store.loadPreviousPage()

    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('captures a failed fetch as a store error without throwing', async () => {
    mockGet.mockRejectedValueOnce({ message: 'Network error' })

    const store = useTranscriptionsStore()
    await store.loadFirstPage()

    expect(store.error).toEqual({ message: 'Network error' })
    expect(store.loading).toBe(false)
  })
})
