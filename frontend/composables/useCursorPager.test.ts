import { useCursorPager } from './useCursorPager'

describe('useCursorPager', () => {
  it('starts on the first page with no previous cursor available', () => {
    const pager = useCursorPager()

    expect(pager.currentCursor.value).toBeUndefined()
    expect(pager.hasPrevious.value).toBe(false)
  })

  it('does nothing when goNext receives a null cursor (last page reached)', () => {
    const pager = useCursorPager()

    pager.goNext(null)

    expect(pager.currentCursor.value).toBeUndefined()
    expect(pager.hasPrevious.value).toBe(false)
  })

  it('pushes the current cursor onto history and advances on goNext', () => {
    const pager = useCursorPager()

    pager.goNext('cursor-page-2')

    expect(pager.currentCursor.value).toBe('cursor-page-2')
    expect(pager.hasPrevious.value).toBe(true)
  })

  it('pops the history stack and returns to the previous cursor on goPrevious', () => {
    const pager = useCursorPager()

    pager.goNext('cursor-page-2')
    pager.goNext('cursor-page-3')
    pager.goPrevious()

    expect(pager.currentCursor.value).toBe('cursor-page-2')
    expect(pager.hasPrevious.value).toBe(true)
  })

  it('returns to the first page (undefined cursor) after popping the entire stack', () => {
    const pager = useCursorPager()

    pager.goNext('cursor-page-2')
    pager.goPrevious()

    expect(pager.currentCursor.value).toBeUndefined()
    expect(pager.hasPrevious.value).toBe(false)
  })

  it('does nothing when goPrevious is called with an empty history', () => {
    const pager = useCursorPager()

    pager.goPrevious()

    expect(pager.currentCursor.value).toBeUndefined()
    expect(pager.hasPrevious.value).toBe(false)
  })

  it('supports repeated next/previous navigation across many pages (stack behaves LIFO)', () => {
    const pager = useCursorPager()

    pager.goNext('p2')
    pager.goNext('p3')
    pager.goNext('p4')
    expect(pager.currentCursor.value).toBe('p4')

    pager.goPrevious()
    expect(pager.currentCursor.value).toBe('p3')

    pager.goPrevious()
    expect(pager.currentCursor.value).toBe('p2')

    pager.goNext('p3-again')
    expect(pager.currentCursor.value).toBe('p3-again')
    expect(pager.hasPrevious.value).toBe(true)
  })

  it('reset clears history and returns to the first page', () => {
    const pager = useCursorPager()

    pager.goNext('p2')
    pager.goNext('p3')
    pager.reset()

    expect(pager.currentCursor.value).toBeUndefined()
    expect(pager.hasPrevious.value).toBe(false)
  })
})
