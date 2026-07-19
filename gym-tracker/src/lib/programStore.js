import { DEFAULT_PROGRAM, WORKOUT_KEYS } from '../data/program'

const KEY = 'gym-tracker:program:v1'

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_PROGRAM))
}

function looksValid(p) {
  return p && WORKOUT_KEYS.every((k) => p[k] && Array.isArray(p[k].exercises))
}

export function loadProgram() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return cloneDefault()
    const parsed = JSON.parse(raw)
    return looksValid(parsed) ? parsed : cloneDefault()
  } catch {
    return cloneDefault()
  }
}

export function saveProgram(program) {
  localStorage.setItem(KEY, JSON.stringify(program))
  return program
}

export function resetProgram() {
  localStorage.removeItem(KEY)
  return cloneDefault()
}
