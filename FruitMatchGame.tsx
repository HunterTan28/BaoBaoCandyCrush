import React, { useState, useEffect, useCallback, useRef } from 'react';
// Fix path to point to the correct api directory from root
import { useLiveScores } from './api/liveScores';

// 消消乐图案：马年·好运主题，可爱风格（福、红包、马、幸运、喜庆等）
const TILES = ['福', '🧧', '🐴', '🍀', '🎊', '🎉', '㊗️', '吉'];
const ROWS = 8;
const COLS = 8;
const GAME_DURATION = 90;
const MAX_SHUFFLE = 3;
const ELIMINATE_MS = 320;
const DROP_MS = 350;
/** 测试暗号：不写入榜单、不参与排名 */
const TEST_PASSCODE = '测试';

interface Cell {
  type: string;
  id: string;
}

interface Rival {
  name: string;
  score: number;
  avatar: string;
  status: 'playing' | 'idle';
}

export interface LeaderboardItem {
  name: string;
  score: number;
  timestamp: string;
  passcode: string;
}

interface FruitMatchGameProps {
  nickname: string;
  passcode: string;
  onEnd: () => void;
  sessionTimeLeft: number | null;
}

// 消消乐：找出所有三连及以上（横或竖）
function getMatches(grid: (Cell | null)[][]): Set<string> {
  const set = new Set<string>();
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c <= COLS - 3) {
      const t = grid[r][c]?.type;
      if (!t) { c++; continue; }
      let len = 1;
      while (c + len < COLS && grid[r][c + len]?.type === t) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) set.add(`${r},${c + i}`);
      }
      c += len;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r <= ROWS - 3) {
      const t = grid[r][c]?.type;
      if (!t) { r++; continue; }
      let len = 1;
      while (r + len < ROWS && grid[r + len][c]?.type === t) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) set.add(`${r + i},${c}`);
      }
      r += len;
    }
  }
  return set;
}

function createCell(type: string, r: number, c: number): Cell {
  return { type, id: `cell-${r}-${c}-${Math.random().toString(36).slice(2)}` };
}

// 消消乐：消除后下落并补新块，返回新盘面与本次新补格子的坐标（用于下落动画）
function applyGravity(grid: (Cell | null)[][]): { grid: (Cell | null)[][]; filledCoords: Set<string> } {
  const next: (Cell | null)[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const filledCoords = new Set<string>();
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c]?.type) {
        next[write][c] = { ...grid[r][c]!, id: grid[r][c]!.id };
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      next[r][c] = createCell(TILES[Math.floor(Math.random() * TILES.length)], r, c);
      filledCoords.add(`${r},${c}`);
    }
  }
  return { grid: next, filledCoords };
}

// 创建初始棋盘（满格，尽量无初始三连）
function createInitialGrid(): (Cell | null)[][] {
  const g: (Cell | null)[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let type = TILES[Math.floor(Math.random() * TILES.length)];
      while (c >= 2 && g[r][c - 1]?.type === type && g[r][c - 2]?.type === type)
        type = TILES[Math.floor(Math.random() * TILES.length)];
      while (r >= 2 && g[r - 1][c]?.type === type && g[r - 2][c]?.type === type)
        type = TILES[Math.floor(Math.random() * TILES.length)];
      g[r][c] = createCell(type, r, c);
    }
  }
  return g;
}

// 洗牌：整盘重排且保证不会出现三连（与开局同规则）
function shuffleGrid(_grid: (Cell | null)[][]): (Cell | null)[][] {
  const next: (Cell | null)[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let type = TILES[Math.floor(Math.random() * TILES.length)];
      while (c >= 2 && next[r][c - 1]?.type === type && next[r][c - 2]?.type === type)
        type = TILES[Math.floor(Math.random() * TILES.length)];
      while (r >= 2 && next[r - 1][c]?.type === type && next[r - 2][c]?.type === type)
        type = TILES[Math.floor(Math.random() * TILES.length)];
      next[r][c] = createCell(type, r, c);
    }
  }
  return next;
}

// 消消乐提示：找一个可交换形成三连的相邻对
function findHint(grid: (Cell | null)[][]): { r1: number; c1: number; r2: number; c2: number } | null {
  const dr = [0, 1, 0, -1], dc = [1, 0, -1, 0];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (let d = 0; d < 4; d++) {
        const r2 = r + dr[d], c2 = c + dc[d];
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) continue;
        const a = grid[r][c], b = grid[r2][c2];
        if (!a?.type || !b?.type) continue;
        const next = grid.map((row, ri) => row.map((cell, ci) => {
          if (ri === r && ci === c) return b;
          if (ri === r2 && ci === c2) return a;
          return cell ? { ...cell } : null;
        }));
        if (getMatches(next).size > 0) return { r1: r, c1: c, r2, c2 };
      }
    }
  }
  return null;
}

const FruitMatchGame: React.FC<FruitMatchGameProps> = ({ nickname, passcode, onEnd, sessionTimeLeft }) => {
  const [grid, setGrid] = useState<(Cell | null)[][]>(() => createInitialGrid());
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [hintPair, setHintPair] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'post_game' | 'result'>('playing');
  const [isPrizeEligible, setIsPrizeEligible] = useState(true);
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [selectedChest, setSelectedChest] = useState<number | null>(null);
  const [winningGift, setWinningGift] = useState<{ name: string; value: string } | null>(null);
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [battleMessage, setBattleMessage] = useState('派对正在载入...');
  const [myRank, setMyRank] = useState(0);
  const [shuffleLeft, setShuffleLeft] = useState(MAX_SHUFFLE);
  const [eliminatingSet, setEliminatingSet] = useState<Set<string> | null>(null);
  const [droppingCoords, setDroppingCoords] = useState<Set<string> | null>(null);

  const { livePlayers, isLive } = useLiveScores(passcode, nickname, score);

  const timerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gridRef = useRef<(Cell | null)[][]>([]);

  const playSound = useCallback((type: string) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'match') {
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.exponentialRampToValueAtTime(1046, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
      } else if (type === 'hint') {
        osc.frequency.setValueAtTime(392, now);
        gain.gain.setValueAtTime(0.04, now);
      }
      osc.start();
      osc.stop(now + 0.15);
    } catch (e) {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fallbackRivals = ['甜心宝宝', '草莓软糖', '布丁嘟嘟', '起司猫喵'].map(name => ({
        name,
        score: Math.floor(Math.random() * 150),
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
        status: 'playing' as const
      }));
      try {
        // Fix path to point to the correct api directory from root
        const { geminiProxy } = await import('./api/gemini');
        if (cancelled) return;
        const response = await geminiProxy({
          contents: `生成4个可爱的游戏玩家名字，参加暗号"${passcode}"的消消乐派对。以JSON返回: ["name1", "name2", ...]`,
          responseMimeType: 'application/json',
        });
        if (cancelled) return;
        // Use .text property directly as per Gemini API guidelines
        const text = response.text || "[]";
        const names = JSON.parse(text);
        setRivals(names.map((name: string) => ({
          name,
          score: Math.floor(Math.random() * 150),
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
          status: 'playing'
        })));
      } catch (e) {
        if (!cancelled) setRivals(fallbackRivals);
      }
    })();
    return () => { cancelled = true; };
  }, [passcode]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
      if (isLive && livePlayers.length > 0) {
        const events = [' 刚刚连消了一波！', ' 连消中...', ' 正在冲刺！'];
        const others = livePlayers.filter(p => !p.isMe);
        const r = others[Math.floor(Math.random() * others.length)];
        if (r) setBattleMessage(`${r.name}${events[Math.floor(Math.random() * events.length)]}`);
      } else {
        setRivals(prev => prev.map(r => ({
          ...r,
          score: r.score + (Math.random() > 0.6 ? Math.floor(Math.random() * 30) : 0)
        })));
        const events = [' 刚刚连消了一波！', ' 连消中...', ' 正在冲刺！'];
        const r = rivals[Math.floor(Math.random() * rivals.length)];
        if (r) setBattleMessage(`${r.name}${events[Math.floor(Math.random() * events.length)]}`);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [gameState, rivals, isLive, livePlayers]);

  useEffect(() => {
    if (!eliminatingSet && !droppingCoords && grid.length === ROWS && grid[0]?.length === COLS) {
      gridRef.current = grid.map(row => row.map(c => c ? { ...c } : null));
    }
  }, [grid, eliminatingSet, droppingCoords]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    hintTimerRef.current = window.setTimeout(() => {
      const g = gridRef.current;
      if (g?.length) {
        const pair = findHint(g);
        if (pair) {
          setHintPair(pair);
          playSound('hint');
          window.setTimeout(() => setHintPair(null), 800);
        }
      }
      hintTimerRef.current = null;
    }, 10000);
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); };
  }, [gameState, playSound]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleGameOver();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  const handleGameOver = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (passcode === TEST_PASSCODE) {
      setLeaderboard([]);
      setMyRank(0);
      setIsPrizeEligible(false);
      setDisqualificationReason('测试暗号不参与榜单');
      setGameState('post_game');
      return;
    }
    const key = `ranking_${passcode}`;
    const raw = localStorage.getItem(key);
    const list: LeaderboardItem[] = raw ? JSON.parse(raw) : [];
    list.push({ name: nickname, score, timestamp: new Date().toISOString(), passcode });
    const updated = list.sort((a, b) => b.score - a.score).slice(0, 100);
    localStorage.setItem(key, JSON.stringify(updated));
    setLeaderboard(updated);
    const rankOfThisScore = updated.filter(h => h.score > score).length + 1;
    setMyRank(rankOfThisScore);
    setIsPrizeEligible(score > 0 && rankOfThisScore >= 1 && rankOfThisScore <= 3);
    setDisqualificationReason(score <= 0 ? '至少消除一次才有奖励哦' : '只有本场前三名可以开宝箱~');
    setGameState('post_game');
  }, [score, passcode, nickname]);

  const runEliminateStep = useCallback((gridToUse: (Cell | null)[][], matchSet: Set<string>) => {
    setEliminatingSet(matchSet);
    gridRef.current = gridToUse;
    window.setTimeout(() => {
      const g = gridRef.current;
      if (!g.length) return;
      const afterRemove = g.map((row, ri) =>
        row.map((cell, ci) => (matchSet.has(`${ri},${ci}`) ? null : cell ? { ...cell } : null))
      );
      const { grid: afterGravity, filledCoords } = applyGravity(afterRemove);
      setScore(s => s + matchSet.size * 10);
      playSound('match');
      setGrid(afterGravity);
      gridRef.current = afterGravity;
      setEliminatingSet(null);
      setDroppingCoords(new Set(filledCoords));
      window.setTimeout(() => {
        setDroppingCoords(null);
        const nextMatches = getMatches(afterGravity);
        if (nextMatches.size > 0) runEliminateStep(afterGravity, nextMatches);
      }, DROP_MS);
    }, ELIMINATE_MS);
  }, [playSound]);

  const handleCellClick = useCallback((r: number, c: number) => {
    if (gameState !== 'playing' || !grid[r]?.[c]?.type) return;
    if (eliminatingSet || droppingCoords) return;
    setHintPair(null);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      const pair = findHint(gridRef.current.length ? gridRef.current : grid);
      if (pair) {
        setHintPair(pair);
        playSound('hint');
        window.setTimeout(() => setHintPair(null), 800);
      }
      hintTimerRef.current = null;
    }, 10000);

    if (!selected) {
      setSelected({ r, c });
      return;
    }
    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }
    const dr = Math.abs(selected.r - r), dc = Math.abs(selected.c - c);
    if (dr + dc !== 1) {
      setSelected({ r, c });
      return;
    }
    const next = grid.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri === selected.r && ci === selected.c) return grid[r][c] ? { ...grid[r][c]! } : null;
        if (ri === r && ci === c) return grid[selected.r][selected.c] ? { ...grid[selected.r][selected.c]! } : null;
        return cell ? { ...cell } : null;
      })
    );
    const matches = getMatches(next);
    if (matches.size === 0) {
      setSelected({ r, c });
      return;
    }
    setGrid(next);
    setSelected(null);
    runEliminateStep(next, matches);
  }, [gameState, grid, selected, eliminatingSet, droppingCoords, runEliminateStep, playSound]);

  const handleShuffle = useCallback(() => {
    if (shuffleLeft <= 0) return;
    setSelected(null);
    setHintPair(null);
    setShuffleLeft(s => s - 1);
    setGrid(prev => shuffleGrid(prev));
  }, [shuffleLeft]);

  const handleChestClick = (i: number) => {
    if (winningGift) return;
    setSelectedChest(i);
    const savedGifts = JSON.parse(localStorage.getItem('app_gifts') || '[]');
    const gift = savedGifts.length > 0 ? savedGifts[Math.floor(Math.random() * savedGifts.length)] : { name: '超级甜品包', value: '100' };
    setWinningGift({ name: gift.name, value: gift.value });
    const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
    logs.push({ nickname, passcode, giftName: gift.name, timestamp: new Date().toLocaleString(), score });
    localStorage.setItem('app_logs', JSON.stringify(logs));
    setTimeout(() => setGameState('result'), 1000);
  };

  if (gameState === 'playing') {
    const gridReady = Array.isArray(grid) && grid.length === ROWS && Array.isArray(grid[0]) && grid[0].length === COLS;
    const allScores = (isLive && livePlayers.length > 0)
      ? livePlayers
      : [{ name: nickname, score, isMe: true }, ...rivals.map(r => ({ name: r.name, score: r.score, isMe: false }))].sort((a, b) => b.score - a.score);
    return (
      <div
        style={{
          width: '100%',
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'clamp(8px, 2vmin, 16px)',
          background: '#fdf2f8',
          boxSizing: 'border-box',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            maxWidth: 720,
            marginBottom: 6,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ background: '#fff', padding: '10px 14px', borderRadius: 12, fontWeight: 'bold', color: '#db2777', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', minWidth: 72, textAlign: 'center' as const }}>得分 {score}</span>
          <span style={{ background: '#fff', padding: '10px 14px', borderRadius: 12, fontWeight: 'bold', color: '#b45309', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', minWidth: 72, textAlign: 'center' as const }}>剩余 {timeLeft}s</span>
          <span style={{ fontSize: 'clamp(11px, 2vw, 13px)', color: '#9d174d' }}>10 秒不操作将自动提示</span>
          <button type="button" onClick={handleShuffle} disabled={shuffleLeft <= 0} style={{ padding: '10px 14px', minHeight: 44, background: shuffleLeft > 0 ? '#f59e0b' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: shuffleLeft > 0 ? 'pointer' : 'not-allowed', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', touchAction: 'manipulation' }}>洗牌(剩{shuffleLeft}次)</button>
        </div>
        <p style={{ marginBottom: 6, color: '#9d174d', fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>
          <strong>消消乐</strong>：先点一个，再点<strong>相邻</strong>的另一个，交换后三个及以上连成一线即可消除。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: 'clamp(12px, 3vmin, 20px)', width: '100%', maxWidth: 720 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!gridReady && (
              <p style={{ color: '#be185d', fontWeight: 'bold', margin: 24 }}>游戏加载中...</p>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
          @keyframes match-eliminate {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0); opacity: 0; }
          }
          @keyframes tile-drop {
            0% { transform: translateY(-100%); opacity: 0.6; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes eliminate-burst {
            0% { transform: scale(0.3); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
          }
          @keyframes eliminate-particle {
            0% { transform: translate(0,0) scale(1); opacity: 1; }
            100% { transform: var(--dx) var(--dy) scale(0); opacity: 0; }
          }
          @keyframes score-pop {
            0% { transform: translate(-50%,-50%) scale(0.8); opacity: 1; }
            50% { transform: translate(-50%,-50%) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%,-50%) translateY(-28px) scale(1); opacity: 0; }
          }
          @keyframes eliminate-p1 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(0,-22px) scale(0); opacity: 0; } }
          @keyframes eliminate-p2 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(19px,-11px) scale(0); opacity: 0; } }
          @keyframes eliminate-p3 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(19px,11px) scale(0); opacity: 0; } }
          @keyframes eliminate-p4 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(0,22px) scale(0); opacity: 0; } }
          @keyframes eliminate-p5 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(-19px,11px) scale(0); opacity: 0; } }
          @keyframes eliminate-p6 { 0% { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) translate(-19px,-11px) scale(0); opacity: 0; } }
          .match-eliminating { animation: match-eliminate 0.32s ease-out forwards; pointer-events: none; position: relative; overflow: visible; }
          .tile-dropping { animation: tile-drop 0.35s ease-out forwards; }
          .eliminate-burst { position: absolute; inset: -4px; border-radius: 50%; background: radial-gradient(circle, rgba(255,220,120,0.95) 0%, rgba(255,180,80,0.6) 35%, transparent 65%); animation: eliminate-burst 0.32s ease-out forwards; pointer-events: none; }
          .eliminate-particle { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 6px #ffc107; pointer-events: none; }
          .eliminate-particle.p1 { animation: eliminate-p1 0.35s ease-out forwards; }
          .eliminate-particle.p2 { animation: eliminate-p2 0.35s ease-out forwards; }
          .eliminate-particle.p3 { animation: eliminate-p3 0.35s ease-out forwards; }
          .eliminate-particle.p4 { animation: eliminate-p4 0.35s ease-out forwards; }
          .eliminate-particle.p5 { animation: eliminate-p5 0.35s ease-out forwards; }
          .eliminate-particle.p6 { animation: eliminate-p6 0.35s ease-out forwards; }
          .score-popup { position: absolute; left: 50%; top: 50%; font-weight: 800; font-size: 14px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); animation: score-pop 0.6s ease-out forwards; pointer-events: none; z-index: 5; }
        `}} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            gap: 'clamp(3px, 1vmin, 6px)',
            width: 'min(92vw, 90vmin, 420px)',
            maxWidth: 420,
            aspectRatio: COLS / ROWS,
            background: '#fef3c7',
            padding: 'clamp(6px, 1.5vmin, 12px)',
            borderRadius: 16,
            border: '3px solid #fcd34d',
            touchAction: 'manipulation',
          }}
        >
          {grid.map((row, r) =>
            (Array.isArray(row) ? row : []).map((cell, c) => {
              const isSelected = selected?.r === r && selected?.c === c;
              const isHint = hintPair && ((hintPair.r1 === r && hintPair.c1 === c) || (hintPair.r2 === r && hintPair.c2 === c));
              const isEmpty = !cell?.type;
              const isEliminating = eliminatingSet?.has(`${r},${c}`);
              const isDropping = droppingCoords?.has(`${r},${c}`);
              const isBusy = !!eliminatingSet || !!droppingCoords;
              return (
                <div
                  key={cell?.id ?? `e-${r}-${c}`}
                  role="button"
                  tabIndex={-1}
                  className={isEliminating ? 'match-eliminating' : isDropping ? 'tile-dropping' : ''}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isEmpty && !isBusy) handleCellClick(r, c);
                  }}
                  style={{
                    aspectRatio: '1',
                    minHeight: 28,
                    minWidth: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: isSelected ? '3px solid #be185d' : '2px solid',
                    borderColor: isSelected ? '#be185d' : isHint ? '#0ea5e9' : isEmpty ? '#fde68a' : '#e5e7eb',
                    background: isEmpty ? 'rgba(254,243,199,0.6)' : isSelected ? '#fce7f3' : isHint ? '#e0f2fe' : '#fff',
                    cursor: isEmpty || isBusy ? 'default' : 'pointer',
                    fontSize: 'clamp(16px, 4vmin, 28px)',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    boxShadow: isSelected ? '0 0 0 2px #f9a8d4' : 'none',
                    transform: isSelected && !isEliminating && !isDropping ? 'scale(1.08)' : 'scale(1)',
                    transition: isEliminating || isDropping ? 'none' : 'border-color 0.15s, background 0.15s, transform 0.15s',
                    touchAction: 'manipulation',
                  }}
                >
                  {cell?.type === '吉' ? (
                    <span style={{ color: '#c9a227', fontWeight: 700 }}>吉</span>
                  ) : cell?.type === '🍀' ? (
                    <span style={{ filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(1.15)' }}>🍀</span>
                  ) : (
                    cell?.type ?? ''
                  )}
                  {isEliminating && (
                    <>
                      <div className="eliminate-burst" aria-hidden />
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={`eliminate-particle p${i}`} aria-hidden />
                      ))}
                      <span className="score-popup" aria-hidden>+10</span>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
          </div>
          <div style={{ minWidth: 200, maxWidth: 280, width: '100%', background: 'rgba(255,255,255,0.95)', padding: 'clamp(12px, 2vmin, 16px)', borderRadius: 16, border: '2px solid #fbcfe8', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ color: '#db2777', fontWeight: 'bold', marginBottom: 10, fontSize: 'clamp(14px, 2.5vw, 16px)' }}>
              📊 实时得分 {isLive && <span style={{ fontSize: '0.75em', color: '#0ea5e9', fontWeight: 600 }}>· 多人在线</span>}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allScores.map((item, i) => (
                <div
                  key={item.isMe ? 'me' : item.name}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: item.isMe ? '#fce7f3' : '#fff',
                    border: item.isMe ? '2px solid #db2777' : '1px solid #fce7f3',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: item.isMe ? 'bold' : 'normal', color: item.isMe ? '#be185d' : '#374151' }}>
                    {item.isMe ? `我 (${item.name})` : item.name}
                  </span>
                  <span style={{ fontWeight: 'bold', color: '#db2777', fontVariantNumeric: 'tabular-nums' }}>{item.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p style={{ marginTop: 10, color: '#be185d', fontWeight: 'bold', fontSize: 'clamp(12px, 2.5vw, 14px)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
          📢 {battleMessage}
        </p>
      </div>
    );
  }

  if (gameState === 'post_game') {
    const list = leaderboard.length ? leaderboard : JSON.parse(localStorage.getItem(`ranking_${passcode}`) || '[]');
    const sorted = [...list].sort((a: LeaderboardItem, b: LeaderboardItem) => b.score - a.score);
    const myRank = sorted.findIndex((h: LeaderboardItem) => h.name === nickname) + 1;

    return (
      <div className="w-full h-full bg-pink-50 flex items-center justify-center p-4 overflow-auto">
        <div className="glass-panel w-full max-w-2xl p-8 rounded-[2rem] text-center animate-in fade-in duration-300">
          <h2 className="text-3xl font-bold candy-text mb-6">本场结束 · 排行榜</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white/80 rounded-2xl p-4 overflow-hidden">
              <h3 className="text-pink-500 font-bold mb-3">🏆 本暗号排名</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {sorted.slice(0, 15).map((l: LeaderboardItem, i: number) => (
                  <div
                    key={`${l.name}-${l.timestamp}-${i}`}
                    className={`flex justify-between items-center p-2 rounded-lg ${l.name === nickname ? 'bg-pink-400 text-white' : 'bg-pink-50 text-pink-700'}`}
                  >
                    <span className="font-bold">#{i + 1} {l.name}</span>
                    <span className="font-mono font-black">{l.score}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-pink-600 font-bold">你的名次：第 {myRank} 名</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-4">
              {isPrizeEligible ? (
                <>
                  <div className="text-5xl">🎁</div>
                  <h3 className="text-xl font-bold text-sky-600">进入前三！选一个宝箱</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleChestClick(i)}
                        className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-2xl shadow border-2 border-pink-100 hover:scale-110 cursor-pointer"
                      >
                        🎁
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-5xl">🍨</div>
                  <p className="text-lg text-pink-600 font-bold">{disqualificationReason}</p>
                  <button type="button" onClick={onEnd} className="bubble-btn px-8 py-3 bg-sky-400 text-white rounded-full font-bold">
                    查看感言并离开
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'result') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-pink-100 p-4">
        <div className="max-w-sm w-full bg-white p-10 rounded-[3rem] text-center shadow-2xl border-4 border-white animate-in zoom-in duration-300">
          <h2 className="text-3xl font-bold text-sky-500 mb-6">🎊 恭喜获得 🎊</h2>
          <div className="text-2xl font-black text-pink-600 bg-pink-50 py-8 rounded-2xl mb-8 border-2 border-pink-100">
            {winningGift?.name}
          </div>
          <button type="button" onClick={onEnd} className="bubble-btn w-full py-4 bg-sky-400 text-white rounded-full font-bold text-xl shadow-xl">
            太棒啦！
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default FruitMatchGame;
// Removed redundant export of LeaderboardItem to fix conflict
