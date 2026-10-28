/**
 * Bar chats: patrons standing, sitting or resting near each other anywhere on
 * the map pair up and talk, one line at a time, shown as a speech line over
 * the speaker. A chat ends when they drift apart or one of them leaves.
 * The boss (USER_AVATAR_NAME) has their own lines for the crew, agents included.
 *
 * Pure bookkeeping over Character objects; OfficeState decides who may talk
 * and calls updateChats every frame.
 */
import {
  CHAT_COOLDOWN_MAX_SEC,
  CHAT_COOLDOWN_MIN_SEC,
  CHAT_KEEP_RANGE_TILES,
  CHAT_LINE_MAX_SEC,
  CHAT_LINE_MIN_SEC,
  CHAT_PAIR_RANGE_TILES,
  CHAT_SEC_PER_CHAR,
  USER_AVATAR_NAME,
} from '../../constants.js';
import type { Character } from '../types.js';
import { CharacterState } from '../types.js';

/** Lines alternate: first speaker, second speaker, first, ... */
const DIALOGUES: readonly (readonly string[])[] = [
  ['Hôm nay mệt ghê...', 'Ngồi xuống làm ly bia đi!', 'Ý hay đó 🍺'],
  ['Tối nay ai rank không?', 'Tui đang chuỗi thua 5 trận 😭', 'Thôi nghỉ một hôm đi'],
  ['Bia ở đây ngon thật', 'Bartender mới pha đó', 'Mai quay lại nữa!'],
  ['Deadline xong chưa?', 'Còn bug cuối cùng...', 'Câu đó tui nghe 3 lần rồi 😂'],
  ['Cuối tuần đi đâu chơi?', 'Đi biển không?', 'Chốt! Rủ thêm cả nhóm'],
  ['Sofa này êm thật', 'Ngồi là không muốn dậy', 'Ngủ luôn ở đây cũng được'],
  ['Xem phim mới chưa?', 'Chưa, có spoil không?', 'Không nói đâu 🤐'],
  ['Đói quá...', 'Gọi pizza không?', 'Gọi 2 cái cho chắc!'],
  ['Trận vừa rồi gánh team mệt xỉu', 'Lại được MVP hả?', 'Tất nhiên 😎'],
  ['Dạo này code nhiều quá', 'Để AI làm hộ đi', 'Nó đang làm đó, tui ngồi chơi'],
  ['Trời mưa rồi kìa', 'Ở lại uống thêm ly nữa', 'Hợp lý!'],
  ['Cạn ly nào!', 'Dô!! 🍻'],
  ['Nay uống nước lọc thôi 💧', 'Bia để mai nha', 'Healthy ghê!'],
  ['Merge conflict 40 file 😵', 'Ai rebase vậy trời', 'Không phải tui!', 'Chắc chắn là ông 🤨'],
  ['Test pass hết rồi!', 'Chạy lại lần nữa coi', '...Fail 1 cái 🥲'],
  ['Hôm qua deploy thứ 6 đó', 'Gan dữ vậy?', 'Tới giờ vẫn chưa ai gọi, chắc ổn 🙏'],
  ['Cà phê hay trà sữa?', 'Trà sữa full topping!', 'Đường 100% luôn hả?', 'Sống mà 😋'],
  ['Mai họp mấy giờ?', '9h sáng...', 'Thôi xong, tối nay khỏi thức khuya'],
  ['Thấy con mèo ngoài cửa không?', 'Dễ thương ghê 🐱', 'Đem vào nuôi đi!'],
  ['Laptop tui kêu như máy bay ✈️', 'Mở 80 tab Chrome chứ gì', 'Sao biết hay vậy 😳'],
  ['Lương về chưa?', 'Về rồi... đi rồi 💸', 'Nhanh dữ'],
  ['Ăn trưa gì đây?', 'Cơm tấm!', 'Hôm qua cơm tấm rồi', 'Thì nay cơm tấm sườn bì 😆'],
  ['Hát karaoke không?', 'Tui hát dở lắm', 'Ai cũng dở, quan trọng là vui 🎤'],
  ['Mới đọc xong cuốn sách hay lắm', 'Sách gì?', 'Docs của framework mới 🤓', '...Nghỉ chơi'],
  ['Dạo này có tập gym không?', 'Có, tập nâng ly 🍺', 'Cơ bắp tay chắc to lắm'],
  ['Trời nóng quá ☀️', 'Bật điều hoà 18 độ đi', 'Rồi lát lại kêu lạnh'],
  ['Ê, tối nay có bóng đá ⚽', 'Đội nào đá?', 'Không biết, cứ xem đã'],
  ['Tui mới học nấu ăn đó', 'Nấu được món gì?', 'Mì gói... có trứng 🍳', 'Ghê, đầu bếp rồi'],
  ['Chụp tấm ảnh không?', 'Đợi tui chỉnh tóc', 'Lâu quá trời 📸'],
  ['Hôm nay ai trực?', 'Không phải tui', 'Cũng không phải tui', 'Vậy là... cả hai 😅'],
];

/** The boss doing the rounds, opening every time. */
const BOSS_DIALOGUES: readonly (readonly string[])[] = [
  ['Làm tới đâu rồi em?', 'Sắp xong rồi sếp!', 'Sắp là bao lâu? 🤨', 'Dạ... 5 phút nữa ạ'],
  ['Hôm nay ổn không?', 'Ổn sếp ơi 💪', 'Tốt, cố lên nhé!'],
  ['Bug hôm qua fix chưa?', 'Fix rồi sếp, mà ra bug mới 😅', 'Haizz, từ từ làm'],
  ['Nghỉ tay uống nước đi', 'Dạ cảm ơn sếp 💧', 'Đừng ngồi lì quá đó'],
  [
    'Tối nay team đi ăn nhé, sếp bao!',
    'Thật hả sếp?! 🎉',
    'Thật, nhưng làm xong task đã',
    'Dạ làm liền!',
  ],
  ['Code này ai viết vậy?', 'Dạ... AI viết ạ', 'Thế ai review?', 'Dạ... cũng AI 😬'],
  ['Thấy em làm chăm quá', 'Dạ được sếp khen là vui rồi', 'Cuối tháng có thưởng 😉'],
  ['Hôm nay có deploy không?', 'Dạ chiều nay ạ', 'Nhớ test kỹ, đừng deploy thứ 6 nha'],
  ['Mọi người cần gì cứ nói', 'Cần thêm màn hình sếp ơi 🖥️', 'Ok, ghi vào danh sách'],
  ['Sao mặt buồn vậy?', 'Pipeline đỏ lòm sếp ơi 🔴', 'Bình tĩnh, đọc log từ từ'],
  ['Đừng quên commit nha', 'Dạ commit rồi', 'Push chưa?', '...Dạ push liền 🏃'],
  ['Ăn trưa chưa?', 'Chưa sếp, đang dở tay', 'Ăn đi rồi làm, sức khoẻ là trên hết'],
  ['Ý tưởng mới đó, làm thử xem', 'Khó quá sếp ơi', 'Khó mới vui 😎'],
  ['Tuần này team làm tốt lắm', 'Nhờ sếp dẫn dắt đó 😁', 'Nịnh quá, nhưng sếp thích'],
  ['Em ngủ gật đó hả?', 'Dạ đâu có, em đang suy nghĩ...', 'Suy nghĩ mà ngáy à 😂'],
];

/** Pair-specific chats, by CHARACTER_NAMES entry (either order; pair[0] opens). */
const PAIR_DIALOGUES: readonly { pair: readonly [string, string]; lines: readonly string[] }[] = [
  {
    pair: ['Naruto', 'Hinata'],
    lines: ['Hinata, ăn ramen không?', 'D-dạ... Naruto-kun mời ạ? 😳', 'Tất nhiên rồi, dattebayo!'],
  },
  {
    pair: ['Gray', 'Juvia'],
    lines: ['Juvia, đừng nhìn tui hoài vậy', 'Gray-sama đẹp trai quá mà~ 💕', 'Haizz...'],
  },
  {
    pair: ['Gojo', 'Nanami'],
    lines: ['Nanami, tăng ca không?', 'Hết giờ làm rồi. Không.', 'Chán ghê 😝'],
  },
  {
    pair: ['Kakashi', 'Naruto'],
    lines: ['Thầy lại đến muộn!', 'Thầy lạc đường trên con đường đời...', 'Lại câu đó!'],
  },
  { pair: ['Nezuko', 'Giyu'], lines: ['Mmm! 🎋', '...', 'Mmm mmm!'] },
  {
    pair: ['Zoro', 'Gojo'],
    lines: ['Quầy bar ở hướng nào?', 'Ngay sau lưng anh đó', '...Biết rồi!'],
  },
  {
    pair: ['Gray', 'Naruto'],
    lines: ['Ê Naruto, mặc áo vào đi', 'Ông mới là người cởi áo đó!', '...Ủa áo tui đâu rồi? 😳'],
  },
  {
    pair: ['Hinata', 'Juvia'],
    lines: [
      'Juvia ơi, làm sao để tỏ tình?',
      'Cứ bám theo người ta là được~ 💧',
      'Hình như không đúng lắm...',
    ],
  },
  {
    pair: ['Kakashi', 'Gojo'],
    lines: ['Bịt mắt vậy sao thấy đường?', 'Câu đó tui hỏi anh mới đúng 😎', '...Hoà'],
  },
  {
    pair: ['Zoro', 'Dolia'],
    lines: [
      'Cho hỏi nhà vệ sinh ở đâu?',
      'Anh vừa đi qua 3 lần rồi đó',
      'Nó tự chạy chỗ khác đấy!',
    ],
  },
  {
    pair: ['TNhunn', 'Zoro'],
    lines: [
      'Zoro, sao em lại ở phòng game?',
      'Em định về bàn mà sếp...',
      'Bàn em ở hướng ngược lại 😑',
    ],
  },
  {
    pair: ['TNhunn', 'Gojo'],
    lines: [
      'Gojo, task hôm qua sao rồi?',
      'Dễ ợt sếp, tui mạnh nhất mà 😎',
      'Mạnh nhất thì làm thêm 2 task nữa',
    ],
  },
  {
    pair: ['TNhunn', 'Nanami'],
    lines: [
      'Nanami, ở lại tăng ca chút nhé?',
      'Hết giờ rồi sếp.',
      'Có trả lương OT...',
      '...Bao nhiêu ạ?',
    ],
  },
  {
    pair: ['TNhunn', 'Kakashi'],
    lines: [
      'Kakashi, sao lại đi muộn?',
      'Dạ có bà cụ cần qua đường...',
      'Lý do này sếp nghe 10 lần rồi 🙄',
    ],
  },
  {
    pair: ['TNhunn', 'Naruto'],
    lines: [
      'Naruto, hôm nay năng lượng ghê',
      'Em sẽ trở thành sếp, dattebayo!',
      'Haha, cố lên, ghế này còn lâu 😏',
    ],
  },
];

export interface BarChat {
  speakers: [Character, Character];
  lines: readonly string[];
  index: number;
  /** Seconds left on the current line. */
  timer: number;
}

function lineSec(text: string): number {
  return Math.min(CHAT_LINE_MAX_SEC, Math.max(CHAT_LINE_MIN_SEC, text.length * CHAT_SEC_PER_CHAR));
}

function randomOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** What two characters talk about, and the name of whoever opens (null: either). */
function pickLines(
  nameA: string | null,
  nameB: string | null,
): { lines: readonly string[]; opener: string | null } {
  const special = PAIR_DIALOGUES.find(
    ({ pair }) =>
      (pair[0] === nameA && pair[1] === nameB) || (pair[0] === nameB && pair[1] === nameA),
  );
  if (special && Math.random() < 0.6) {
    // Their own chat, opened by whoever the script starts with
    return { lines: special.lines, opener: special.pair[0] };
  }
  if (nameA === USER_AVATAR_NAME || nameB === USER_AVATAR_NAME) {
    return { lines: randomOf(BOSS_DIALOGUES), opener: USER_AVATAR_NAME };
  }
  return { lines: randomOf(DIALOGUES), opener: null };
}

function endChat(chat: BarChat): void {
  for (const ch of chat.speakers) {
    ch.speech = null;
    ch.chatCooldown =
      CHAT_COOLDOWN_MIN_SEC + Math.random() * (CHAT_COOLDOWN_MAX_SEC - CHAT_COOLDOWN_MIN_SEC);
  }
}

function tilesApart(a: Character, b: Character): number {
  return Math.abs(a.tileCol - b.tileCol) + Math.abs(a.tileRow - b.tileRow);
}

/** Advance running chats, end those whose speakers left or drifted apart, and
 *  pair up idle talkers standing close together (nearest first; never
 *  mid-walk). `canPair` limits who may start a chat with whom. Returns the
 *  chats still running. */
export function updateChats(
  chats: BarChat[],
  talkers: Character[],
  nameOf: (ch: Character) => string | null,
  dt: number,
  canPair: (a: Character, b: Character) => boolean = () => true,
): BarChat[] {
  const present = new Set(talkers);
  const running: BarChat[] = [];
  for (const chat of chats) {
    const [a, b] = chat.speakers;
    if (!present.has(a) || !present.has(b) || tilesApart(a, b) > CHAT_KEEP_RANGE_TILES) {
      endChat(chat);
      continue;
    }
    chat.timer -= dt;
    if (chat.timer <= 0) {
      chat.index++;
      if (chat.index >= chat.lines.length) {
        endChat(chat);
        continue;
      }
      chat.timer = lineSec(chat.lines[chat.index]);
    }
    const speaker = chat.speakers[chat.index % 2];
    for (const s of chat.speakers) s.speech = s === speaker ? chat.lines[chat.index] : null;
    running.push(chat);
  }

  const busy = new Set(running.flatMap((c) => c.speakers));
  for (const ch of talkers) {
    if (!busy.has(ch)) {
      ch.speech = null;
      ch.chatCooldown = Math.max(0, (ch.chatCooldown ?? 0) - dt);
    }
  }
  const free = talkers.filter(
    (ch) => !busy.has(ch) && (ch.chatCooldown ?? 0) === 0 && ch.state !== CharacterState.WALK,
  );
  while (free.length >= 2) {
    const a = free.shift()!;
    const b = free
      .filter((x) => canPair(a, x))
      .sort((x, y) => tilesApart(x, a) - tilesApart(y, a))[0];
    if (!b || tilesApart(b, a) > CHAT_PAIR_RANGE_TILES) continue;
    free.splice(free.indexOf(b), 1);
    const nameA = nameOf(a);
    const { lines, opener } = pickLines(nameA, nameOf(b));
    // A script that names who opens it: make that character the first speaker
    const speakers: [Character, Character] = opener && opener !== nameA ? [b, a] : [a, b];
    running.push(startChat(speakers, lines));
  }
  return running;
}

/** A chat with a set script, `speakers[0]` saying the first line now. */
export function startChat(speakers: [Character, Character], lines: readonly string[]): BarChat {
  speakers[0].speech = lines[0];
  return { speakers, lines, index: 0, timer: lineSec(lines[0]) };
}
