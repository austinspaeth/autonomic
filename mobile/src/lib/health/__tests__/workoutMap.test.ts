/**
 * Workout-type mapping: every imported workout must land on a real activity
 * type whose form can hold the imported fields — a key drifting out of the
 * registry would make the import card render a blank row and save an
 * unrenderable entry.
 */
import { activityTypeFromHc, activityTypeFromHk } from '../workoutMap';
import { ACTIVITY_TYPES } from '../../registry';

describe('activityTypeFromHk', () => {
  it('maps the common Apple Workout types', () => {
    expect(activityTypeFromHk(52, false)).toBe('walk');
    expect(activityTypeFromHk(37, false)).toBe('run');
    expect(activityTypeFromHk(24, false)).toBe('hike');
    expect(activityTypeFromHk(57, false)).toBe('yoga');
    expect(activityTypeFromHk(63, false)).toBe('hiit');
    expect(activityTypeFromHk(59, false)).toBe('coreWorkout');
  });
  it('splits cycling on the indoor flag', () => {
    expect(activityTypeFromHk(13, true)).toBe('indoorBike');
    expect(activityTypeFromHk(13, false)).toBe('cycle');
  });
  it('maps both strength variants to the merged type', () => {
    expect(activityTypeFromHk(50, false)).toBe('strength');
    expect(activityTypeFromHk(20, false)).toBe('strength');
  });
  it('falls back to the catch-all for unmapped sports', () => {
    expect(activityTypeFromHk(6, false)).toBe('otherExercise');  // basketball
    expect(activityTypeFromHk(3000, false)).toBe('otherExercise'); // other
  });
});

describe('activityTypeFromHc', () => {
  it('maps the common Health Connect types', () => {
    expect(activityTypeFromHc(79)).toBe('walk');
    expect(activityTypeFromHc(56)).toBe('run');
    expect(activityTypeFromHc(8)).toBe('cycle');
    expect(activityTypeFromHc(9)).toBe('indoorBike');
    expect(activityTypeFromHc(70)).toBe('strength');
  });
  it('falls back to the catch-all', () => {
    expect(activityTypeFromHc(5)).toBe('otherExercise'); // basketball
    expect(activityTypeFromHc(0)).toBe('otherExercise'); // OTHER_WORKOUT
  });
});

describe('mapping targets', () => {
  it('every mapped key exists in ACTIVITY_TYPES', () => {
    const hkTypes = [8, 11, 13, 14, 15, 16, 20, 24, 28, 29, 30, 33, 35, 37, 44, 46, 50, 52, 53, 57, 58, 59, 62, 63, 65, 66, 68, 69, 72, 73, 77, 78, 80, 3000];
    for (const t of hkTypes) {
      expect(ACTIVITY_TYPES[activityTypeFromHk(t, false)]).toBeDefined();
      expect(ACTIVITY_TYPES[activityTypeFromHk(t, true)]).toBeDefined();
    }
    for (let t = 0; t <= 83; t++) {
      expect(ACTIVITY_TYPES[activityTypeFromHc(t)]).toBeDefined();
    }
  });
});
