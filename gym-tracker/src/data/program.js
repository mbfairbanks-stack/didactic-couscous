// Exercise "type" determines what each set logs:
//   'weight' -> weight (lb) + reps
//   'time'   -> seconds
//   'reps'   -> reps only (bodyweight)
//   'cardio' -> level + distance (optional `variants` gives a machine picker)
//
// Exercise ids are stable across workouts so shared exercises (e.g. the
// Romanian deadlift in both A and C, or Plank in A and C) build one
// continuous history for "last time" lookups and progress charts.

export const PROGRAM = {
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
      { id: 'cable_face_pulls', name: 'Cable face pulls', sets: 2, targetLabel: '15', type: 'weight' },
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
      { id: 'assisted_pullup_latpulldown', name: 'Assisted pull-ups / lat pulldown', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'machine_chest_press', name: 'Machine chest press', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'db_rdl', name: 'Dumbbell Romanian deadlift', sets: 3, targetLabel: '10', type: 'weight' },
      { id: 'db_bicep_curl', name: 'Dumbbell bicep curls', sets: 2, targetLabel: '12', type: 'weight' },
      { id: 'rope_tricep_pushdown', name: 'Rope triceps pushdowns', sets: 2, targetLabel: '12', type: 'weight' },
      { id: 'plank', name: 'Plank', sets: 3, targetLabel: '45-60 sec', type: 'time' },
    ],
  },
}

export const WORKOUT_KEYS = ['A', 'B', 'C']

// All distinct exercises across the whole program, for the Progress picker.
// When an id repeats (db_rdl, plank) keep the first definition's name.
export function getAllExercises() {
  const seen = new Map()
  for (const key of WORKOUT_KEYS) {
    for (const ex of PROGRAM[key].exercises) {
      if (!seen.has(ex.id)) seen.set(ex.id, ex)
    }
  }
  return Array.from(seen.values())
}

export function getTodaysWorkoutKey(date = new Date()) {
  const day = date.getDay()
  for (const key of WORKOUT_KEYS) {
    if (PROGRAM[key].dayOfWeek === day) return key
  }
  return null
}
