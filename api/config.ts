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
        const code = typeof val === 'string' ? val : (val || '') || '';
        callback(code || '');
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
  set(configRef, trimmed);
}
