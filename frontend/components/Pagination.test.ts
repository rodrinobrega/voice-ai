import { mount } from '@vue/test-utils'
import Pagination from './Pagination.vue'

describe('Pagination', () => {
  it('disables the Previous button when hasPrevious is false', () => {
    const wrapper = mount(Pagination, { props: { hasPrevious: false, hasNext: true } })

    expect(wrapper.find('[data-testid="pagination-previous"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="pagination-next"]').attributes('disabled')).toBeUndefined()
  })

  it('disables the Next button when hasNext is false', () => {
    const wrapper = mount(Pagination, { props: { hasPrevious: true, hasNext: false } })

    expect(wrapper.find('[data-testid="pagination-next"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="pagination-previous"]').attributes('disabled')).toBeUndefined()
  })

  it('emits "next" when the Next button is clicked while enabled', async () => {
    const wrapper = mount(Pagination, { props: { hasPrevious: false, hasNext: true } })

    await wrapper.find('[data-testid="pagination-next"]').trigger('click')

    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toBeUndefined()
  })

  it('emits "previous" when the Previous button is clicked while enabled', async () => {
    const wrapper = mount(Pagination, { props: { hasPrevious: true, hasNext: false } })

    await wrapper.find('[data-testid="pagination-previous"]').trigger('click')

    expect(wrapper.emitted('previous')).toHaveLength(1)
  })

  it('disables both buttons while loading, regardless of hasPrevious/hasNext', () => {
    const wrapper = mount(Pagination, { props: { hasPrevious: true, hasNext: true, loading: true } })

    expect(wrapper.find('[data-testid="pagination-previous"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="pagination-next"]').attributes('disabled')).toBeDefined()
  })
})
