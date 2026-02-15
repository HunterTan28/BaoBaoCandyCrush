import { useState, useEffect } from 'react';
import { ref, onValue, set, off } from 'firebase/database';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export interface PlayerScore {
  name: string;
  score: number;
  isMe: boolean;
}

const CLIENT_ID_KEY = 'candy_client_id';
const LIVE_TIMEOUT_MS = 15000;

function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function useLiveScores(passcode: string, nickname: string, myScore: number) {
  const [livePlayers, setLivePlayers] = useState<PlayerScore[]>([]);
  const [isLive, setIsLive] = useState(false);
  const useFirebase = isFirebaseConfigured();
  const clientId = getClientId();

  // Firebase: 写入自己的分数
  useEffect(() => {
    if (!useFirebase) return;
    const database = getFirebaseDb();
    if (!database) return;

    const playerRef = ref(database, `rooms/${encodeURIComponent(passcode)}/players/${clientId}`);
    const payload = { name: nickname, score: myScore, lastUpdate: Date.now() };

    const write = () => set(playerRef, payload);
    write();
    const interval = setInterval(write, 2000);
    return () => clearInterval(interval);
  }, [useFirebase, passcode, nickname, myScore, clientId]);

  // Firebase: 监听房间内所有玩家
  useEffect(() => {
    if (!useFirebase) return;
    const database = getFirebaseDb();
    if (!database) return;

    const roomRef = ref(database, `rooms/${encodeURIComponent(passcode)}/players`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setLivePlayers([]);
        setIsLive(false);
        return;
      }
      const now = Date.now();
      const list = Object.entries(data)
        .map(([id, p]: [string, any]) => ({
          name: p?.name || '未知',
          score: p?.score ?? 0,
          lastUpdate: p?.lastUpdate ?? 0,
          isMe: id === clientId,
        }))
        .filter((p) => now - p.lastUpdate < LIVE_TIMEOUT_MS)
        .sort((a, b) => b.score - a.score)
        .map((p) => ({ name: p.name, score: p.score, isMe: p.isMe }));

      setLivePlayers(list);
      setIsLive(list.length > 1);
    });
    return () => off(roomRef);
  }, [useFirebase, passcode, clientId]);

  // localStorage 回退：无 Firebase 时
  useEffect(() => {
    if (useFirebase) return;

    const interval = setInterval(() => {
      const storageKey = `live_room_${passcode}`;
      const players = JSON.parse(localStorage.getItem(storageKey) || '[]');

      const meIndex = players.findIndex((p: any) => p.name === nickname);
      if (meIndex > -1) {
        players[meIndex].score = myScore;
        players[meIndex].lastUpdate = Date.now();
      } else {
        players.push({ name: nickname, score: myScore, lastUpdate: Date.now() });
      }

      const activePlayers = players.filter((p: any) => Date.now() - p.lastUpdate < LIVE_TIMEOUT_MS);
      localStorage.setItem(storageKey, JSON.stringify(activePlayers));

      setLivePlayers(
        activePlayers
          .map((p: any) => ({
            name: p.name,
            score: p.score,
            isMe: p.name === nickname,
          }))
          .sort((a: PlayerScore, b: PlayerScore) => b.score - a.score)
      );
      setIsLive(activePlayers.length > 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [useFirebase, passcode, nickname, myScore]);

  return { livePlayers, isLive };
}
