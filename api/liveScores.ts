import { useState, useEffect } from 'react';
import { ref, onValue, set, off } from 'firebase/database';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export interface PlayerScore {
  name: string;
  score: number;
  isMe: boolean;
}

const CLIENT_ID_KEY = 'candy_client_id';
const LIVE_TIMEOUT_MS = 20000;
const WRITE_INTERVAL_MS = 1000;

function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function normalizePasscode(p: string): string {
  return (p || '').trim();
}

export function useLiveScores(passcode: string, nickname: string, myScore: number) {
  const [livePlayers, setLivePlayers] = useState<PlayerScore[]>([]);
  const [isLive, setIsLive] = useState(false);
  const useFirebase = isFirebaseConfigured();
  const clientId = getClientId();
  const roomKey = normalizePasscode(passcode);

  // Firebase: 写入自己的分数（每 1 秒同步，保证同一房间可见）
  useEffect(() => {
    if (!useFirebase || !roomKey) return;
    const database = getFirebaseDb();
    if (!database) return;

    const playerRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/players/${clientId}`);
    const payload = { name: nickname, score: myScore, lastUpdate: Date.now() };

    const write = () => set(playerRef, payload);
    write();
    const interval = setInterval(write, WRITE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [useFirebase, roomKey, nickname, myScore, clientId]);

  // Firebase: 监听房间内所有玩家
  useEffect(() => {
    if (!useFirebase || !roomKey) return;
    const database = getFirebaseDb();
    if (!database) return;

    const roomRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/players`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setLivePlayers([]);
        setIsLive(false);
        return;
      }
      const list = Object.entries(data)
        .map(([id, p]: [string, any]) => ({
          name: p?.name || '未知',
          score: p?.score ?? 0,
          isMe: id === clientId,
        }))
        .sort((a, b) => b.score - a.score);

      setLivePlayers(list);
      setIsLive(list.length > 1);
    });
    return () => off(roomRef);
  }, [useFirebase, roomKey, clientId]);

  // localStorage 回退：无 Firebase 时
  useEffect(() => {
    if (useFirebase) return;

    const interval = setInterval(() => {
      const storageKey = `live_room_${roomKey}`;
      const players = JSON.parse(localStorage.getItem(storageKey) || '[]');

      const meIndex = players.findIndex((p: any) => p.name === nickname);
      if (meIndex > -1) {
        players[meIndex].score = myScore;
        players[meIndex].lastUpdate = Date.now();
      } else {
        players.push({ name: nickname, score: myScore, lastUpdate: Date.now() });
      }

      localStorage.setItem(storageKey, JSON.stringify(players));

      setLivePlayers(
        players
          .map((p: any) => ({
            name: p.name,
            score: p.score,
            isMe: p.name === nickname,
          }))
          .sort((a: PlayerScore, b: PlayerScore) => b.score - a.score)
      );
      setIsLive(players.length > 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [useFirebase, roomKey, nickname, myScore]);

  return { livePlayers, isLive };
}

/** 管理员用：订阅当前暗号房间的实时玩家得分（本局实时战况），按分数降序 */
export function subscribeToLivePlayersForAdmin(passcode: string, callback: (players: { name: string; score: number }[]) => void): () => void {
  const roomKey = (passcode || '').trim();
  if (!roomKey) {
    callback([]);
    return () => {};
  }
  if (!isFirebaseConfigured()) {
    callback([]);
    return () => {};
  }
  const database = getFirebaseDb();
  if (!database) {
    callback([]);
    return () => {};
  }
  const roomRef = ref(database, `rooms/${encodeURIComponent(roomKey)}/players`);
  const unsubscribe = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const list = Object.values(data)
      .map((p: any) => ({ name: p?.name || '未知', score: p?.score ?? 0 }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    callback(list);
  });
  return () => off(roomRef);
}
