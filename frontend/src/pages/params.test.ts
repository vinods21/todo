import { TASK_STATUSES } from '../api/types'
import { listPath, listSearchParams, parseListParams, parseStatusParam, returnTarget } from './params'

describe('SCRUM-6 list URL parameters', () => {
  it('SCRUM-6-AC-13: parseStatusParam accepts exactly the three enum names; anything else is "All"', () => {
    for (const status of TASK_STATUSES) expect(parseStatusParam(status)).toBe(status)
    for (const raw of ['done', 'Done', 'DONEE', '', ' DONE', 'TODO,DONE', null]) {
      expect(parseStatusParam(raw)).toBeUndefined()
    }
  })

  it('SCRUM-6-AC-13: parseListParams reads page and status with the same fallbacks', () => {
    expect(parseListParams(new URLSearchParams('status=DONE&page=2'))).toEqual({ page: 2, status: 'DONE' })
    expect(parseListParams(new URLSearchParams('page=3'))).toEqual({ page: 3 })
    expect(parseListParams(new URLSearchParams('status=done&page=x'))).toEqual({ page: 1 })
    expect(parseListParams(new URLSearchParams(''))).toEqual({ page: 1 })
  })

  it('SCRUM-6-AC-13: listSearchParams / listPath put status first and page only when > 1', () => {
    expect(listSearchParams({ page: 2, status: 'DONE' }).toString()).toBe('status=DONE&page=2')
    expect(listSearchParams({ page: 1 }).toString()).toBe('')
    expect(listPath({ page: 1 })).toBe('/')
    expect(listPath({ page: 2 })).toBe('/?page=2')
    expect(listPath({ page: 1, status: 'DONE' })).toBe('/?status=DONE')
    expect(listPath({ page: 2, status: 'IN_PROGRESS' })).toBe('/?status=IN_PROGRESS&page=2')
  })

  it('SCRUM-6-AC-15: a filtered, paged list path round-trips through returnTarget', () => {
    const returnTo = listPath({ page: 2, status: 'DONE' })
    expect(returnTarget({ returnTo })).toBe('/?status=DONE&page=2')
  })
})
