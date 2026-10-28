/**
 * The bar's waiter (WAITER_NAME): never a customer. Waits at the counter,
 * carries a drink to someone seated in the bar or playing in the game room,
 * has a word with them, and heads back for the next round.
 *
 * Pure helpers; OfficeState holds the round and drives it every frame.
 */
import type { Character } from '../types.js';
import { CharacterState, Direction } from '../types.js';

export interface WaiterRound {
  phase: 'pause' | 'toCustomer' | 'serving' | 'toCounter';
  /** Seconds left in `pause` / `serving`. */
  timer: number;
  customer: Character | null;
  /** Which way to face the customer on arrival. */
  face: Direction;
}

export function newWaiterRound(pauseSec: number): WaiterRound {
  return { phase: 'pause', timer: pauseSec, customer: null, face: Direction.DOWN };
}

/** Waiter opens, the customer answers (lines alternate). */
const BAR_SERVICE: readonly (readonly string[])[] = [
  ['Bia của mình đây ạ! 🍺', 'Cảm ơn em nha!'],
  ['Thêm đá không ạ?', 'Cho thêm ít đá nhé', 'Có ngay ạ! 🧊'],
  ['Hôm nay có mực nướng ngon lắm ạ', 'Cho một đĩa đi em!', 'Dạ, 5 phút có liền!'],
  ['Ly này quán mời ạ 🎁', 'Ôi, chu đáo quá!'],
  ['Mình dùng thêm gì không ạ?', 'Thêm 1 ly nữa em ơi', 'Dạ có ngay! 🍻'],
  ['Ly lạnh lắm, cẩn thận nha', 'Mát ghê, đúng lúc quá'],
  ['Em dọn ly cũ nhé', 'Ừ, cảm ơn em'],
  ['Bia tươi mới về đó ạ, thử không?', 'Thử luôn!', 'Ngon lắm đó ạ 😋'],
  ['Đậu phộng rang cho mình nè 🥜', 'Đúng món khoái khẩu!'],
  ['Nước lọc cho mình đỡ say nha 💧', 'Em tâm lý ghê'],
  ['Hôm nay làm việc mệt không ạ?', 'Mệt, nhưng có bia là hết mệt', 'Vậy em rót thêm nha 🍺'],
];
const GAME_SERVICE: readonly (readonly string[])[] = [
  ['Nước tăng lực cho game thủ đây ạ! ⚡', 'Đúng lúc quá, đang combat!'],
  ['Thắng mấy trận rồi ạ?', 'Thua 3 thắng 1 😭', 'Uống ly này lấy hên nha!'],
  ['Snack đây ạ, đừng để dính phím nha 🍿', 'Haha, cảm ơn em'],
  ['Em đứng xem chút được không?', 'Được, coi anh gánh team nè 😎', 'Ghê quá!'],
  ['Trà sữa cho mình nè 🧋', 'Ngon! Ghi sổ giùm nhé'],
  ['Máy có lag không ạ?', 'Mượt lắm em', 'Dạ, có gì cứ gọi em nha'],
  ['Mì ly nóng hổi đây ạ 🍜', 'Đói muốn xỉu, cảm ơn em!'],
  ['Chơi lâu rồi, nghỉ mắt chút nha', 'Một trận nữa thôi...', 'Câu này em nghe hoài 😆'],
];

function randomOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** What the waiter says at the table: drinks in the bar, snacks at the gaming PCs. */
export function serviceLines(customer: Character): readonly string[] {
  return randomOf(customer.state === CharacterState.GAME ? GAME_SERVICE : BAR_SERVICE);
}

/** Someone the waiter can serve: seated with a drink, or playing at a gaming PC. */
export function isServable(ch: Character): boolean {
  return (ch.state === CharacterState.TYPE || ch.state === CharacterState.GAME) && !ch.matrixEffect;
}

/** The tiles next to a customer, with the direction that faces them. */
export function serveSpots(
  customer: Character,
): Array<{ col: number; row: number; face: Direction }> {
  const { tileCol: col, tileRow: row } = customer;
  return [
    { col, row: row + 1, face: Direction.UP },
    { col: col - 1, row, face: Direction.RIGHT },
    { col: col + 1, row, face: Direction.LEFT },
    { col, row: row - 1, face: Direction.DOWN },
  ];
}
