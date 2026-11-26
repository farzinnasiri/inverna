/**
 * Japan's 72 microseasons (kō), each about five days long. The end painting
 * carries tonight's name: a reason to come back that's the season's, not a
 * streak's. Start dates follow the usual modern calendar and can shift by a
 * day from year to year; that's close enough for a line under a painting.
 *
 * Source: the traditional list as published by Nippon.com,
 * "Japan's 72 Microseasons".
 */
export interface Microseason {
  /** Month (1-12) and day the season starts. */
  month: number
  day: number
  kanji: string
  english: string
}

const KO: readonly [number, number, string, string][] = [
  [2, 4, '東風解凍', 'East wind melts the ice'],
  [2, 9, '黄鶯睍睆', 'Bush warblers sing in the mountains'],
  [2, 14, '魚上氷', 'Fish emerge from the ice'],
  [2, 19, '土脉潤起', 'Rain moistens the soil'],
  [2, 24, '霞始靆', 'Mist starts to linger'],
  [3, 1, '草木萌動', 'Grass sprouts, trees bud'],
  [3, 6, '蟄虫啓戸', 'Hibernating insects surface'],
  [3, 11, '桃始笑', 'First peach blossoms'],
  [3, 16, '菜虫化蝶', 'Caterpillars become butterflies'],
  [3, 21, '雀始巣', 'Sparrows start to nest'],
  [3, 26, '櫻始開', 'First cherry blossoms'],
  [3, 31, '雷乃発声', 'Distant thunder'],
  [4, 5, '玄鳥至', 'Swallows return'],
  [4, 10, '鴻雁北', 'Wild geese fly north'],
  [4, 15, '虹始見', 'First rainbows'],
  [4, 20, '葭始生', 'First reeds sprout'],
  [4, 25, '霜止出苗', 'Last frost, rice seedlings grow'],
  [4, 30, '牡丹華', 'Peonies bloom'],
  [5, 5, '蛙始鳴', 'Frogs start singing'],
  [5, 10, '蚯蚓出', 'Worms surface'],
  [5, 15, '竹笋生', 'Bamboo shoots sprout'],
  [5, 21, '蚕起食桑', 'Silkworms feast on mulberry leaves'],
  [5, 26, '紅花栄', 'Safflowers bloom'],
  [5, 31, '麦秋至', 'Wheat ripens'],
  [6, 6, '蟷螂生', 'Praying mantises hatch'],
  [6, 11, '腐草為螢', 'Rotten grass becomes fireflies'],
  [6, 16, '梅子黄', 'Plums turn yellow'],
  [6, 21, '乃東枯', 'Self-heal withers'],
  [6, 27, '菖蒲華', 'Irises bloom'],
  [7, 2, '半夏生', 'Crow-dipper sprouts'],
  [7, 7, '温風至', 'Warm winds blow'],
  [7, 12, '蓮始開', 'First lotus blossoms'],
  [7, 17, '鷹乃学習', 'Hawks learn to fly'],
  [7, 23, '桐始結花', 'Paulownia trees set seed'],
  [7, 29, '土潤溽暑', 'Earth is damp, air is humid'],
  [8, 3, '大雨時行', 'Great rains sometimes fall'],
  [8, 8, '涼風至', 'Cool winds blow'],
  [8, 13, '寒蝉鳴', 'Evening cicadas sing'],
  [8, 18, '蒙霧升降', 'Thick fog descends'],
  [8, 23, '綿柎開', 'Cotton flowers bloom'],
  [8, 28, '天地始粛', 'Heat starts to die down'],
  [9, 2, '禾乃登', 'Rice ripens'],
  [9, 8, '草露白', 'Dew glistens white on grass'],
  [9, 13, '鶺鴒鳴', 'Wagtails sing'],
  [9, 18, '玄鳥去', 'Swallows leave'],
  [9, 23, '雷乃収声', 'Thunder ceases'],
  [9, 28, '蟄虫坏戸', 'Insects hole up underground'],
  [10, 3, '水始涸', 'Farmers drain the fields'],
  [10, 8, '鴻雁来', 'Wild geese return'],
  [10, 13, '菊花開', 'Chrysanthemums bloom'],
  [10, 18, '蟋蟀在戸', 'Crickets chirp by the door'],
  [10, 23, '霜始降', 'First frost'],
  [10, 28, '霎時施', 'Light rains sometimes fall'],
  [11, 2, '楓蔦黄', 'Maple leaves and ivy turn yellow'],
  [11, 7, '山茶始開', 'Camellias bloom'],
  [11, 12, '地始凍', 'The land starts to freeze'],
  [11, 17, '金盞香', 'Daffodils bloom'],
  [11, 22, '虹蔵不見', 'Rainbows hide'],
  [11, 27, '朔風払葉', 'North wind blows the leaves from the trees'],
  [12, 2, '橘始黄', 'Tachibana citrus turns yellow'],
  [12, 7, '閉塞成冬', 'Cold sets in, winter begins'],
  [12, 12, '熊蟄穴', 'Bears start to hibernate'],
  [12, 16, '鱖魚群', 'Salmon gather and swim upstream'],
  [12, 21, '乃東生', 'Self-heal sprouts'],
  [12, 26, '麋角解', 'Deer shed their antlers'],
  [12, 31, '雪下出麦', 'Wheat sprouts under snow'],
  [1, 5, '芹乃栄', 'Parsley flourishes'],
  [1, 10, '水泉動', 'Springs thaw'],
  [1, 15, '雉始雊', 'Pheasants start to call'],
  [1, 20, '款冬華', 'Butterburs bud'],
  [1, 25, '水沢腹堅', 'Ice thickens on the streams'],
  [1, 30, '鶏始乳', 'Hens start laying eggs'],
]

export const MICROSEASONS: readonly Microseason[] = KO.map(([month, day, kanji, english]) => ({ month, day, kanji, english }))

/** Day of year (1-366) in a leap year, so Feb 29 has a place. */
function dayIndex(month: number, day: number): number {
  const before = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
  return before[month - 1]! + day
}

/** The microseason for a calendar date. */
export function microseasonFor(month: number, day: number): Microseason {
  const d = dayIndex(month, day)
  let best: Microseason | null = null
  let bestStart = -1
  for (const m of MICROSEASONS) {
    const start = dayIndex(m.month, m.day)
    if (start <= d && start > bestStart) {
      best = m
      bestStart = start
    }
  }
  // Before Jan 5: still the season that began on Dec 31.
  return best ?? MICROSEASONS.find((m) => m.month === 12 && m.day === 31)!
}
