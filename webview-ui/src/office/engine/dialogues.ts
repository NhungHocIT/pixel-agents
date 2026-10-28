/**
 * Every line the characters say, by where they are when they say it.
 * Chats alternate: first speaker, second speaker, first, ...
 *
 *   BAR      — sitting or standing in the bar (drinks, food, work talk)
 *   GAME     — in the game room / at a gaming PC
 *   SOFA     — on the lounge sofa
 *   STREET   — two people bumping into each other on the way somewhere
 *   EXERCISE — the exercise break (coach calls and the line's replies)
 *   BOSS     — the boss (USER_AVATAR_NAME) doing the rounds; the boss opens
 *   PAIR     — storyline pairs, by name (pair[0] opens)
 *   WAITER   — the waiter at a customer's table, bar or game room
 */

export type ChatPlace = 'bar' | 'game' | 'sofa' | 'street';

type Script = readonly string[];

// ── Quán bia ─────────────────────────────────────────────────
const BAR: readonly Script[] = [
  ['Hôm nay mệt ghê...', 'Ngồi xuống làm ly bia đi!', 'Ý hay đó 🍺'],
  ['Bia ở đây ngon thật', 'Bartender mới pha đó', 'Mai quay lại nữa!'],
  ['Trời mưa rồi kìa', 'Ở lại uống thêm ly nữa', 'Hợp lý!'],
  ['Cạn ly nào!', 'Dô!! 🍻'],
  ['Một hai ba, dô!', 'Hai ba uống! 🍻', 'Cạn sạch luôn!'],
  ['Nay uống nước lọc thôi 💧', 'Bia để mai nha', 'Healthy ghê!'],
  ['Ly thứ mấy rồi đó?', 'Mới ly thứ 2... hay thứ 5 ta 🤔', 'Thôi về sớm đi!'],
  ['Bia hơi hay bia chai?', 'Bia hơi cho mát!', 'Chuẩn, thêm đĩa lạc nữa 🥜'],
  ['Dạo này có tập gym không?', 'Có, tập nâng ly 🍺', 'Cơ bắp tay chắc to lắm'],
  ['Đói quá...', 'Gọi pizza không?', 'Gọi 2 cái cho chắc!'],
  ['Ê, tối nay có bóng đá ⚽', 'Đội nào đá?', 'Không biết, cứ xem đã'],
  ['Hát karaoke không?', 'Tui hát dở lắm', 'Ai cũng dở, quan trọng là vui 🎤'],
  ['Quán đông ghê hôm nay', 'Cuối tuần mà', 'Tèo chạy bàn muốn xỉu luôn'],
  [
    'Kể chuyện vui nghe coi',
    'Hôm qua tui fix bug trong 5 phút',
    'Rồi sao?',
    'Tạo thêm 3 bug mới 😂',
  ],
  ['Deadline xong chưa?', 'Còn bug cuối cùng...', 'Câu đó tui nghe 3 lần rồi 😂'],
  ['Dạo này code nhiều quá', 'Để AI làm hộ đi', 'Nó đang làm đó, tui ngồi chơi'],
  ['Merge conflict 40 file 😵', 'Ai rebase vậy trời', 'Không phải tui!', 'Chắc chắn là ông 🤨'],
  ['Test pass hết rồi!', 'Chạy lại lần nữa coi', '...Fail 1 cái 🥲'],
  ['Hôm qua deploy thứ 6 đó', 'Gan dữ vậy?', 'Tới giờ vẫn chưa ai gọi, chắc ổn 🙏'],
  ['Mai họp mấy giờ?', '9h sáng...', 'Thôi xong, tối nay khỏi thức khuya'],
  ['Laptop tui kêu như máy bay ✈️', 'Mở 80 tab Chrome chứ gì', 'Sao biết hay vậy 😳'],
  ['Hôm nay ai trực?', 'Không phải tui', 'Cũng không phải tui', 'Vậy là... cả hai 😅'],
  ['Lương về chưa?', 'Về rồi... đi rồi 💸', 'Nhanh dữ'],
  ['Cuối tuần đi đâu chơi?', 'Đi biển không?', 'Chốt! Rủ thêm cả nhóm'],
  ['Cà phê hay trà sữa?', 'Trà sữa full topping!', 'Đường 100% luôn hả?', 'Sống mà 😋'],
  ['Tui mới học nấu ăn đó', 'Nấu được món gì?', 'Mì gói... có trứng 🍳', 'Ghê, đầu bếp rồi'],
  ['Chụp tấm ảnh không?', 'Đợi tui chỉnh tóc', 'Lâu quá trời 📸'],
];

// ── Phòng chơi game ──────────────────────────────────────────
const GAME: readonly Script[] = [
  ['Tối nay ai rank không?', 'Tui đang chuỗi thua 5 trận 😭', 'Thôi nghỉ một hôm đi'],
  ['Trận vừa rồi gánh team mệt xỉu', 'Lại được MVP hả?', 'Tất nhiên 😎'],
  ['Vào trận chung không?', 'Đợi tui hết trận này', 'Nhanh lên, sắp hết giờ rồi!'],
  ['Ai cướp mạng của tui vậy?!', 'Đâu có, tui chỉ KS nhẹ thôi 😇', 'Chính nó!'],
  ['Ping cao quá, lag muốn xỉu', 'Ai đang tải phim đó!', 'Không phải tui 🙈'],
  ['Combo vừa rồi đỉnh chưa?', 'Đỉnh! Quay lại chưa?', 'Quên bấm quay rồi 😭'],
  ['Leo rank tới đâu rồi?', 'Vẫn kẹt ở Bạc...', 'Tui Bạc 4 năm rồi, bình thường 😌'],
  ['Đừng chỉ đạo nữa, để tui tự chơi', 'Tui chỉ góp ý thôi mà 🤷', 'Góp ý 30 lần rồi đó'],
  ['GG, ván này thua rồi', 'Chưa đâu, còn lật kèo!', '...Nhà chính nổ rồi 💥'],
  ['Bàn phím này gõ sướng ghê', 'Phím cơ switch xanh đó', 'Ồn muốn điếc luôn 😆'],
  ['Chơi thêm ván nữa thôi', 'Câu này ông nói 5 ván trước rồi', 'Ván này là thật 😤'],
  ['Mắt tui mỏi quá', 'Nghỉ chút, nhìn ra cửa sổ đi', 'Cửa sổ nào, toàn màn hình 🖥️'],
];

// ── Ghế sofa ─────────────────────────────────────────────────
const SOFA: readonly Script[] = [
  ['Sofa này êm thật', 'Ngồi là không muốn dậy', 'Ngủ luôn ở đây cũng được'],
  ['Xem phim mới chưa?', 'Chưa, có spoil không?', 'Không nói đâu 🤐'],
  ['Ngồi đây ngắm mưa thích ghê', 'Thêm ly trà nóng là đủ ☕'],
  ['Lấy giùm cái gối với', 'Gối nào? Tui ôm hết rồi 😴'],
  ['Mới đọc xong cuốn sách hay lắm', 'Sách gì?', 'Docs của framework mới 🤓', '...Nghỉ chơi'],
  ['Cho tui ngả lưng 5 phút', '5 phút của ông là 2 tiếng đó', 'Lần này thật mà 😪'],
  ['Trái cây trên bàn ăn được không?', 'Ăn đi, Tèo mới mang ra', 'Ngọt ghê 🍉'],
  ['Kể chuyện ma nghe không?', 'Thôi, tối về sợ lắm 👻', 'Nhát quá vậy'],
  ['Thấy con mèo ngoài cửa không?', 'Dễ thương ghê 🐱', 'Đem vào nuôi đi!'],
  ['Trời nóng quá ☀️', 'Bật điều hoà 18 độ đi', 'Rồi lát lại kêu lạnh'],
  ['Uống miếng nước cho tỉnh 💧', 'Nước ở đây mát ghê', 'Tèo mới thay đá đó'],
];

// ── Gặp nhau trên đường ──────────────────────────────────────
const STREET: readonly Script[] = [
  ['Ê, chào nha! 👋', 'Chào! Đi đâu đó?'],
  ['Ủa, lại gặp nữa hả?', 'Duyên ghê 😆'],
  ['Đi đâu vội vậy?', 'Về bàn làm việc, trễ rồi!', 'Đi cẩn thận!'],
  ['Tránh đường với, tui đang gấp!', 'Ok ok, mời đi trước 🙇'],
  ['Hello! Khoẻ không?', 'Khoẻ, còn bạn?', 'Tạm ổn 👍'],
  ['Đi lấy nước hả?', 'Ừ, khát quá', 'Lấy giùm tui ly với!'],
  ['Ơ, đường này đi đâu vậy?', 'Đi lạc nữa rồi hả 😂'],
  ['Hey, high five! ✋', 'Bốp! ✋'],
  ['Ăn trưa chưa?', 'Chưa, đi chung không?', 'Ok, đợi tui chút!'],
  ['Ê, tối nay đi bia không?', 'Đi chứ! 🍺'],
  ['Ui, suýt đụng nhau 😅', 'Xin lỗi nha, tui không để ý'],
];

// ── Tập thể dục ──────────────────────────────────────────────
export type ExerciseMoveName = 'jump' | 'twist' | 'squat' | 'march';

export const EXERCISE = {
  /** The coach, while everyone walks to the line. */
  gatherCalls: [
    'Tới giờ tập thể dục rồi mọi người ơi! 💪',
    'Đứng dậy nào, xếp hàng ngay ngắn!',
    'Rời bàn phím 10 phút thôi, nhanh lên!',
    'Ai chậm nhất tối nay rửa ly nhé 😏',
  ],
  gatherReplies: [
    'Lại tới giờ rồi à 😩',
    'Đợi em save file đã!',
    'Vừa ngồi xuống mà...',
    'Ok sếp, ra liền!',
    'Tập xong được nghỉ không sếp?',
    'Yay, giãn gân cốt thôi 🙆',
  ],
  /** The coach, calling the move being done. */
  moveCalls: {
    jump: ['Bật nhảy! Một, hai, ba, bốn!', 'Cao lên nữa nào! 🦘', 'Nhảy dứt khoát, đừng lười!'],
    twist: [
      'Vặn hông sang trái... sang phải!',
      'Xoay người hết cỡ nào!',
      'Thả lỏng vai, xoay đều!',
    ],
    squat: ['Squat xuống... đứng lên!', 'Lưng thẳng, hạ thấp nữa!', 'Thêm 10 cái nữa thôi 🔥'],
    march: [
      'Giậm chân tại chỗ... một, hai!',
      'Nâng gối cao lên!',
      'Đều chân nào, một hai một hai!',
    ],
  } satisfies Record<ExerciseMoveName, readonly string[]>,
  workoutReplies: [
    'Mỏi chân quá sếp ơi 🥵',
    'Hít thở đều nào...',
    'Một, hai, ba, bốn!',
    'Ngồi code cả ngày, giờ mới thấy lưng 😵',
    'Sướng ghê, tỉnh cả người!',
    'Còn bao lâu nữa vậy sếp?',
    'Tập xong uống bia được không? 🍺',
    'Mai em đau cơ chắc luôn',
    'Sếp tập cùng đi chứ!',
    'Cố lên, sắp xong rồi! 💪',
    'Mồ hôi ướt hết áo rồi 💦',
    'Em thấy khoẻ ra hẳn!',
  ],
  /** The coach, in the last few seconds. */
  finish: 'Tốt lắm! Uống nước rồi về làm việc nhé 👏',
} as const;

// ── Sếp đi kiểm tra ──────────────────────────────────────────
const BOSS: readonly Script[] = [
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

/** The boss in the game room: business talk can wait. */
const BOSS_GAME: readonly Script[] = [
  ['Giờ nghỉ mà, chơi thoải mái đi', 'Sếp vào chơi chung không?', 'Để sếp gánh cho 😎'],
  ['Thắng chưa?', 'Dạ thua sấp mặt sếp ơi 😭', 'Thôi, mai làm việc gỡ lại'],
  ['Chơi xong nhớ quay lại làm nha', 'Dạ một ván nữa thôi ạ', 'Một ván thôi đó 🤨'],
];

// ── Cặp nhân vật riêng ───────────────────────────────────────
const PAIR: readonly { pair: readonly [string, string]; lines: Script }[] = [
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

// ── Tèo phục vụ ──────────────────────────────────────────────
// Tèo opens; the customer's lines (every second one) are only orders and
// service requests — nobody makes small talk with the waiter.
const WAITER_BAR: readonly Script[] = [
  ['Mình dùng gì ạ?', 'Cho 1 ly bia hơi', 'Dạ có ngay ạ! 🍺'],
  ['Bia của mình đây ạ! 🍺', 'Thêm ít đá giúp mình', 'Dạ, em mang ra liền 🧊'],
  ['Hôm nay có mực nướng ạ', 'Cho một đĩa mực nướng', 'Dạ, 5 phút có liền!'],
  ['Mình gọi thêm gì không ạ?', 'Thêm 2 ly nữa nhé', 'Dạ có ngay! 🍻'],
  ['Dạ, mình cần gì ạ?', 'Cho xin đĩa đậu phộng 🥜', 'Dạ, có liền ạ'],
  ['Em dọn ly cũ nhé', 'Lau bàn giúp mình luôn', 'Dạ được ạ'],
  ['Dạ, mình gọi em ạ?', 'Cho 1 chai nước suối 💧', 'Dạ, em lấy ngay'],
  ['Món mình đây ạ', 'Cho thêm chén nước chấm', 'Dạ, có ngay ạ'],
  ['Mình dùng thêm gì không ạ?', 'Tính tiền giúp mình', 'Dạ, em mang hoá đơn ra ạ 🧾'],
  ['Dạ, mình cần gì ạ?', 'Cho mình xin thực đơn', 'Dạ, thực đơn đây ạ 📋'],
  ['Bia tươi mới về đó ạ', 'Cho thử 1 ly', 'Dạ, em rót liền 🍺'],
];
const WAITER_GAME: readonly Script[] = [
  ['Mình dùng gì ạ?', 'Cho 1 lon nước tăng lực ⚡', 'Dạ có ngay ạ!'],
  ['Dạ, mình cần gì ạ?', 'Cho 1 gói snack 🍿', 'Dạ, em mang tới liền'],
  ['Mình gọi thêm gì không ạ?', 'Cho 1 ly trà sữa 🧋', 'Dạ, trà sữa có ngay'],
  ['Dạ, mình gọi em ạ?', 'Pha giúp mình ly mì 🍜', 'Dạ, 3 phút có liền ạ'],
  ['Dạ, máy có vấn đề gì ạ?', 'Đổi giúp mình tai nghe khác 🎧', 'Dạ, em lấy cái mới ngay'],
  ['Mình cần gì ạ?', 'Thêm giờ chơi giúp mình', 'Dạ, em gia hạn rồi ạ'],
  ['Nước của mình đây ạ', 'Thêm 1 chai nước lọc nữa', 'Dạ có ngay ạ 💧'],
  ['Dạ, mình gọi em ạ?', 'Lau bàn phím giúp mình', 'Dạ, em lau liền ạ'],
];
const WAITER_SOFA: readonly Script[] = [
  ['Mình dùng gì ạ?', 'Cho 1 đĩa trái cây 🍎', 'Dạ, em gọt liền ạ'],
  ['Dạ, mình cần gì ạ?', 'Cho thêm 1 cái gối', 'Dạ, gối đây ạ'],
  ['Mình gọi thêm gì không ạ?', 'Cho 1 ấm trà nóng ☕', 'Dạ, có ngay ạ'],
  ['Dạ, mình gọi em ạ?', 'Thêm nước vào ly giúp mình 💧', 'Dạ, em rót liền'],
];

export function randomOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

const BY_PLACE: Record<ChatPlace, readonly Script[]> = {
  bar: BAR,
  game: GAME,
  sofa: SOFA,
  street: STREET,
};

/** What two characters talk about here, and the name of whoever opens (null: either).
 *  On the way somewhere it's always a quick hello; elsewhere storyline pairs
 *  have their own chats, and the boss talks shop (or games, in the game room). */
export function pickDialogue(
  nameA: string | null,
  nameB: string | null,
  place: ChatPlace,
  bossName: string,
): { lines: Script; opener: string | null } {
  if (place === 'street') return { lines: randomOf(STREET), opener: null };
  const special = PAIR.find(
    ({ pair }) =>
      (pair[0] === nameA && pair[1] === nameB) || (pair[0] === nameB && pair[1] === nameA),
  );
  if (special && Math.random() < 0.6) return { lines: special.lines, opener: special.pair[0] };
  if (nameA === bossName || nameB === bossName) {
    return { lines: randomOf(place === 'game' ? BOSS_GAME : BOSS), opener: bossName };
  }
  return { lines: randomOf(BY_PLACE[place]), opener: null };
}

/** The waiter at a customer's side: drinks in the bar, snacks in the game room, fruit on the sofa. */
export function waiterDialogue(place: ChatPlace): Script {
  return randomOf(place === 'game' ? WAITER_GAME : place === 'sofa' ? WAITER_SOFA : WAITER_BAR);
}
