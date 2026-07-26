import type { AgentRunStatus, AgentStepStatus } from './types'

const runTransitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['waiting_approval', 'failed', 'cancelled'],
  waiting_approval: ['running', 'cancelled'],
  running: ['paused', 'reviewing', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  reviewing: ['running', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

const stepTransitions: Record<AgentStepStatus, AgentStepStatus[]> = {
  pending: ['ready', 'blocked', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['reviewing', 'failed', 'cancelled'],
  reviewing: ['ready', 'completed', 'failed', 'blocked', 'cancelled'],
  completed: [],
  failed: [],
  blocked: ['ready', 'cancelled'],
  skipped: [],
  cancelled: [],
}

export function assertRunTransition(from: AgentRunStatus, to: AgentRunStatus) {
  if (from === to) return
  if (!runTransitions[from].includes(to)) {
    throw new Error(`Invalid run status transition: ${from} -> ${to}`)
  }
}

export function assertStepTransition(from: AgentStepStatus, to: AgentStepStatus) {
  if (from === to) return
  if (!stepTransitions[from].includes(to)) {
    throw new Error(`Invalid step status transition: ${from} -> ${to}`)
  }
}

export function canRunTransition(from: AgentRunStatus, to: AgentRunStatus) {
  return from === to || runTransitions[from].includes(to)
}

export function canStepTransition(from: AgentStepStatus, to: AgentStepStatus) {
  return from === to || stepTransitions[from].includes(to)
}
