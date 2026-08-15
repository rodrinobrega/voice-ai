import { mount, type VueWrapper } from '@vue/test-utils'
import FileUploader from './FileUploader.vue'
import { useApi } from '~/composables/useApi'

jest.mock('~/composables/useApi')

const mockPost = jest.fn()
const mockGet = jest.fn()
const mockedUseApi = useApi as jest.MockedFunction<typeof useApi>

const ONE_MB = 1024 * 1024
const MAX_SIZE_BYTES = 20 * ONE_MB

function createFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true })
  return file
}

async function selectFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find('[data-testid="file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('FileUploader client-side validation', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
    mockedUseApi.mockReturnValue({ get: mockGet, post: mockPost })
  })

  it('rejects a file whose MIME type does not start with audio/', async () => {
    const wrapper = mount(FileUploader)

    await selectFile(wrapper, createFile('notes.txt', 'text/plain', 1 * ONE_MB))

    expect(wrapper.find('[data-testid="validation-error"]').text()).toMatch(/audio files/i)
    expect(wrapper.find('[data-testid="selected-file-name"]').exists()).toBe(false)
  })

  it('rejects an audio file larger than the 20MB limit', async () => {
    const wrapper = mount(FileUploader)

    await selectFile(wrapper, createFile('big.mp3', 'audio/mpeg', MAX_SIZE_BYTES + 1))

    expect(wrapper.find('[data-testid="validation-error"]').text()).toMatch(/too large/i)
    expect(wrapper.find('[data-testid="selected-file-name"]').exists()).toBe(false)
  })

  it('accepts a valid audio file exactly at the 20MB boundary', async () => {
    const wrapper = mount(FileUploader)

    await selectFile(wrapper, createFile('ok.mp3', 'audio/mpeg', MAX_SIZE_BYTES))

    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toBe('ok.mp3')
  })

  it('accepts a small valid audio file dropped via drag-and-drop', async () => {
    const wrapper = mount(FileUploader)
    const file = createFile('voice.wav', 'audio/wav', 2 * ONE_MB)

    await wrapper.find('[data-testid="dropzone"]').trigger('drop', {
      dataTransfer: { files: [file] },
    })

    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toBe('voice.wav')
  })

  it('never calls the upload-url API for a file that fails validation', async () => {
    const wrapper = mount(FileUploader)

    await selectFile(wrapper, createFile('big.mp3', 'audio/mpeg', 25 * ONE_MB))

    expect(mockPost).not.toHaveBeenCalled()
  })

  it('replaces a previous validation error once a valid file is chosen', async () => {
    const wrapper = mount(FileUploader)

    await selectFile(wrapper, createFile('notes.txt', 'text/plain', 1 * ONE_MB))
    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(true)

    await selectFile(wrapper, createFile('ok.mp3', 'audio/mpeg', 1 * ONE_MB))
    expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toBe('ok.mp3')
  })
})
