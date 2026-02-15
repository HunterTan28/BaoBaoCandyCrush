import { ref, onValue, set, off } from 'firebase/database';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

const CONFIG_SECRET_CODE_KEY = 'config/secret_code';
const LOCAL_STORAGE_KEY = 'app_secret_code';

/** 订阅当前有效暗号（Firebase 优先，否则 localStorage），返回取消订阅函数 */
export function subscribeToSecretCode(callback: (code: string) => void): () => void {
  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const configRef = ref(database, CONFIG_SECRET_CODE_KEY);
      const unsubscribe = onValue(configRef, (snapshot) => {
        const val = snapshot.val();
        const fromFirebase = typeof val === 'string' ? (val || '').trim() : '';
        const code = fromFirebase || localStorage.getItem(LOCAL_STORAGE_KEY) || '';
        callback(code);
      });
      return () => off(configRef);
    }
  }
  const code = localStorage.getItem(LOCAL_STORAGE_KEY) || '';
  callback(code);
  return () => {};
}

/** 保存暗号到云端（Firebase 已配置时），同时写入 localStorage 作为回退 */
export function saveSecretCodeToCloud(code: string): void {
  const trimmed = (code || '').trim();
  localStorage.setItem(LOCAL_STORAGE_KEY, trimmed);

  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;

  const configRef = ref(database, CONFIG_SECRET_CODE_KEY);
  set(configRef, trimmed).catch((err) => {
    console.warn('[Config] 暗号写入 Firebase 失败，可能未配置 config 规则:', err);
  });
}

const SESSION_STARTS_PATH = 'config/session_starts';

/** 保存赛期开始时间到云端（开启赛期时调用） */
export function saveSessionStartToCloud(passcode: string): void {
  const roomKey = (passcode || '').trim();
  if (!roomKey) return;
  const ts = Date.now();
  localStorage.setItem(`session_start_${roomKey}`, ts.toString());

  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const configRef = ref(database, `${SESSION_STARTS_PATH}/${encodeURIComponent(roomKey)}`);
  set(configRef, ts).catch(() => {});
}

/** 获取赛期开始时间戳（优先 Firebase，用于跨设备） */
export async function getSessionStartTs(passcode: string): Promise<number | undefined> {
  const roomKey = (passcode || '').trim();
  if (!roomKey) return undefined;
  const local = localStorage.getItem(`session_start_${roomKey}`);
  if (local) return parseInt(local, 10) || undefined;

  if (!isFirebaseConfigured()) return undefined;
  const database = getFirebaseDb();
  if (!database) return undefined;
  const configRef = ref(database, `${SESSION_STARTS_PATH}/${encodeURIComponent(roomKey)}`);
  const { get } = await import('firebase/database');
  const snapshot = await get(configRef);
  const val = snapshot.val();
  return typeof val === 'number' ? val : undefined;
}

const CONFIG_GIFTS_KEY = 'config/gifts';
const LOCAL_STORAGE_GIFTS_KEY = 'app_gifts';

export interface GiftItem {
  id: string;
  name: string;
  /** 抽中概率 0-100，8 个礼物总和必须为 100 */
  probability: number;
}

/** 订阅礼物配置（Firebase 优先，否则 localStorage），返回取消订阅函数 */
export function subscribeToGifts(callback: (gifts: GiftItem[]) => void): () => void {
  const defaultGifts: GiftItem[] = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i}`,
    name: i === 0 ? '超级巨无霸甜品' : `糖果礼物 ${i + 1}`,
    probability: i < 4 ? 12 : 13, // 12*4+13*4=100
  }));

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const configRef = ref(database, CONFIG_GIFTS_KEY);
      const unsubscribe = onValue(configRef, (snapshot) => {
        const val = snapshot.val();
        let list: GiftItem[] = [];
        if (Array.isArray(val) && val.length > 0) {
          list = val.map((g: any, i: number) => ({
            id: g?.id || `g${i}`,
            name: typeof g?.name === 'string' ? g.name.trim() || `糖果礼物 ${i + 1}` : `糖果礼物 ${i + 1}`,
            probability: typeof g?.probability === 'number' && g.probability >= 0 ? g.probability : (i < 4 ? 12 : 13),
          }));
        }
        if (list.length === 0) {
          try {
            const raw = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
          } catch {}
        }
        list = Array.from({ length: 8 }, (_, i) => list[i] || { id: `g${i}`, name: `糖果礼物 ${i + 1}`, probability: i < 4 ? 12 : 13 });
        callback(list);
      });
      return () => off(configRef);
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const padded = Array.from({ length: 8 }, (_, i) => list[i] ? { id: list[i].id || `g${i}`, name: list[i].name, probability: list[i].probability ?? (i < 4 ? 12 : 13) } : defaultGifts[i]);
    callback(padded);
  } catch {
    callback(defaultGifts);
  }
  return () => {};
}

/** 保存礼物配置到云端，同时写入 localStorage。概率总和必须为 100，否则抛出错误。 */
export function saveGiftsToCloud(gifts: GiftItem[]): void {
  const list = gifts.slice(0, 8).map((g, i) => ({
    id: g.id || `g${i}`,
    name: (g.name || '').trim() || `糖果礼物 ${i + 1}`,
    probability: Math.max(0, Math.min(100, Number(g.probability) || 0)),
  }));
  const sum = list.reduce((s, g) => s + g.probability, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`概率总和必须为 100%，当前为 ${sum}%`);
  }
  localStorage.setItem(LOCAL_STORAGE_GIFTS_KEY, JSON.stringify(list));

  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const configRef = ref(database, CONFIG_GIFTS_KEY);
  set(configRef, list).catch(() => {});
}

export interface GiftForDraw {
  name: string;
  probability: number;
}

/** 获取礼物配置（用于抽奖，含概率，优先 Firebase） */
export async function getGiftsForDraw(): Promise<GiftForDraw[]> {
  const defaultGifts: GiftForDraw[] = [
    { name: '超级巨无霸甜品', probability: 12 },
    { name: '糖果礼物 2', probability: 12 },
    { name: '糖果礼物 3', probability: 12 },
    { name: '糖果礼物 4', probability: 12 },
    { name: '糖果礼物 5', probability: 13 },
    { name: '糖果礼物 6', probability: 13 },
    { name: '糖果礼物 7', probability: 13 },
    { name: '糖果礼物 8', probability: 13 },
  ];

  const fromLocal = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
  if (fromLocal) {
    try {
      const parsed = JSON.parse(fromLocal) as GiftItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const items = parsed
          .filter((g) => g?.name?.trim() && (g.probability ?? 0) >= 0)
          .map((g) => ({ name: g.name!.trim(), probability: g.probability ?? 0 }));
        if (items.length > 0) return items;
      }
    } catch {}
  }

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const configRef = ref(database, CONFIG_GIFTS_KEY);
      const { get } = await import('firebase/database');
      const snapshot = await get(configRef);
      const val = snapshot.val();
      if (Array.isArray(val) && val.length > 0) {
        const items = val
          .filter((g: any) => g?.name)
          .map((g: any) => ({ name: String(g.name).trim(), probability: typeof g.probability === 'number' && g.probability >= 0 ? g.probability : 12 }));
        if (items.length > 0) return items;
      }
    }
  }
  return defaultGifts;
}

// 外观音效配置
const APPEARANCE_KEY = 'app_appearance';
const CONFIG_APPEARANCE_KEY = 'config/appearance';

export interface AppearanceConfig {
  backgroundUrl: string;
  tileImages: string[];
  endMusicUrl: string;
  logoUrl: string;
}

/** 内置默认资源路径（需将图片放入 public 目录） */
const BUILTIN_DEFAULTS = {
  backgroundUrl: '/bg.png',
  logoUrl: '/logo.gif',
  tileImages: [] as string[],
  endMusicUrl: '/bkmusic.mp3',
};

const DEFAULT_APPEARANCE: AppearanceConfig = {
  ...BUILTIN_DEFAULTS,
};

function loadAppearanceFromStorage(): AppearanceConfig {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw);
    const loaded: AppearanceConfig = {
      backgroundUrl: typeof parsed?.backgroundUrl === 'string' ? parsed.backgroundUrl : '',
      tileImages: Array.isArray(parsed?.tileImages) ? parsed.tileImages.slice(0, 8) : [],
      endMusicUrl: typeof parsed?.endMusicUrl === 'string' ? parsed.endMusicUrl : '',
      logoUrl: typeof parsed?.logoUrl === 'string' ? parsed.logoUrl : '',
    };
    return {
      backgroundUrl: loaded.backgroundUrl || BUILTIN_DEFAULTS.backgroundUrl,
      tileImages: loaded.tileImages.length ? loaded.tileImages : BUILTIN_DEFAULTS.tileImages,
      endMusicUrl: loaded.endMusicUrl || BUILTIN_DEFAULTS.endMusicUrl,
      logoUrl: loaded.logoUrl || BUILTIN_DEFAULTS.logoUrl,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** 订阅外观音效配置 */
export function subscribeToAppearance(callback: (cfg: AppearanceConfig) => void): () => void {
  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const configRef = ref(database, CONFIG_APPEARANCE_KEY);
      const unsubscribe = onValue(configRef, (snapshot) => {
        const val = snapshot.val();
        const local = loadAppearanceFromStorage();
        let cfg: AppearanceConfig = { ...local };
        if (val && typeof val === 'object') {
          if (typeof val.backgroundUrl === 'string' && val.backgroundUrl) cfg.backgroundUrl = val.backgroundUrl;
          else cfg.backgroundUrl = cfg.backgroundUrl || BUILTIN_DEFAULTS.backgroundUrl;
          if (Array.isArray(val.tileImages) && val.tileImages.length) cfg.tileImages = val.tileImages.slice(0, 8);
          else cfg.tileImages = (cfg.tileImages?.length ? cfg.tileImages : BUILTIN_DEFAULTS.tileImages).slice(0, 8);
          if (typeof val.endMusicUrl === 'string' && val.endMusicUrl) cfg.endMusicUrl = val.endMusicUrl;
          if (typeof val.logoUrl === 'string' && val.logoUrl) cfg.logoUrl = val.logoUrl;
          else cfg.logoUrl = cfg.logoUrl || BUILTIN_DEFAULTS.logoUrl;
        }
        callback(cfg);
      });
      return () => off(configRef);
    }
  }
  callback(loadAppearanceFromStorage());
  return () => {};
}

/** 保存外观音效配置到云端 */
export function saveAppearanceToCloud(cfg: AppearanceConfig): void {
  const data = {
    backgroundUrl: (cfg.backgroundUrl || '').trim(),
    tileImages: (cfg.tileImages || []).slice(0, 8),
    endMusicUrl: (cfg.endMusicUrl || '').trim(),
    logoUrl: (cfg.logoUrl || '').trim(),
  };
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(data));
  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const configRef = ref(database, CONFIG_APPEARANCE_KEY);
  set(configRef, data).catch(() => {});
}

/** 获取外观配置（用于游戏/感谢页） */
export function getAppearanceSync(): AppearanceConfig {
  return loadAppearanceFromStorage();
}
