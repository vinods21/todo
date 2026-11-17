import { ApiError } from '../api/errors'
import { makeTask } from '../test/fixtures'
import {
  DESCRIPTION_TOO_LONG_MESSAGE,
  EMPTY_FORM,
  mapServerErrors,
  TITLE_REQUIRED_MESSAGE,
  TITLE_TOO_LONG_MESSAGE,
  toCreateRequest,
  toFormValues,
  toUpdateRequest,
  validateTaskForm,
} from './taskForm'

const valid = { ...EMPTY_FORM, title: 'Buy milk' }

describe('SCRUM-1 task form model', () => {
  it('SCRUM-1-AC-07: title is required (empty or whitespace-only)', () => {
    expect(validateTaskForm({ ...valid, title: '' })).toEqual({ title: TITLE_REQUIRED_MESSAGE })
    expect(validateTaskForm({ ...valid, title: '  \t ' })).toEqual({ title: TITLE_REQUIRED_MESSAGE })
  })

  it('SCRUM-1-AC-07: title may be 200 characters after trimming but not 201', () => {
    expect(validateTaskForm({ ...valid, title: `  ${'a'.repeat(200)}  ` })).toEqual({})
    expect(validateTaskForm({ ...valid, title: 'a'.repeat(201) })).toEqual({ title: TITLE_TOO_LONG_MESSAGE })
  })

  it('SCRUM-1-AC-07: description may be 2000 characters but not 2001', () => {
    expect(validateTaskForm({ ...valid, description: 'd'.repeat(2000) })).toEqual({})
    expect(validateTaskForm({ ...valid, description: 'd'.repeat(2001) })).toEqual({
      description: DESCRIPTION_TOO_LONG_MESSAGE,
    })
  })

  it('SCRUM-1-AC-07: past due dates are accepted', () => {
    expect(validateTaskForm({ ...valid, dueDate: '2001-01-01' })).toEqual({})
  })

  it('SCRUM-1-AC-04: create request trims the title and sends empty description/dueDate as null', () => {
    expect(toCreateRequest({ title: '  Buy milk  ', description: '   ', status: 'TODO', dueDate: '' })).toEqual({
      title: 'Buy milk',
      description: null,
      status: 'TODO',
      dueDate: null,
    })
    expect(toCreateRequest({ title: 'x', description: ' keep ', status: 'DONE', dueDate: '2026-12-01' })).toEqual({
      title: 'x',
      description: ' keep ',
      status: 'DONE',
      dueDate: '2026-12-01',
    })
  })

  it('SCRUM-1-AC-06: update request always includes all four fields, including status', () => {
    const req = toUpdateRequest({ title: 'T', description: '', status: 'IN_PROGRESS', dueDate: '' })
    expect(Object.keys(req).sort()).toEqual(['description', 'dueDate', 'status', 'title'])
    expect(req.status).toBe('IN_PROGRESS')
  })

  it('SCRUM-1-AC-05: task → form values maps nulls to empty strings', () => {
    expect(toFormValues(makeTask({ title: 'T', description: null, status: 'DONE', dueDate: null }))).toEqual({
      title: 'T',
      description: '',
      status: 'DONE',
      dueDate: '',
    })
    expect(toFormValues(makeTask({ description: 'D', dueDate: '2026-12-01' }))).toMatchObject({
      description: 'D',
      dueDate: '2026-12-01',
    })
  })

  it('SCRUM-1-AC-08: known server field errors map inline, first message per field wins', () => {
    const error = new ApiError('validation', 400, 'Validation failed', [
      { field: 'title', message: 'must not be blank' },
      { field: 'title', message: 'second' },
      { field: 'dueDate', message: "Invalid value for field 'dueDate'" },
    ])
    expect(mapServerErrors(error)).toEqual({
      fields: { title: 'must not be blank', dueDate: "Invalid value for field 'dueDate'" },
    })
  })

  it('SCRUM-1-AC-08: unknown fields go to the form-level error alongside known ones', () => {
    const error = new ApiError('validation', 400, 'Validation failed', [
      { field: 'status', message: 'must not be null' },
      { field: 'priority', message: 'unknown' },
    ])
    expect(mapServerErrors(error)).toEqual({ fields: { status: 'must not be null' }, form: 'priority: unknown' })
  })

  it('SCRUM-1-AC-08: no known fields → form-level error using the response message', () => {
    expect(mapServerErrors(new ApiError('validation', 400, 'Malformed JSON request'))).toEqual({
      fields: {},
      form: 'Malformed JSON request',
    })
    expect(
      mapServerErrors(new ApiError('validation', 400, 'Validation failed', [{ field: 'page', message: 'bad' }])),
    ).toEqual({ fields: {}, form: 'Validation failed (page: bad)' })
  })
})
