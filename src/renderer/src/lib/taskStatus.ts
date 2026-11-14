/** Kit pill tone (`vg-pill--<tone>`) for a production task status. */
export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'gray'

export function taskStatusTone(status?: string | null): StatusTone {
  switch (String(status || '')) {
    case 'done':
    case 'success':
    case 'completed':
      return 'green'
    case 'running':
    case 'processing':
      return 'blue'
    case 'paused':
    case 'queued':
    case 'pending':
      return 'amber'
    case 'error':
    case 'failed':
    case 'canceled':
    case 'cancelled':
      return 'red'
    default:
      return 'gray'
  }
}
