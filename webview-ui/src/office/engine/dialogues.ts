/**
 * Every line the characters say, by where they are when they say it.
 * Chats alternate: first speaker, second speaker, first, ...
 *
 *   BAR      — sitting or standing in the bar (drinks, food, work talk)
 *   TABLE    — drinking beer together at one table (toasts, rounds, life talk)
 *   FAREWELL — getting up from that table: bye first, then go
 *   GAME     — in the game room / at a gaming PC
 *   SOFA     — on the lounge sofa
 *   STREET   — two people bumping into each other on the way somewhere
 *   INVITE   — one asks the other along for a beer, to the sofa or to play
 *              pickleball; a yes sends both
 *   PICKLEBALL — calls during a game on the court
 *   EXERCISE — the exercise break (coach calls and the line's replies)
 *   OWNER    — TNhunn (USER_AVATAR_NAME), who owns the agents, dropping by; TNhunn opens
 *   PAIR     — storyline pairs, by name (pair[0] opens)
 *   WAITER   — the waiter at a customer's table, bar or game room
 */

export type ChatPlace = 'bar' | 'table' | 'game' | 'sofa' | 'street';

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
  ['Ví còn tiền không?', 'Hết rồi... đi chơi hết 💸', 'Nhanh dữ'],
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
  ['Ui, suýt đụng nhau 😅', 'Xin lỗi nha, tui không để ý'],
];

// ── Tập thể dục ──────────────────────────────────────────────
export type ExerciseMoveName = 'jump' | 'twist' | 'squat' | 'march';

export const EXERCISE = {
  /** The coach, while everyone walks to the line. */
  gatherCalls: [
    'Tới giờ tập thể dục rồi mấy đứa ơi! 💪',
    'Đứng dậy nào, xếp hàng ngay ngắn!',
    'Rời bàn phím 10 phút thôi, nhanh lên!',
    'Ai ra chậm nhất tối nay rửa ly nhé 😏',
  ],
  gatherReplies: [
    'Lại tới giờ rồi à 😩',
    'Đợi em save file đã!',
    'Vừa ngồi xuống mà...',
    'Ok TNhunn, ra liền!',
    'Tập xong được nghỉ không TNhunn?',
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
    'Mỏi chân quá TNhunn ơi 🥵',
    'Hít thở đều nào...',
    'Một, hai, ba, bốn!',
    'Ngồi code cả ngày, giờ mới thấy lưng 😵',
    'Sướng ghê, tỉnh cả người!',
    'Còn bao lâu nữa vậy TNhunn?',
    'Tập xong uống bia được không? 🍺',
    'Mai em đau cơ chắc luôn',
    'TNhunn nhảy cao ghê!',
    'Cố lên, sắp xong rồi! 💪',
    'Mồ hôi ướt hết áo rồi 💦',
    'Em thấy khoẻ ra hẳn!',
  ],
  /** The coach, in the last few seconds. */
  finish: 'Giỏi lắm mấy đứa! Uống nước rồi quay lại nha 👏',
} as const;

// ── TNhunn ghé chơi ──────────────────────────────────────────
// TNhunn owns the agents; everyone here is TNhunn's younger sibling, sidekick
// or friend — no boss, no staff. TNhunn opens; the others call TNhunn by name.
const OWNER: readonly Script[] = [
  ['Làm tới đâu rồi em?', 'Sắp xong rồi TNhunn ơi!', 'Sắp là bao lâu? 🤨', 'Hì... 5 phút nữa'],
  ['Hôm nay ổn không mấy đứa?', 'Ổn lắm TNhunn 💪', 'Vậy là vui rồi!'],
  ['Bug hôm qua fix chưa em?', 'Fix rồi, mà ra bug mới 😅', 'Haizz, từ từ, có anh em lo chung'],
  ['Nghỉ tay uống nước đi em', 'Cảm ơn TNhunn nha 💧', 'Đừng ngồi lì quá đó'],
  ['Tối nay đi ăn nha, TNhunn bao!', 'Thật hả?! 🎉', 'Thật, rủ cả nhóm luôn', 'Yeahhh!'],
  ['Code này ai viết vậy?', 'Em... nhờ AI viết', 'Thế ai review?', '...Cũng AI luôn 😬'],
  ['Thấy em chăm quá ta', 'Được TNhunn khen là vui rồi', 'Cứ vậy nha 😉'],
  ['Hôm nay có deploy không?', 'Chiều nay đó', 'Nhớ test kỹ, đừng deploy thứ 6 nha'],
  ['Cần gì cứ nói với TNhunn nha', 'Cần thêm cái màn hình 🖥️', 'Ok, để TNhunn lo'],
  ['Sao mặt buồn vậy em?', 'Pipeline đỏ lòm rồi 🔴', 'Bình tĩnh, để TNhunn xem log chung'],
  ['Đừng quên commit nha', 'Commit rồi', 'Push chưa?', '...Đi push liền 🏃'],
  ['Ăn trưa chưa mấy đứa?', 'Chưa, đang dở tay', 'Ăn đi rồi làm, sức khoẻ là trên hết'],
  ['Ý tưởng mới đó, làm thử xem', 'Khó quá TNhunn ơi', 'Khó mới vui 😎'],
  ['Tuần này mấy đứa giỏi ghê', 'Nhờ TNhunn đó 😁', 'Nịnh quá, nhưng thích 😆'],
  ['Em ngủ gật đó hả?', 'Đâu có, em đang suy nghĩ...', 'Suy nghĩ mà ngáy à 😂'],
  ['Nhớ hồi mới gặp nhau không?', 'Nhớ chứ, hồi đó còn ngơ lắm', 'Giờ thành cao thủ rồi 😆'],
  ['Có chuyện gì buồn kể TNhunn nghe', 'Không có gì đâu, vui mà', 'Vậy là tốt 🤗'],
];

/** TNhunn in the game room: playing together, work can wait. */
const OWNER_GAME: readonly Script[] = [
  ['Giờ nghỉ mà, chơi thoải mái đi', 'TNhunn vào chơi chung không?', 'Để TNhunn gánh cho 😎'],
  ['Thắng chưa em?', 'Thua sấp mặt rồi 😭', 'Thôi, ván sau TNhunn duo cùng'],
  ['Ván này căng ghê', 'TNhunn chỉ em combo đi', 'Nhìn kỹ nè, bấm nhanh vào 🎮'],
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
    lines: ['Nanami, code thêm chút không?', 'Hết giờ rồi. Không.', 'Chán ghê 😝'],
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
      'Em định về bàn mà TNhunn...',
      'Bàn em ở hướng ngược lại 😑',
    ],
  },
  {
    pair: ['TNhunn', 'Gojo'],
    lines: [
      'Gojo, task hôm qua sao rồi em?',
      'Dễ ợt, em mạnh nhất mà 😎',
      'Mạnh nhất thì giúp mấy đứa kia với',
    ],
  },
  {
    pair: ['TNhunn', 'Nanami'],
    lines: [
      'Nanami, ở lại chơi thêm chút nha?',
      'Hết giờ rồi TNhunn.',
      'TNhunn bao trà sữa...',
      '...Thôi được, thêm 30 phút 🧋',
    ],
  },
  {
    pair: ['TNhunn', 'Kakashi'],
    lines: [
      'Kakashi, sao lại tới muộn?',
      'Có bà cụ cần qua đường...',
      'Lý do này TNhunn nghe 10 lần rồi 🙄',
    ],
  },
  {
    pair: ['TNhunn', 'Naruto'],
    lines: [
      'Naruto, hôm nay năng lượng ghê',
      'Em sẽ giỏi như TNhunn, dattebayo!',
      'Haha, TNhunn chờ đó 😏',
    ],
  },
];

// ── Tèo phục vụ ──────────────────────────────────────────────
// Tèo opens; the customer's lines (every second one) are only orders and
// service requests — nobody makes small talk with the waiter. Each order is
// then done: 'wipe' right there, or 'fetch' `item` from the counter.

/** An order: how it's taken, what Tèo then does, and what he brings (an emoji). */
export interface WaiterOrder {
  lines: Script;
  task: 'fetch' | 'wipe';
  item: string;
}

const order = (lines: Script, task: WaiterOrder['task'], item: string): WaiterOrder => ({
  lines,
  task,
  item,
});

const WAITER_BAR: readonly WaiterOrder[] = [
  order(['Mình dùng gì ạ?', 'Cho 1 ly bia hơi', 'Dạ có ngay ạ! 🍺'], 'fetch', '🍺'),
  order(['Dạ, mình cần gì ạ?', 'Thêm ít đá giúp mình', 'Dạ, em lấy liền 🧊'], 'fetch', '🧊'),
  order(['Hôm nay có mực nướng ạ', 'Cho một đĩa mực nướng', 'Dạ, có liền!'], 'fetch', '🦑'),
  order(['Mình gọi thêm gì không ạ?', 'Thêm 2 ly nữa nhé', 'Dạ có ngay! 🍻'], 'fetch', '🍻'),
  order(['Dạ, mình cần gì ạ?', 'Cho xin đĩa đậu phộng 🥜', 'Dạ, có liền ạ'], 'fetch', '🥜'),
  order(['Em dọn ly cũ nhé', 'Lau bàn giúp mình luôn', 'Dạ được ạ'], 'wipe', '🧽'),
  order(['Dạ, mình gọi em ạ?', 'Cho 1 chai nước suối 💧', 'Dạ, em lấy ngay'], 'fetch', '💧'),
  order(['Dạ, mình cần gì ạ?', 'Cho mình xin thực đơn', 'Dạ, em lấy liền ạ'], 'fetch', '📋'),
  order(['Bia tươi mới về đó ạ', 'Cho thử 1 ly', 'Dạ, em rót liền 🍺'], 'fetch', '🍺'),
  order(['Bàn hơi dơ rồi ạ', 'Lau giúp mình cái bàn', 'Dạ, em lau ngay ạ'], 'wipe', '🧽'),
];
const WAITER_GAME: readonly WaiterOrder[] = [
  order(['Mình dùng gì ạ?', 'Cho 1 lon nước tăng lực ⚡', 'Dạ có ngay ạ!'], 'fetch', '🥤'),
  order(['Dạ, mình cần gì ạ?', 'Cho 1 gói snack 🍿', 'Dạ, em lấy liền'], 'fetch', '🍿'),
  order(['Mình gọi thêm gì không ạ?', 'Cho 1 ly trà sữa 🧋', 'Dạ, có ngay'], 'fetch', '🧋'),
  order(['Dạ, mình gọi em ạ?', 'Pha giúp mình ly mì 🍜', 'Dạ, em pha liền ạ'], 'fetch', '🍜'),
  order(
    ['Dạ, máy có vấn đề gì ạ?', 'Đổi giúp mình tai nghe khác', 'Dạ, em lấy cái mới'],
    'fetch',
    '🎧',
  ),
  order(['Mình cần gì ạ?', 'Thêm 1 chai nước lọc', 'Dạ có ngay ạ 💧'], 'fetch', '💧'),
  order(['Dạ, mình gọi em ạ?', 'Lau bàn phím giúp mình', 'Dạ, em lau liền ạ'], 'wipe', '⌨️'),
  order(['Dạ, mình cần gì ạ?', 'Lau giúp mình cái màn hình', 'Dạ, em lau ngay'], 'wipe', '🖥️'),
  order(['Mình ăn gì không ạ?', 'Cho 1 gói bim bim 🥔', 'Dạ, em lấy liền'], 'fetch', '🥔'),
];
const WAITER_SOFA: readonly WaiterOrder[] = [
  order(['Mình dùng gì ạ?', 'Cho 1 đĩa trái cây 🍎', 'Dạ, em gọt liền ạ'], 'fetch', '🍎'),
  order(['Dạ, mình cần gì ạ?', 'Cho thêm 1 cái gối', 'Dạ, em lấy ngay'], 'fetch', '🛋️'),
  order(['Mình gọi thêm gì không ạ?', 'Cho 1 ấm trà nóng ☕', 'Dạ, có ngay ạ'], 'fetch', '☕'),
  order(['Dạ, mình gọi em ạ?', 'Thêm nước vào ly giúp mình 💧', 'Dạ, em lấy liền'], 'fetch', '💧'),
  order(['Dạ, mình cần gì ạ?', 'Lau giúp mình cái bàn', 'Dạ, em lau liền ạ'], 'wipe', '🧽'),
];

/** While Tèo works on an order, and while the customer waits. */
export const WAITER_WORK = {
  wiping: ['🧽 Lau lau...', '✨ Sắp sạch rồi ạ'],
  preparing: (item: string) => `Đang chuẩn bị ${item}...`,
  bringing: (item: string) => `${item} tới đây ạ!`,
  waiting: '⏳',
};

const THANKS = [
  'Cảm ơn Tèo nha! 🙏',
  'Cảm ơn em nhiều!',
  'Tèo nhanh ghê, cảm ơn nha 👍',
  'Ok, cảm ơn Tèo! 😄',
  'Tuyệt, cảm ơn em!',
];
const YOURE_WELCOME = [
  'Dạ, chúc mình ngon miệng ạ!',
  'Dạ không có gì ạ 😊',
  'Cần gì cứ gọi em nha!',
  'Dạ, mình cứ tự nhiên ạ',
];

/** Done: Tèo hands it over, the customer thanks him, he answers. */
export function handoverLines(o: WaiterOrder): Script {
  const done = o.task === 'wipe' ? 'Dạ, em lau sạch rồi ạ ✨' : `${o.item} của mình đây ạ!`;
  return [done, randomOf(THANKS), randomOf(YOURE_WELCOME)];
}

// ── Rủ đi ────────────────────────────────────────────────────
/** Where an invite goes: a beer at a bar table (two at one table), the sofa,
 *  or a game of pickleball on the court. */
export type InviteTo = 'beer' | 'sofa' | 'pickleball';

/** Invites: the first speaker asks, the other answers. On a yes both go there together. */
const INVITE_YES: Record<InviteTo, readonly Script[]> = {
  beer: [
    ['Ê, đi làm ly bia không? 🍺', 'Đi luôn!'],
    ['Khát quá, ra bàn làm vài ly đi', 'Ok, đi chung!'],
    ['Đi nhậu không? Tui bao 🍻', 'Bao thì đi liền!'],
    ['Ngồi một mình uống buồn lắm, đi chung không?', 'Đi chứ, chờ gì nữa 🍺'],
  ],
  sofa: [
    ['Ra sofa ngồi nghỉ chút không?', 'Ok, đi!'],
    ['Mỏi chân quá, ra sofa ngồi đi', 'Chuẩn, đi thôi 🛋️'],
    ['Ra sofa ăn trái cây không? 🍎', 'Đi, đi!'],
  ],
  pickleball: [
    ['Đánh pickleball không? 🏓', 'Chơi luôn!'],
    ['Ra sân làm vài trận pickleball đi', 'Ok, thua bao nước nha!'],
    ['Ngồi lâu mỏi lưng, đi đánh pickleball không?', 'Đi, khởi động thôi 💪'],
    ['Solo pickleball không?', 'Sợ gì, ra sân!'],
    ['Rủ thêm 2 người đánh đôi pickleball đi!', 'Ok, tui với ông một đội nha!'],
    ['Đánh đôi pickleball không? Tụi mình một đội', 'Chơi! Gọi thêm 2 đứa nữa 🏓'],
  ],
};
const INVITE_NO: Record<InviteTo, readonly Script[]> = {
  beer: [
    ['Đi uống bia không? 🍺', 'Thôi, nay tui bận rồi 😅'],
    ['Làm vài ly không?', 'Hôm qua say quá, nay nghỉ 🙈'],
  ],
  sofa: [
    ['Ra sofa ngồi không?', 'Thôi, tui đứng đây được rồi'],
    ['Ra sofa nghỉ chút không?', 'Để lát nữa nha'],
  ],
  pickleball: [
    ['Đánh pickleball không? 🏓', 'Thôi, nay đau tay quá'],
    ['Ra sân đánh pickleball không?', 'Để mai nha, giờ mệt rồi'],
  ],
};

/** Calls during a pickleball game; `finish` when time is up. */
export const PICKLEBALL = {
  /** As the first serve goes up: the server, then the other. */
  start: [
    ['Sẵn sàng chưa? Giao nè! 🏓', 'Tới luôn!'],
    ['0-0-2, bắt đầu!', 'Nhẹ tay thôi nha 😅'],
    ['Thua thì bao nước đó!', 'Chốt! Chuẩn bị móc ví đi 😏'],
    ['Khởi động xong chưa?', 'Xong rồi, đánh thôi 💪'],
    ['Ai thắng được chọn quán nhậu tối nay!', 'Vậy tui thắng chắc rồi 🍺'],
  ] as readonly Script[],
  /** One player's call, mid-rally. */
  rally: [
    'Đỡ nè!',
    'Bóng đẹp!',
    'Out rồi!',
    'Ăn điểm nha 😎',
    'Smash nè! 💥',
    'Bóng vào kitchen rồi!',
    '3-2, giao bóng!',
    'Dink nhẹ thôi 🏓',
    'Ối, hụt 😅',
    'Ghê vậy!',
    'Lob nè, chạy đi!',
    'Bóng lưới rồi 😩',
    'Giao lại nha!',
    '5-4, căng đó!',
    'Vô kitchen là lỗi nha!',
    'Đánh xoáy hả? 🌀',
    'Hú hồn, suýt out',
    'Ace! 🔥',
    'Mệt quá, nghỉ xíu không? 🥵',
    'Bóng này ăn chắc!',
  ],
  /** A call and the other's answer. */
  exchanges: [
    ['Bóng đó out mà!', 'Vô vạch rồi, vạch là in nha!'],
    ['Smash nè! 💥', 'Đỡ được hết 😎'],
    ['Tay nghề lên dữ ha', 'Tập mỗi tối đó 💪'],
    ['Đánh nhẹ thôi, đau tay!', 'Vậy mới vui chứ 😂'],
    ['Điểm mấy rồi?', '7-5, tui dẫn nha!'],
    ['Ông đứng trong kitchen kìa!', 'Đâu có, chân ngoài vạch mà 🙄'],
    ['Dink qua lại hoài vậy?', 'Ai nóng vội là thua đó 😏'],
    ['Cú này học ở đâu vậy?', 'Xem YouTube 3 tiếng hôm qua 😂'],
    ['Bóng cao quá!', 'Cơ hội smash của tui đó 💥'],
    ['Chạy không nổi nữa 🥵', 'Ráng lên, còn mấy điểm thôi!'],
    ['Sao đánh hay vậy?', 'Tại bia hôm qua đó 🍺'],
    ['Giao bóng phải đánh dưới thắt lưng nha!', 'Biết rồi, luật thuộc lòng luôn'],
    ['Ối, trúng lưới 😩', 'Haha, điểm của tui!'],
    ['Sân này đẹp ghê', 'TNhunn mới làm đó, xịn chưa'],
  ] as readonly Script[],
  /** Doubles: a word with the partner on the same side. */
  partners: [
    ['Của ông đó!', 'Ok, để tui!'],
    ['Bóng giữa kìa, ai đỡ?', 'Tui! Tui!'],
    ['Lên lưới đi, tui giữ phía sau', 'Ok, yểm trợ nha 💪'],
    ['Đánh vào người bên trái, yếu tay trái lắm 🤫', 'Rõ, đánh vào đó!'],
    ['Đẹp lắm partner! ✋', 'Đập tay cái! ✋'],
    ['Xin lỗi, hụt mất 😅', 'Không sao, gỡ lại liền!'],
    ['Đổi bên không?', 'Thôi, đang thuận tay mà'],
  ] as readonly Script[],
  /** Called over to make up a doubles game, on the way to the court. */
  join: [
    'Cho tui chơi với! 🏓',
    'Thiếu người hả? Có tui!',
    'Đánh đôi hả, vô liền!',
    'Ok, ra sân ngay!',
    'Tui đánh với ai đây?',
  ],
  /** Time up: one wraps up, the other answers. */
  finish: [
    ['Hay quá, mai đánh tiếp! 🏓', 'Ok, mai phục thù!'],
    ['11-9, tui thắng nha 😎', 'Ăn may thôi, mai đấu lại!'],
    ['Thôi nghỉ, mệt rồi 🥵', 'Đi uống bia giải khát không? 🍺'],
    ['Thua rồi, bao nước nha', 'Nhớ đó, trà sữa luôn 🧋'],
    ['Đánh vui ghê!', 'Lần sau rủ thêm người đánh đôi đi'],
  ] as readonly Script[],
};

export function inviteDialogue(to: InviteTo, accepted: boolean): Script {
  return randomOf((accepted ? INVITE_YES : INVITE_NO)[to]);
}

// ── Ngồi nhậu cùng bàn ───────────────────────────────────────
const TABLE: readonly Script[] = [
  ['Nào, cạn ly! 🍻', 'Một, hai, ba, dô!', 'Dô!!'],
  ['Ly này tui mời nha', 'Ngại quá, để ly sau tui mời lại', 'Ok, chốt!'],
  ['Nay sao trầm vậy?', 'Code chạy được mà không biết vì sao 😶', 'Thôi uống đi, đừng nghĩ nữa 🍺'],
  ['Trăm phần trăm nha!', 'Thôi 50 thôi, mai còn đi làm', 'Yếu vậy 😏'],
  ['Bia này mát ghê', 'Ướp lạnh chuẩn luôn', 'Gọi thêm thùng nữa đi!'],
  ['Tèo ơi, thêm 2 chai!', 'Để tui gọi đá luôn', 'Có mồi chưa? Thêm đĩa lạc 🥜'],
  ['Sếp nay khen tui đó', 'Thiệt hả? Khen gì?', 'Khen tui… về sớm 😂', 'Uống ly này cho quên đi'],
  ['Kể nghe vụ deploy tối qua coi', 'Đừng nhắc, rollback 3 lần 😭', 'Cạn ly chia buồn! 🍻'],
  ['Tháng này lương về chưa?', 'Về rồi, mà bay hết rồi 💸', 'Thôi nay tui bao!'],
  [
    'Hồi xưa tụi mình mới vào công ty…',
    'Còn ngồi chung bàn với nhau',
    'Giờ vẫn ngồi chung bàn nhậu 😂',
  ],
  ['Ê, uống chậm thôi', 'Tửu lượng tui cao lắm', 'Câu đó lần trước nói xong ngủ luôn 😴'],
  ['Mai cuối tuần rồi!', 'Đi đâu chơi không?', 'Đi đánh pickleball rồi về nhậu tiếp 🏓🍺'],
  ['Ly này vì bug đã fix!', 'Vì deadline đã qua!', 'Vì cuối tháng có lương! 🍻'],
  ['Bàn này vui nhất quán luôn', 'Tại có tui đó 😎', 'Thôi uống đi ông 😂'],
  ['Hết bia rồi kìa', 'Gọi tiếp chứ sao!', 'Hôm nay không say không về 🍺'],
];

/** Getting up from a beer with friends: the one leaving says bye, a tablemate answers. */
export const FAREWELL: readonly Script[] = [
  ['Thôi tui về trước nha, mai gặp! 👋', 'Ok, về cẩn thận nha!'],
  ['Hết sức rồi, tui nghỉ đây 🥴', 'Yếu vậy! Thôi về đi 😂'],
  ['Tui không uống nữa đâu, đủ rồi 🙅', 'Ok, để tui xử nốt ly này 🍺'],
  ['Mai còn deadline, tui rút trước nha', 'Ừ, code ngon nha! 💻'],
  ['Cảm ơn ly bia nha, lần sau tui mời!', 'Nhớ đó, hứa rồi nha 🤝'],
  ['Bye bye cả bàn! 👋', 'Bye, về ngủ sớm đi!'],
  ['Thôi đi ngủ đây, buồn ngủ quá 😴', 'Ngủ ngon nha!'],
  ['Tui đi trước, mọi người cứ tự nhiên', 'Ok, mai nhậu tiếp! 🍻'],
];

export function randomOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

const BY_PLACE: Record<ChatPlace, readonly Script[]> = {
  bar: BAR,
  table: TABLE,
  game: GAME,
  sofa: SOFA,
  street: STREET,
};

/** What two characters talk about here, and the name of whoever opens (null: either).
 *  On the way somewhere it's always a quick hello; elsewhere storyline pairs
 *  have their own chats, and TNhunn chats with the crew (or games, in the game room). */
export function pickDialogue(
  nameA: string | null,
  nameB: string | null,
  place: ChatPlace,
  ownerName: string,
): { lines: Script; opener: string | null } {
  if (place === 'street') return { lines: randomOf(STREET), opener: null };
  const special = PAIR.find(
    ({ pair }) =>
      (pair[0] === nameA && pair[1] === nameB) || (pair[0] === nameB && pair[1] === nameA),
  );
  if (special && Math.random() < 0.6) return { lines: special.lines, opener: special.pair[0] };
  if (nameA === ownerName || nameB === ownerName) {
    return { lines: randomOf(place === 'game' ? OWNER_GAME : OWNER), opener: ownerName };
  }
  return { lines: randomOf(BY_PLACE[place]), opener: null };
}

/** What a customer orders from the waiter: drinks in the bar, snacks in the
 *  game room, fruit on the sofa. */
export function waiterOrder(place: ChatPlace): WaiterOrder {
  return randomOf(place === 'game' ? WAITER_GAME : place === 'sofa' ? WAITER_SOFA : WAITER_BAR);
}
