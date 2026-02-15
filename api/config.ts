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
