import type { Outcome, Half } from '../types'

export type { Half }

export interface LiveState {
  outs: number
  first: number | null
  second: number | null
  third: number | null
  inning: number
  half: Half
}

export interface ApplyResult {
  state: LiveState
  runsScored: number[]
  halfInningEnded: boolean
}

export function applyOutcome(state: LiveState, batterId: number, outcome: Outcome): ApplyResult {
  let { outs } = state
  let first = state.first
  let second = state.second
  let third = state.third

  if (outcome === 'K' || outcome === 'GO' || outcome === 'PO') {
    outs += 1
    const ended = outs >= 3
    return {
      state: {
        ...state,
        outs: ended ? 0 : outs,
        first: ended ? null : first,
        second: ended ? null : second,
        third: ended ? null : third,
      },
      runsScored: [],
      halfInningEnded: ended,
    }
  }

  if (outcome === 'HR') {
    const scored: number[] = []
    if (third !== null) scored.push(third)
    if (second !== null) scored.push(second)
    if (first !== null) scored.push(first)
    scored.push(batterId)
    return {
      state: { ...state, outs, first: null, second: null, third: null },
      runsScored: scored,
      halfInningEnded: false,
    }
  }

  if (outcome === 'BB' || outcome === 'HBP') {
    const scored: number[] = []
    // Force-advance only: chain from 3rd down, only if 1st is occupied
    if (first !== null && second !== null && third !== null) {
      scored.push(third)
      third = second
      second = first
      first = batterId
    } else if (first !== null && second !== null) {
      third = second
      second = first
      first = batterId
    } else if (first !== null) {
      second = first
      first = batterId
    } else {
      first = batterId
    }
    return {
      state: { ...state, outs, first, second, third },
      runsScored: scored,
      halfInningEnded: false,
    }
  }

  // Hits: 1B, 2B, 3B — all runners advance exactly N bases
  const n = outcome === '1B' ? 1 : outcome === '2B' ? 2 : 3
  const scored: number[] = []
  let newFirst: number | null = null
  let newSecond: number | null = null
  let newThird: number | null = null

  function advance(runner: number | null, fromBase: number): void {
    if (runner === null) return
    const to = fromBase + n
    if (to > 3) scored.push(runner)
    else if (to === 3) newThird = runner
    else if (to === 2) newSecond = runner
    else newFirst = runner
  }

  advance(third, 3)
  advance(second, 2)
  advance(first, 1)

  if (n === 1) newFirst = batterId
  else if (n === 2) newSecond = batterId
  else newThird = batterId

  return {
    state: { ...state, outs, first: newFirst, second: newSecond, third: newThird },
    runsScored: scored,
    halfInningEnded: false,
  }
}
