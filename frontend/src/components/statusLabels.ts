import type { TaskStatus } from '../api/types'

/** SCRUM-1-AC-01: human-readable status labels. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}
