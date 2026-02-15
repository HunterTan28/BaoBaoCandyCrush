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
}

/** 订阅礼物配置（Firebase 优先，否则 localStorage），返回取消订阅函数 */
export function subscribeToGifts(callback: (gifts: GiftItem[]) => void): () => void {
  const defaultGifts: GiftItem[] = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i}`,
    name: i === 0 ? '超级巨无霸甜品' : `糖果礼物 ${i + 1}`,
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
          }));
        }
        if (list.length === 0) {
          try {
            const raw = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
          } catch {}
        }
        list = Array.from({ length: 8 }, (_, i) => list[i] || { id: `g${i}`, name: `糖果礼物 ${i + 1}` });
        callback(list);
      });
      return () => off(configRef);
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const padded = Array.from({ length: 8 }, (_, i) => list[i] ? { id: list[i].id || `g${i}`, name: list[i].name } : defaultGifts[i]);
    callback(padded);
  } catch {
    callback(defaultGifts);
  }
  return () => {};
}

/** 保存礼物配置到云端，同时写入 localStorage */
export function saveGiftsToCloud(gifts: GiftItem[]): void {
  const list = gifts.slice(0, 8).map((g, i) => ({ id: g.id || `g${i}`, name: (g.name || '').trim() || `糖果礼物 ${i + 1}` }));
  localStorage.setItem(LOCAL_STORAGE_GIFTS_KEY, JSON.stringify(list));

  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const configRef = ref(database, CONFIG_GIFTS_KEY);
  set(configRef, list).catch(() => {});
}

/** 获取礼物配置（用于抽奖，优先 Firebase） */
export async function getGiftsForDraw(): Promise<{ name: string }[]> {
  const defaultGiftNames = ['超级巨无霸甜品', '糖果礼物 2', '糖果礼物 3'];

  const fromLocal = localStorage.getItem(LOCAL_STORAGE_GIFTS_KEY);
  if (fromLocal) {
    try {
      const parsed = JSON.parse(fromLocal) as GiftItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const names = parsed.filter((g) => g?.name?.trim()).map((g) => g.name);
        if (names.length > 0) return names.map((n) => ({ name: n }));
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
        const names = val.filter((g: any) => g?.name).map((g: any) => ({ name: String(g.name) }));
        if (names.length > 0) return names;
      }
    }
  }
  return defaultGiftNames.map((n) => ({ name: n }));
}
