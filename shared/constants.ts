// Panelin hem sunucu hem istemci tarafında kullandığı oyun tanımları.
// Metin2 tarzı item_proto yapısından esinlenilmiştir.

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const ITEM_TYPES = [
  { value: 'WEAPON', label: 'Silah' },
  { value: 'ARMOR', label: 'Zırh / Ekipman' },
  { value: 'COSTUME', label: 'Kostüm' },
  { value: 'BELT', label: 'Kemer' },
  { value: 'USE', label: 'Kullanılabilir' },
  { value: 'MATERIAL', label: 'Malzeme' },
  { value: 'ETC', label: 'Diğer' },
] as const satisfies readonly Option[];

export type ItemType = (typeof ITEM_TYPES)[number]['value'];

export const ITEM_SUBTYPES: Record<ItemType, readonly Option[]> = {
  WEAPON: [
    { value: 'SWORD', label: 'Kılıç' },
    { value: 'TWO_HANDED', label: 'Çift El' },
    { value: 'DAGGER', label: 'Hançer' },
    { value: 'BOW', label: 'Yay' },
    { value: 'BELL', label: 'Çan' },
    { value: 'FAN', label: 'Yelpaze' },
    { value: 'CLAW', label: 'Pençe' },
    { value: 'ARROW', label: 'Ok' },
  ],
  ARMOR: [
    { value: 'BODY', label: 'Zırh' },
    { value: 'HEAD', label: 'Kask' },
    { value: 'SHIELD', label: 'Kalkan' },
    { value: 'WRIST', label: 'Bilezik' },
    { value: 'FOOTS', label: 'Ayakkabı' },
    { value: 'NECK', label: 'Kolye' },
    { value: 'EAR', label: 'Küpe' },
  ],
  COSTUME: [
    { value: 'BODY', label: 'Kostüm' },
    { value: 'HAIR', label: 'Saç' },
    { value: 'WEAPON', label: 'Silah Kostümü' },
    { value: 'MOUNT', label: 'Binek' },
  ],
  BELT: [{ value: 'BELT', label: 'Kemer' }],
  USE: [
    { value: 'POTION', label: 'İksir' },
    { value: 'SCROLL', label: 'Parşömen' },
    { value: 'BOX', label: 'Sandık' },
  ],
  MATERIAL: [
    { value: 'ORE', label: 'Maden' },
    { value: 'REFINE', label: 'Yükseltme Malzemesi' },
    { value: 'STONE', label: 'Ruh Taşı' },
  ],
  ETC: [{ value: 'NONE', label: 'Genel' }],
};

export const CLASSES = [
  { value: 'WARRIOR', label: 'Savaşçı' },
  { value: 'NINJA', label: 'Ninja' },
  { value: 'SURA', label: 'Sura' },
  { value: 'SHAMAN', label: 'Şaman' },
  { value: 'LYCAN', label: 'Lycan' },
] as const satisfies readonly Option[];

export type CharacterClass = (typeof CLASSES)[number]['value'];

export const RARITIES = [
  { value: 'COMMON', label: 'Sıradan', color: '#c7ccd6' },
  { value: 'UNCOMMON', label: 'Nadir Olmayan', color: '#5fd068' },
  { value: 'RARE', label: 'Nadir', color: '#4ea3ff' },
  { value: 'EPIC', label: 'Destansı', color: '#b86cff' },
  { value: 'LEGENDARY', label: 'Efsanevi', color: '#ffad33' },
] as const;

export type Rarity = (typeof RARITIES)[number]['value'];

export const GENDERS = [
  { value: 'ANY', label: 'Hepsi' },
  { value: 'MALE', label: 'Erkek' },
  { value: 'FEMALE', label: 'Kadın' },
] as const satisfies readonly Option[];

export type Gender = (typeof GENDERS)[number]['value'];

// Yükseltme seviyesi üst sınırı (+0 … +MAX_UPGRADE_LEVEL)
export const MAX_UPGRADE_LEVEL = 15;

// Desteklenen 3D model ve ikon dosya uzantıları
export const MODEL_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx'] as const;
export const ICON_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

// Varsayılan bonus (efsun) tanımları — panelden düzenlenebilir.
export const DEFAULT_BONUS_TYPES: ReadonlyArray<{
  code: string;
  name: string;
  unit: '' | '%';
  maxValue: number;
}> = [
  { code: 'MAX_HP', name: 'Max. HP', unit: '', maxValue: 2000 },
  { code: 'MAX_SP', name: 'Max. SP', unit: '', maxValue: 500 },
  { code: 'CON', name: 'Canlılık (VIT)', unit: '', maxValue: 12 },
  { code: 'INT', name: 'Zeka (INT)', unit: '', maxValue: 12 },
  { code: 'STR', name: 'Güç (STR)', unit: '', maxValue: 12 },
  { code: 'DEX', name: 'Çeviklik (DEX)', unit: '', maxValue: 12 },
  { code: 'ATT_SPEED', name: 'Saldırı Hızı', unit: '%', maxValue: 8 },
  { code: 'MOV_SPEED', name: 'Hareket Hızı', unit: '%', maxValue: 20 },
  { code: 'CAST_SPEED', name: 'Büyü Hızı', unit: '%', maxValue: 20 },
  { code: 'HP_REGEN', name: 'HP Üretimi', unit: '%', maxValue: 20 },
  { code: 'CRITICAL_PCT', name: 'Kritik Vuruş Şansı', unit: '%', maxValue: 10 },
  { code: 'PENETRATE_PCT', name: 'Delici Vuruş Şansı', unit: '%', maxValue: 10 },
  { code: 'ATTBONUS_HUMAN', name: 'Yarı İnsanlara Karşı Güç', unit: '%', maxValue: 10 },
  { code: 'ATTBONUS_ANIMAL', name: 'Hayvanlara Karşı Güç', unit: '%', maxValue: 20 },
  { code: 'ATTBONUS_ORC', name: 'Orklara Karşı Güç', unit: '%', maxValue: 20 },
  { code: 'ATTBONUS_UNDEAD', name: 'Ölümsüzlere Karşı Güç', unit: '%', maxValue: 20 },
  { code: 'ATTBONUS_DEVIL', name: 'Şeytanlara Karşı Güç', unit: '%', maxValue: 20 },
  { code: 'ATTBONUS_MONSTER', name: 'Canavarlara Karşı Güç', unit: '%', maxValue: 20 },
  { code: 'STEAL_HP', name: 'Hasarın HP Olarak Emilmesi', unit: '%', maxValue: 10 },
  { code: 'POISON_PCT', name: 'Zehirleme Değişimi', unit: '%', maxValue: 8 },
  { code: 'STUN_PCT', name: 'Sersemletme Şansı', unit: '%', maxValue: 8 },
  { code: 'SLOW_PCT', name: 'Yavaşlatma Şansı', unit: '%', maxValue: 8 },
  { code: 'BLOCK', name: 'Yakın Dövüş Bloklama', unit: '%', maxValue: 15 },
  { code: 'DODGE', name: 'Oklardan Korunma', unit: '%', maxValue: 15 },
  { code: 'RESIST_SWORD', name: 'Kılıç Savunması', unit: '%', maxValue: 15 },
  { code: 'RESIST_TWOHAND', name: 'Çift El Savunması', unit: '%', maxValue: 15 },
  { code: 'RESIST_DAGGER', name: 'Hançer Savunması', unit: '%', maxValue: 15 },
  { code: 'RESIST_BELL', name: 'Çan Savunması', unit: '%', maxValue: 15 },
  { code: 'RESIST_FAN', name: 'Yelpaze Savunması', unit: '%', maxValue: 15 },
  { code: 'RESIST_BOW', name: 'Oka Karşı Dayanıklılık', unit: '%', maxValue: 15 },
  { code: 'RESIST_MAGIC', name: 'Büyüye Karşı Dayanıklılık', unit: '%', maxValue: 15 },
  { code: 'REFLECT_MELEE', name: 'Yakın Dövüş Hasarını Yansıtma', unit: '%', maxValue: 10 },
  { code: 'EXP_DOUBLE_BONUS', name: 'Ekstra Tecrübe Şansı', unit: '%', maxValue: 20 },
  { code: 'GOLD_DOUBLE_BONUS', name: 'Ekstra Yang Şansı', unit: '%', maxValue: 20 },
  { code: 'ITEM_DROP_BONUS', name: 'Ekstra Eşya Düşürme Şansı', unit: '%', maxValue: 20 },
];

export function labelOf(options: readonly Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function subtypeLabel(type: string, subtype: string): string {
  const list = ITEM_SUBTYPES[type as ItemType];
  return list ? labelOf(list, subtype) : subtype;
}
