import { ref, push, onValue, off } from 'firebase/database';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export interface RankingEntry {
  name: string;
  score: number;
  time: string;
}

/** 保存单局成绩到云端（Firebase 已配置时） */
export function saveRankingToCloud(passcode: string, nickname: string, score: number): void {
  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;

  const rankingsRef = ref(database, `rooms/${encodeURIComponent(passcode)}/rankings`);
  push(rankingsRef, {
    name: nickname,
    score,
    time: new Date().toISOString(),
  });
}

/** 从云端读取排行榜（Firebase 已配置时），返回订阅取消函数 */
export function subscribeToRankings(
  passcode: string,
  callback: (list: RankingEntry[]) => void
): () => void {
  if (!isFirebaseConfigured()) {
    callback([]);
    return () => {};
  }
  const database = getFirebaseDb();
  if (!database) {
    callback([]);
    return () => {};
  }

  const rankingsRef = ref(database, `rooms/${encodeURIComponent(passcode)}/rankings`);
  const unsubscribe = onValue(rankingsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const list = Object.values(data) as RankingEntry[];
    const sorted = [...list].sort((a, b) => b.score - a.score).slice(0, 10);
    callback(sorted);
  });

  return () => off(rankingsRef);
}

/** 获取本地排行榜（无 Firebase 时使用） */
export function getLocalRankings(passcode: string): RankingEntry[] {
  const key = `ranking_${passcode}`;
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const list = JSON.parse(raw) as RankingEntry[];
  return list.sort((a, b) => b.score - a.score).slice(0, 10);
}
