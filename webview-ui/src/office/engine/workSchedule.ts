import {
  BREAK_END_MIN,
  BREAK_START_MIN,
  LUNCH_END_MIN,
  LUNCH_MEAL_MIN,
  LUNCH_START_MIN,
  WORK_END_MIN,
  WORK_START_MIN,
} from '../../constants.js';

/** Where the day is at:
 *  work — everyone in the game room, at a computer or on the sofa;
 *  lunch — everyone at the bar, eating;
 *  free — lunch eaten, the afternoon break, or outside the working day. */
export type DayPhase = 'work' | 'lunch' | 'free';

export function dayPhaseAt(date: Date): DayPhase {
  const min = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  if (min < WORK_START_MIN || min >= WORK_END_MIN) return 'free';
  if (min >= LUNCH_START_MIN && min < LUNCH_START_MIN + LUNCH_MEAL_MIN) return 'lunch';
  if (min >= LUNCH_START_MIN && min < LUNCH_END_MIN) return 'free';
  if (min >= BREAK_START_MIN && min < BREAK_END_MIN) return 'free';
  return 'work';
}
