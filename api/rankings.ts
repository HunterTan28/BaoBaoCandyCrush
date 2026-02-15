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

/** 从云端读取排行榜（Firebase 已配置时），返回订阅取消函数。sessionStartTs 可选，传入则只返回该赛期内的得分表。得分表保留到下个赛期开始之前（管理员开启新赛期时才切换） */
export function subscribeToRankings(
  passcode: string,
  callback: (list: RankingEntry[]) => void,
  sessionStartTs?: number
): () => void {
  if (!isFirebaseConfigured()) {
    const list = getLocalRankings(passcode);
    const filtered = sessionStartTs != null && sessionStartTs > 0
      ? list.filter((e) => e.time && new Date(e.time).getTime() >= sessionStartTs)
      : list;
    const byName = new Map<string, { score: number; time: string }>();
    filtered.forEach((e) => {
      const cur = byName.get(e.name);
      if (!cur || e.score > cur.score) byName.set(e.name, { score: e.score, time: e.time });
    });
    const sorted = [...byName.entries()].map(([name, { score, time }]) => ({ name, score, time })).sort((a, b) => b.score - a.score);
    callback(sorted);
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
    let list = Object.values(data) as RankingEntry[];
    if (sessionStartTs != null && sessionStartTs > 0) {
      list = list.filter((e) => e.time && new Date(e.time).getTime() >= sessionStartTs);
    }
    const byName = new Map<string, { score: number; time: string }>();
    list.forEach((e) => {
      const cur = byName.get(e.name);
      if (!cur || e.score > cur.score) byName.set(e.name, { score: e.score, time: e.time });
    });
    const sorted = [...byName.entries()].map(([name, { score, time }]) => ({ name, score, time })).sort((a, b) => b.score - a.score);
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

const PENDING_LOTTERY_PREFIX = 'app_pending_lottery_';
const SESSION_DURATION_SEC = 120;

export interface PendingLotteryEntry {
  giftName: string;
  score: number;
}

/** 保存抽奖结果到待定区（赛期结束后才写入 admin_logs） */
export async function saveLotteryToPending(
  nickname: string,
  passcode: string,
  giftName: string,
  score: number
): Promise<void> {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return;

  const localKey = `${PENDING_LOTTERY_PREFIX}${roomKey}`;
  const raw = localStorage.getItem(localKey);
  const pending: Record<string, PendingLotteryEntry> = raw ? JSON.parse(raw) : {};
  pending[nickname] = { giftName, score };
  localStorage.setItem(localKey, JSON.stringify(pending));

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const refPath = `pending_lottery/${encodeURIComponent(roomKey)}/${encodeURIComponent(nickname)}`;
      const refObj = ref(database, refPath);
      await set(refObj, { giftName, score }).catch(() => {});
    }
  }
}

/** 获取待定抽奖结果 */
export async function getPendingLottery(passcode: string): Promise<Record<string, PendingLotteryEntry>> {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return {};

  let result: Record<string, PendingLotteryEntry> = {};
  const localKey = `${PENDING_LOTTERY_PREFIX}${roomKey}`;
  const raw = localStorage.getItem(localKey);
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {}
  }

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const refPath = ref(database, `pending_lottery/${encodeURIComponent(roomKey)}`);
      const snapshot = await get(refPath);
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const firebaseMap: Record<string, PendingLotteryEntry> = {};
        for (const [nickname, val] of Object.entries(data)) {
          const v = val as { giftName?: string; score?: number };
          if (v?.giftName) firebaseMap[decodeURIComponent(nickname)] = { giftName: v.giftName, score: v.score ?? 0 };
        }
        result = { ...result, ...firebaseMap };
      }
    }
  }
  return result;
}

/** 将待定抽奖结果中的前 5 名合并到 admin_logs。force 为 true 时跳过赛期检查，直接从排行榜取前五 */
export async function mergePendingToAdminLogs(passcode: string, force?: boolean): Promise<void> {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return;

  let top5: { name: string; score: number; time: string }[];
  let sessionStartTs: number | undefined;
  if (force) {
    top5 = await getTopRankingsForLogs(roomKey, 5, undefined, undefined);
  } else {
    sessionStartTs = await getSessionStartTsFromConfig(roomKey);
    if (sessionStartTs == null || sessionStartTs <= 0) return;
    const elapsed = (Date.now() - sessionStartTs) / 1000;
    if (elapsed < SESSION_DURATION_SEC) return;
    top5 = await getTopRankingsForLogs(roomKey, 5, undefined, sessionStartTs);
    await saveSessionScoreTableToCloud(roomKey, sessionStartTs);
  }
  const pending = await getPendingLottery(roomKey);
  if (top5.length === 0) return;

  const now = new Date().toLocaleString();
  const entries: AdminLogEntry[] = top5.map((e) => ({
    nickname: e.name,
    passcode: roomKey,
    giftName: pending[e.name]?.giftName ?? '糖果礼物',
    timestamp: now,
    score: e.score,
  }));

  const mergeAndSave = (current: AdminLogEntry[]) => {
    const filtered = current.filter((e) => e.passcode !== roomKey);
    const merged = [...filtered, ...entries].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
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
    }
  } else {
    const raw = localStorage.getItem('app_logs');
    const current: AdminLogEntry[] = raw ? JSON.parse(raw) : [];
    mergeAndSave(current);
  }
}

/** 赛期结束后将完整得分表写入数据库。该得分表保留到下个赛期开始之前（管理员开启新赛期时才被新数据替换） */
async function saveSessionScoreTableToCloud(roomKey: string, sessionStartTs: number): Promise<void> {
  const topAll = await getTopRankingsForLogs(roomKey, 999, undefined, sessionStartTs);
  const scoreTable = topAll.map((e) => ({ nickname: e.name, score: e.score, time: e.time || new Date().toISOString() }));
  const localKey = `score_table_${roomKey}_${sessionStartTs}`;
  localStorage.setItem(localKey, JSON.stringify(scoreTable));

  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const refPath = ref(database, `rooms/${encodeURIComponent(roomKey)}/session_score_table`);
      await set(refPath, scoreTable).catch(() => {});
    }
  }
}

async function getSessionStartTsFromConfig(roomKey: string): Promise<number | undefined> {
  const local = localStorage.getItem(`session_start_${roomKey}`);
  if (local) return parseInt(local, 10) || undefined;
  if (!isFirebaseConfigured()) return undefined;
  const database = getFirebaseDb();
  if (!database) return undefined;
  const configRef = ref(database, `config/session_starts/${encodeURIComponent(roomKey)}`);
  const snapshot = await get(configRef);
  const val = snapshot.val();
  return typeof val === 'number' ? val : undefined;
}

/** 获取赛期剩余秒数，0 表示已结束 */
export function getSessionTimeLeft(passcode: string): number | null {
  const roomKey = normalizePasscode(passcode);
  if (!roomKey) return null;
  const local = localStorage.getItem(`session_start_${roomKey}`);
  if (!local) return null;
  const start = parseInt(local, 10) || 0;
  const elapsed = (Date.now() - start) / 1000;
  return Math.max(0, Math.floor(SESSION_DURATION_SEC - elapsed));
}

/** 将单个中奖者合并到中奖记录（已废弃：改用 saveLotteryToPending + mergePendingToAdminLogs） */
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

/** 直接从数据库/本地读取中奖记录（用于刷新按钮） */
export async function fetchAdminLogs(): Promise<AdminLogEntry[]> {
  if (isFirebaseConfigured()) {
    const database = getFirebaseDb();
    if (database) {
      const adminLogsRef = ref(database, 'admin_logs');
      const snapshot = await get(adminLogsRef);
      const data = snapshot.val();
      const list = Array.isArray(data) ? data : [];
      localStorage.setItem('app_logs', JSON.stringify(list));
      return list;
    }
  }
  const raw = localStorage.getItem('app_logs');
  return raw ? JSON.parse(raw) : [];
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
