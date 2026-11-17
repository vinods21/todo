import { act, screen, waitFor } from '@testing-library/react'
import { seedManyTasks, seedTasks } from './test/handlers'
import { currentPath, renderApp } from './test/renderApp'

describe('SCRUM-1 routing', () => {
  it('SCRUM-1-AC-12: "/" renders the task list on direct entry', async () => {
    renderApp('/')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
  })

  it('SCRUM-1-AC-12: "/tasks/new" renders the create form on direct entry (refresh)', () => {
    renderApp('/tasks/new')
    expect(screen.getByRole('heading', { name: 'New task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create task' })).toBeInTheDocument()
  })

  it('SCRUM-1-AC-12: "/tasks/:id/edit" renders the edit form on direct entry (refresh)', async () => {
    seedTasks([{ title: 'Deep link' }])
    renderApp('/tasks/1/edit')
    expect(screen.getByRole('heading', { name: 'Edit task' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Title')).toHaveValue('Deep link')
  })

  it('SCRUM-1-AC-12: browser Back from the create form returns to the list', async () => {
    const { user, router } = renderApp('/')
    await screen.findByText('No tasks yet.')
    await user.click(screen.getByRole('link', { name: 'New task' }))
    expect(screen.getByRole('heading', { name: 'New task' })).toBeInTheDocument()
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(currentPath(router)).toBe('/')
  })

  it('SCRUM-1-AC-12: the list page survives re-entry via ?page', async () => {
    seedManyTasks(30)
    renderApp('/?page=2')
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('SCRUM-1-AC-12: unknown paths render "Page not found" with a link to the list', () => {
    renderApp('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to tasks' })).toHaveAttribute('href', '/')
  })

  it('SCRUM-1-AC-12, SCRUM-1-NFR-09: the layout shows the app name, New task link and build footer', () => {
    renderApp('/nope')
    expect(screen.getByRole('link', { name: 'Todo' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'New task' })).toHaveAttribute('href', '/tasks/new')
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`${__JIRA_KEY__} ·`)
  })
})

describe('SCRUM-6 routing', () => {
  it('SCRUM-6-AC-13: Back and Forward restore the previous and next filter', async () => {
    seedTasks([
      { title: 'Open', status: 'TODO' },
      { title: 'Finished', status: 'DONE' },
    ])
    const { user, router } = renderApp('/')
    await screen.findByRole('combobox', { name: 'Status for Open' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Done')
    expect(currentPath(router)).toBe('/?status=DONE')
    await screen.findByRole('combobox', { name: 'Status for Finished' })

    await act(() => router.navigate(-1))
    expect(currentPath(router)).toBe('/')
    expect(await screen.findByRole('combobox', { name: 'Status for Open' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('All')

    await act(() => router.navigate(1))
    expect(currentPath(router)).toBe('/?status=DONE')
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Status for Open' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Done')
    expect(await screen.findByRole('combobox', { name: 'Status for Finished' })).toBeInTheDocument()
  })
})
