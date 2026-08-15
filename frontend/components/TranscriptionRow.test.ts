import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import TranscriptionRow from './TranscriptionRow.vue'
import { useApi } from '~/composables/useApi'
import type { Transcription } from '~/types'

jest.mock('~/composables/useApi')

const mockGet = jest.fn()
const mockedUseApi = useApi as jest.MockedFunction<typeof useApi>

const baseTranscription: Transcription = {
  transcriptionId: 't1',
  userId: 'user-1',
  type: 'FILE',
  status: 'COMPLETED',
  sourceFileName: 'interview.mp3',
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:05:00.000Z',
}

function mountRow(overrides: Partial<Transcription> = {}): VueWrapper {
  return mount(TranscriptionRow, {
    props: { transcription: { ...baseTranscription, ...overrides } },
    global: { stubs: { transition: false } },
  })
}

describe('TranscriptionRow', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockedUseApi.mockReturnValue({ get: mockGet, post: jest.fn() })
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
  })

  it('renders the filename, type, and status badge', () => {
    const wrapper = mountRow()

    expect(wrapper.text()).toContain('interview.mp3')
    expect(wrapper.text()).toContain('FILE')
    expect(wrapper.find('[data-testid="status-badge"]').text()).toBe('COMPLETED')
  })

  it('falls back to "Live recording" for realtime transcriptions with no filename', () => {
    const wrapper = mountRow({ type: 'REALTIME', sourceFileName: undefined })

    expect(wrapper.text()).toContain('Live recording')
  })

  it('only shows the Download button for COMPLETED transcriptions', () => {
    const processing = mountRow({ status: 'PROCESSING' })
    expect(processing.find('[data-testid="download-button"]').exists()).toBe(false)

    const completed = mountRow({ status: 'COMPLETED' })
    expect(completed.find('[data-testid="download-button"]').exists()).toBe(true)
  })

  it('fetches the download URL and navigates the browser to it on click', async () => {
    mockGet.mockResolvedValueOnce({ downloadUrl: 'https://s3.example.com/signed-url' })
    const wrapper = mountRow()

    await wrapper.find('[data-testid="download-button"]').trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/transcriptions/t1/download')
    expect(window.location.href).toBe('https://s3.example.com/signed-url')
  })

  it('shows an inline error message when the download request fails', async () => {
    mockGet.mockRejectedValueOnce({ message: 'Link expired' })
    const wrapper = mountRow()

    await wrapper.find('[data-testid="download-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Link expired')
  })
})
