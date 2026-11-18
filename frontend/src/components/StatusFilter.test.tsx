import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskStatus } from '../api/types'
import { StatusFilter } from './StatusFilter'

function setup(value: TaskStatus | undefined) {
  const onChange = vi.fn<(status: TaskStatus | undefined) => void>()
  const user = userEvent.setup()
  const view = render(<StatusFilter value={value} onChange={onChange} />)
  const select = screen.getByRole('combobox', { name: 'Status' })
  return { onChange, user, select, ...view }
}

describe('SCRUM-7 StatusFilter', () => {
  it('SCRUM-7-AC-16: a combobox named Status offers All and the three labelled statuses', () => {
    const { select } = setup(undefined)
    const options = within(select).getAllByRole('option') as HTMLOptionElement[]
    expect(options.map((o) => o.textContent)).toEqual(['All', 'To do', 'In progress', 'Done'])
    expect(options.map((o) => o.value)).toEqual(['', 'TODO', 'IN_PROGRESS', 'DONE'])
  })

  it('SCRUM-7-AC-16: an undefined value selects All', () => {
    setup(undefined)
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('All')
  })

  it('SCRUM-7-AC-16: DONE selects Done', () => {
    const { select } = setup('DONE')
    expect(select).toHaveValue('DONE')
    expect(select).toHaveDisplayValue('Done')
  })

  it('SCRUM-7-AC-16: choosing a status calls back with it; choosing All calls back with undefined', async () => {
    const { user, select, onChange } = setup('DONE')
    await user.selectOptions(select, 'In progress')
    await user.selectOptions(select, 'All')
    expect(onChange.mock.calls).toEqual([['IN_PROGRESS'], [undefined]])
  })

  it('SCRUM-7-AC-16: it is controlled — a new value prop updates the selection', () => {
    const { select, rerender, onChange } = setup('TODO')
    expect(select).toHaveValue('TODO')
    rerender(<StatusFilter value="IN_PROGRESS" onChange={onChange} />)
    expect(select).toHaveValue('IN_PROGRESS')
    rerender(<StatusFilter value={undefined} onChange={onChange} />)
    expect(select).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()
  })
})
