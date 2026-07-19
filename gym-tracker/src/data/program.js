// Exercise "type" determines what each set logs:
//   'weight' -> weight (lb) + reps
//   'time'   -> seconds
//   'reps'   -> reps only (bodyweight)
//   'cardio' -> level + distance (optional `variants` gives a machine picker)
//
// Exercise ids are stable across workouts so shared exercises (e.g. the
// Romanian deadlift in both A and C, or Plank in A and C) build one
// continuous history for "last time" lookups and progress charts.
//
// A "choice slot" is an item with an `options` array instead of being a single
// exercise: `{ id: 'slot-key', label, options: [ex, ex] }`. You pick which
// option you did that day; only the chosen option is logged, under its OWN id,
// so each alternative keeps its own separate history and metric. The slot `id`
// is only used for UI state — it is never stored on a session.

// The seed program. The active program lives in localStorage (see
// lib/programStore.js) and can be edited in the app; this is what a fresh
// install starts from and what "Reset to default" restores.
export const DEFAULT_PROGRAM = {
  A: {
    key: 'A',
    name: 'Workout A',
    dayOfWeek: 2, // Tuesday (0 = Sunday)
    exercises: [
      { id: 'elliptical', name: 'Elliptical bike (warm-up)', sets: 1, targetLabel: '15 min', type: 'cardio' },
      { id: 'goblet_squat', name: 'Goblet squats', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'db_bench_press', name: 'Dumbbell bench press', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'lat_pulldown', name: 'Lat pulldown', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'db_rdl', name: 'Dumbbell Romanian deadlift', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'seated_shoulder_press', name: 'Seated shoulder press', sets: 3, targetLabel: '12', type: 'weight' },
      { id: 'plank', name: 'Plank', sets: 3, targetLabel: '30-45 sec', type: 'time' },
    ],
  },
  B: {
    key: 'B',
    name: 'Workout B',
    dayOfWeek: 4, // Thursday
    exercises: [
      { id: 'stairmaster', name: 'Stairmaster (warm-up)', sets: 1, targetLabel: '15 min', type: 'cardio' },
      { id: 'leg_press', name: 'Leg press', sets: 3, targetLabel: '12', type: 'weight' },
      { id: 'seated_cable_row', name: 'Seated cable row', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'incline_db_press', name: 'Incline dumbbell press', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'walking_lunges', name: 'Walking lunges', sets: 2, targetLabel: '10 per leg', type: 'weight' },
      { id: 'reverse_pec_deck', name: 'Reverse pec deck (rear delt fly)', sets: 2, targetLabel: '15', type: 'weight' },
      { id: 'dead_bugs', name: 'Dead bugs', sets: 3, targetLabel: '10 per side', type: 'reps' },
    ],
  },
  C: {
    key: 'C',
    name: 'Workout C',
    dayOfWeek: 6, // Saturday
    exercises: [
      { id: 'row_or_jog', name: 'Row / Jog (warm-up)', sets: 1, targetLabel: '15 min', type: 'cardio', variants: ['Row', 'Jog'] },
      { id: 'smith_squat', name: 'Smith machine squats', sets: 3, targetLabel: '10', type: 'weight' },
      {
        id: 'c_pull',
        label: 'Pull',
        options: [
          { id: 'assisted_pullup', name: 'Assisted pull-ups', sets: 3, targetLabel: '8-10', type: 'reps' },
          { id: 'lat_pulldown', name: 'Lat pulldown', sets: 3, targetLabel: '10', type: 'weight' },
        ],
      },
      {
        id: 'c_press',
        label: 'Chest press',
        options: [
          { id: 'machine_chest_press', name: 'Machine chest press', sets: 3, targetLabel: '10', type: 'weight' },
          { id: 'barbell_bench_press', name: 'Barbell bench press', sets: 3, targetLabel: '10', type: 'weight' },
        ],
      },
      {
        id: 'c_hinge',
        label: 'Hinge / legs',
        options: [
          { id: 'db_rdl', name: 'Dumbbell Romanian deadlift', sets: 3, targetLabel: '10', type: 'weight' },
          { id: 'leg_press', name: 'Leg press', sets: 3, targetLabel: '12', type: 'weight' },
        ],
      },
      { id: 'db_bicep_curl', name: 'Dumbbell bicep curls', sets: 2, targetLabel: '12', type: 'weight' },
      { id: 'rope_tricep_pushdown', name: 'Rope triceps pushdowns', sets: 2, targetLabel: '12', type: 'weight' },
      { id: 'plank', name: 'Plank', sets: 3, targetLabel: '45-60 sec', type: 'time' },
    ],
  },
}

export const WORKOUT_KEYS = ['A', 'B', 'C']

export function isChoice(item) {
  return Array.isArray(item.options)
}

// The concrete exercises a program item represents: itself, or all of a choice
// slot's options.
export function itemExercises(item) {
  return isChoice(item) ? item.options : [item]
}

// All distinct exercises across the whole program (choice options included),
// for the Progress picker. When an id repeats (db_rdl, lat_pulldown, plank)
// keep the first definition's name.
export function getAllExercises(program) {
  const seen = new Map()
  for (const key of WORKOUT_KEYS) {
    for (const item of program[key].exercises) {
      for (const ex of itemExercises(item)) {
        if (!seen.has(ex.id)) seen.set(ex.id, ex)
      }
    }
  }
  return Array.from(seen.values())
}

export function getTodaysWorkoutKey(program, date = new Date()) {
  const day = date.getDay()
  for (const key of WORKOUT_KEYS) {
    if (program[key].dayOfWeek === day) return key
  }
  return null
}
