import { ref, push, onValue, off, get, set } from 'firebase/database';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export interface RankingEntry {
  name: string;
  score: number;
  time: string;
}

function normalizePasscode(p: string): string {
  return (p || '').trim();
}

/** 保存单局成绩到云端（Firebase 已配置时） */
export function saveRankingToCloud(passcode: string, nickname: string, score: number): void {
  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return;

  const rankingsRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/rankings`);
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
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) {
    callback([]);
    return () => {};
  }

  const rankingsRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/rankings`);
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

/** 获取房间前 N 名（用于写入中奖记录），去重同一人取最高分。pending 为刚结束的本局分数，会合并进结果。
 * 若传入 sessionStartTs，则只统计该赛期内的参与者，不足 N 人不补旧数据。 */
export async function getTopRankingsForLogs(
  passcode: string,
  limit: number = 3,
  pending?: { name: string; score: number },
  sessionStartTs?: number
): Promise<RankingEntry[]> {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return [];

  let list: RankingEntry[] = [];
  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const rankingsRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/rankings`);
      const snapshot = await get(rankingsRef);
      const data = snapshot.val();
      if (data) list = Object.values(data) as RankingEntry[];
    }
  } else {
    list = getLocalRankings(passcode);
  }

  if (sessionStartTs != null && sessionStartTs > 0) {
    list = list.filter((e) => e.time && new Date(e.time).getTime() >= sessionStartTs);
  }
  if (pending) list = [...list, { name: pending.name, score: pending.score, time: new Date().toISOString() }];

  const byName = new Map<string, number>();
  list.forEach((e) => {
    const cur = byName.get(e.name);
    if (cur === undefined || e.score > cur) byName.set(e.name, e.score);
  });
  const sorted = [...byName.entries()]
    .map(([name, score]) => ({ name, score, time: '' }))
    .sort((a, b) => b.score - a.score);
  return sorted.slice(0, limit);
}

/** 将前 3 名写入云端 admin 中奖记录（Firebase 已配置时）。giftNames 为每人随机抽中的礼物名 */
export async function saveTop3ToAdminCloud(
  passcode: string,
  top3: { name: string; score: number }[],
  giftNames: string[]
): Promise<void> {
  if (!isFirebaseConfigured() || top3.length === 0) return;
  const database = getFirebaseDb();
  if (!database) return;
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return;

  const byName = new Map<string, number>();
  top3.forEach((e) => {
    const cur = byName.get(e.name);
    if (cur === undefined || e.score > cur) byName.set(e.name, e.score);
  });
  const deduped = [...byName.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  const defaultGifts = ['超级巨无霸甜品', '糖果礼物 2', '糖果礼物 3'];
  const now = new Date().toLocaleString();
  const entries = deduped.map((e, i) => ({
    nickname: e.name,
    passcode: roomKey,
    giftName: giftNames[i] ?? defaultGifts[i] ?? `第${i + 1}名`,
    timestamp: now,
    score: e.score,
  }));

  const adminLogsRef = ref(database, 'admin_logs');
  await set(adminLogsRef, entries);
}

/** 将单个中奖者合并到中奖记录（用于抽奖转盘，每人独立 spin 后调用） */
export async function addWinnerToAdminLogs(
  nickname: string,
  passcode: string,
  giftName: string,
  score: number
): Promise<void> {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return;

  const now = new Date().toLocaleString();
  const newEntry: AdminLogEntry = { nickname, passcode: roomKey, giftName, timestamp: now, score };

  const mergeAndSave = (current: AdminLogEntry[]) => {
    const filtered = current.filter((e) => !(e.nickname === nickname && e.passcode === roomKey));
    const merged = [...filtered, newEntry].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    localStorage.setItem('app_logs', JSON.stringify(merged));
    return merged;
  };

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const adminLogsRef = ref(database, 'admin_logs');
      const snapshot = await get(adminLogsRef);
      const data = snapshot.val();
      const current: AdminLogEntry[] = Array.isArray(data) ? data : [];
      const merged = mergeAndSave(current);
      await set(adminLogsRef, merged);
      return;
    }
  }
  const raw = localStorage.getItem('app_logs');
  const current: AdminLogEntry[] = raw ? JSON.parse(raw) : [];
  mergeAndSave(current);
}

/** 清空云端中奖记录（Firebase 已配置时） */
export async function clearAdminLogs(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const database = getFirebaseDb();
  if (!database) return;
  const adminLogsRef = ref(database, 'admin_logs');
  await set(adminLogsRef, []);
}

export interface AdminLogEntry {
  nickname: string;
  passcode: string;
  giftName: string;
  timestamp: string;
  score: number;
}

/** 订阅 admin 中奖记录（Firebase 已配置时），返回取消函数 */
export function subscribeToAdminLogs(callback: (logs: AdminLogEntry[]) => void): () => void {
  if (!isFirebaseConfigured()) {
    const raw = localStorage.getItem('app_logs');
    callback(raw ? JSON.parse(raw) : []);
    return () => {};
  }
  const database = getFirebaseDb();
  if (!database) {
    const raw = localStorage.getItem('app_logs');
    callback(raw ? JSON.parse(raw) : []);
    return () => {};
  }
  const adminLogsRef = ref(database, 'admin_logs');
  const unsubscribe = onValue(adminLogsRef, (snapshot) => {
    const data = snapshot.val();
    callback(Array.isArray(data) ? data : []);
  });
  return () => off(adminLogsRef);
}

/** 获取本地排行榜（无 Firebase 时使用） */
export function getLocalRankings(passcode: string): RankingEntry[] {
  const roomKey = normalizePasscode(passcode);
  const key = `ranking_${roomKey}`;
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const list = JSON.parse(raw) as RankingEntry[];
  return list.sort((a, b) => b.score - a.score).slice(0, 10);
}
