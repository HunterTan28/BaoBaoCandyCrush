
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveScores } from '../api/liveScores';
import { generateGameContent } from '../api/gemini';
import { saveRankingToCloud, getTopRankingsForLogs, saveTop3ToAdminCloud } from '../api/rankings';

const TILES = ['🍬', '🍭', '🧁', '🍮', '🍩', '🍫', '🥯', '🥞'];
const ROWS = 8;
const COLS = 8;
const GAME_DURATION = 30;
const SCORE_PER_TILE = 10;
const BONUS_4 = 5;   // 四连每格额外 +5
const BONUS_5 = 10;  // 五连每格额外 +10
const COMBO_MULTIPLIER = 0.5; // 连击每层 +50% 分数
const SHUFFLE_LIMIT = 3;
const HINT_IDLE_SECONDS = 2;

interface Cell {
  type: string;
  id: string;
  isMatched?: boolean;
  isFalling?: boolean;
  isSwapping?: boolean;
}

function createCell(type?: string): Cell {
  return {
    type: type ?? TILES[Math.floor(Math.random() * TILES.length)],
    id: Math.random().toString(36).slice(2),
  };
}

/** 生成无三连的初始棋盘 */
function createInitialGrid(): Cell[][] {
  const grid: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      let type = TILES[Math.floor(Math.random() * TILES.length)];
      while (
        (c >= 2 && grid[r][c - 1]?.type === type && grid[r][c - 2]?.type === type) ||
        (r >= 2 && grid[r - 1]?.[c]?.type === type && grid[r - 2]?.[c]?.type === type)
      ) {
        type = TILES[Math.floor(Math.random() * TILES.length)];
      }
      grid[r][c] = createCell(type);
    }
  }
  return grid;
}

/** 查找所有三连及以上的匹配 */
function findMatches(grid: Cell[][]): Set<string> {
  const matched = new Set<string>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const type = cell.type;
      let hor = 1;
      while (c + hor < COLS && grid[r][c + hor]?.type === type) hor++;
      if (hor >= 3) for (let i = 0; i < hor; i++) matched.add(grid[r][c + i].id);
      let ver = 1;
      while (r + ver < ROWS && grid[r + ver]?.[c]?.type === type) ver++;
      if (ver >= 3) for (let i = 0; i < ver; i++) matched.add(grid[r + i][c].id);
    }
  }
  return matched;
}

/** 获取每个匹配格子的最大连数（用于四连/五连加分） */
function getMatchLengths(grid: Cell[][]): Map<string, number> {
  const len = new Map<string, number>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const type = cell.type;
      let hor = 1;
      while (c + hor < COLS && grid[r][c + hor]?.type === type) hor++;
      let ver = 1;
      while (r + ver < ROWS && grid[r + ver]?.[c]?.type === type) ver++;
      if (hor >= 3) {
        for (let i = 0; i < hor; i++) {
          const id = grid[r][c + i].id;
          len.set(id, Math.max(len.get(id) ?? 0, hor));
        }
      }
      if (ver >= 3) {
        for (let i = 0; i < ver; i++) {
          const id = grid[r + i][c].id;
          len.set(id, Math.max(len.get(id) ?? 0, ver));
        }
      }
    }
  }
  return len;
}

/** 计算消除得分（含四连五连加成） */
function calcMatchScore(matched: Set<string>, lengths: Map<string, number>, comboMult: number): number {
  let total = 0;
  matched.forEach((id) => {
    const L = lengths.get(id) ?? 3;
    let per = SCORE_PER_TILE;
    if (L >= 5) per += BONUS_5;
    else if (L >= 4) per += BONUS_4;
    total += Math.floor(per * comboMult);
  });
  return total;
}

/** 查找一个有效交换（交换后能形成三连） */
function findHint(grid: Cell[][]): { r1: number; c1: number; r2: number; c2: number } | null {
  const trySwap = (r1: number, c1: number, r2: number, c2: number): boolean => {
    const g = grid.map((row) => row.map((c) => ({ ...c })));
    [g[r1][c1], g[r2][c2]] = [g[r2][c2], g[r1][c1]];
    return findMatches(g).size > 0;
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && trySwap(r, c, r, c + 1)) return { r1: r, c1: c, r2: r, c2: c + 1 };
      if (r + 1 < ROWS && trySwap(r, c, r + 1, c)) return { r1: r, c1: c, r2: r + 1, c2: c };
    }
  }
  return null;
}

/** 洗牌：打乱棋盘，保证无三连 */
function shuffleGrid(grid: Cell[][]): Cell[][] {
  const flat = grid.flat().map((c) => c.type);
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }
  let idx = 0;
  let result = grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      type: flat[idx++],
      id: Math.random().toString(36).slice(2),
    }))
  );
  // 消除三连：三连中的格子与随机非三连格子交换类型，重复直到无三连
  for (let attempt = 0; attempt < 100; attempt++) {
    const m = findMatches(result);
    if (m.size === 0) break;
    const badCells: { r: number; c: number }[] = [];
    const goodCells: { r: number; c: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!result[r][c]) continue;
        if (m.has(result[r][c].id)) badCells.push({ r, c });
        else goodCells.push({ r, c });
      }
    }
    if (goodCells.length === 0) break;
    const bad = badCells[Math.floor(Math.random() * badCells.length)];
    const good = goodCells[Math.floor(Math.random() * goodCells.length)];
    const t = result[bad.r][bad.c].type;
    result[bad.r][bad.c] = { ...result[bad.r][bad.c], type: result[good.r][good.c].type };
    result[good.r][good.c] = { ...result[good.r][good.c], type: t };
  }
  return result;
}

/** 消除并下落、填充，返回新棋盘和消除数量 */
function eliminateAndDrop(grid: Cell[][]): { grid: Cell[][]; count: number } {
  const matched = findMatches(grid);
  if (matched.size === 0) return { grid, count: 0 };

  const newGrid: (Cell | null)[][] = grid.map((row) =>
    row.map((cell) => (matched.has(cell.id) ? null : { ...cell }))
  );

  // 下落
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newGrid[r][c]) {
        if (r !== write) {
          newGrid[write][c] = { ...newGrid[r][c]!, isFalling: true };
          newGrid[r][c] = null;
        }
        write--;
      }
    }
    while (write >= 0) {
      newGrid[write][c] = { ...createCell(), isFalling: true };
      write--;
    }
  }

  return {
    grid: newGrid as Cell[][],
    count: matched.size,
  };
}

const FruitMatchGame: React.FC<{
  nickname: string;
  passcode: string;
  onEnd: () => void;
  sessionTimeLeft: number | null;
}> = ({ nickname, passcode, onEnd, sessionTimeLeft }) => {
  const [grid, setGrid] = useState<Cell[][]>(() => createInitialGrid());
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameState, setGameState] = useState<'playing' | 'ended'>('playing');
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [battleMessage, setBattleMessage] = useState('游戏开始！');
  const [combo, setCombo] = useState(0);
  const [lastComboAt, setLastComboAt] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [matchFlash, setMatchFlash] = useState<Set<string>>(new Set());
  const [shuffleLeft, setShuffleLeft] = useState(SHUFFLE_LIMIT);
  const [hintCells, setHintCells] = useState<{ r: number; c: number }[]>([]);
  const [lastActionAt, setLastActionAt] = useState(Date.now());
  const [floatingScores, setFloatingScores] = useState<{ id: string; r: number; c: number; value: number; batchId?: number }[]>([]);
  const hasSavedOnEnd = useRef(false);

  const { livePlayers, isLive } = useLiveScores(passcode, nickname, score);

  const recordAction = useCallback(() => {
    setLastActionAt(Date.now());
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setGameState('ended');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(async () => {
      const msg = await generateGameContent(
        `生成一条简短的游戏实时战况播报，主角是"${nickname}"，语境是糖果世界。例如："${nickname} 连续消除了三块大白兔奶糖！"`,
        false
      );
      if (msg) setBattleMessage(msg);
    }, 15000);
    return () => clearInterval(interval);
  }, [nickname, gameState]);

  // 2 秒无操作自动提示
  useEffect(() => {
    if (gameState !== 'playing' || isAnimating) return;
    const t = setInterval(() => {
      if (Date.now() - lastActionAt >= HINT_IDLE_SECONDS * 1000) {
        const hint = findHint(grid);
        if (hint) {
          setHintCells([
            { r: hint.r1, c: hint.c1 },
            { r: hint.r2, c: hint.c2 },
          ]);
          setTimeout(() => setHintCells([]), 2000);
        }
        setLastActionAt(Date.now());
      }
    }, 500);
    return () => clearInterval(t);
  }, [gameState, isAnimating, lastActionAt, grid]);

  const runCascade = useCallback((currentGrid: Cell[][], comboLevel: number): Promise<void> => {
    return new Promise((resolve) => {
      const matched = findMatches(currentGrid);
      if (matched.size === 0) {
        resolve();
        return;
      }
      setMatchFlash(matched);
      const mult = 1 + comboLevel * COMBO_MULTIPLIER;
      const lengths = getMatchLengths(currentGrid);
      const addScore = calcMatchScore(matched, lengths, mult);
      setScore((s) => s + addScore);

      const fid = Date.now();
      const entries: { id: string; r: number; c: number; value: number; batchId: number }[] = [];
      matched.forEach((cellId) => {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (currentGrid[r][c]?.id === cellId) {
              const L = lengths.get(cellId) ?? 3;
              let per = SCORE_PER_TILE;
              if (L >= 5) per += BONUS_5;
              else if (L >= 4) per += BONUS_4;
              entries.push({ id: `fs-${fid}-${r}-${c}`, r, c, value: Math.floor(per * mult), batchId: fid });
              return;
            }
          }
        }
      });
      setFloatingScores((prev) => [...prev.slice(-20), ...entries]);
      setTimeout(() => setFloatingScores((prev) => prev.filter((f) => f.batchId !== fid)), 1200);

      // 先播放消除动画，再下落
      setTimeout(() => {
        setMatchFlash(new Set());
        const { grid: afterGrid } = eliminateAndDrop(currentGrid);
        setGrid(afterGrid);

        setTimeout(() => {
          const cleared = afterGrid.map((row) => row.map((c) => (c ? { ...c, isFalling: false } : c)));
          setGrid(cleared as Cell[][]);
          runCascade(cleared as Cell[][], comboLevel + 1).then(resolve);
        }, 350);
      }, 280);
    });
  }, []);

  const handleShuffle = useCallback(() => {
    if (shuffleLeft <= 0 || isAnimating || gameState !== 'playing') return;
    setShuffleLeft((s) => s - 1);
    recordAction();
    setHintCells([]);
    setGrid((g) => shuffleGrid(g));
  }, [shuffleLeft, isAnimating, gameState, recordAction]);

  const handleCellClick = (r: number, c: number) => {
    if (isAnimating || gameState !== 'playing') return;
    recordAction();
    setHintCells([]);

    if (!selected) {
      setSelected({ r, c });
      return;
    }

    const dr = Math.abs(selected.r - r);
    const dc = Math.abs(selected.c - c);
    if (dr + dc !== 1) {
      setSelected({ r, c });
      return;
    }

    setIsAnimating(true);
    const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
    const a = newGrid[selected.r][selected.c];
    const b = newGrid[r][c];
    newGrid[selected.r][selected.c] = { ...b, isSwapping: true };
    newGrid[r][c] = { ...a, isSwapping: true };
    setGrid(newGrid);
    setSelected(null);

    setTimeout(() => {
      const afterSwap = newGrid.map((row) => row.map((c) => (c ? { ...c, isSwapping: false } : c)));
      const matches = findMatches(afterSwap);
      if (matches.size === 0) {
        setGrid(grid);
        setIsAnimating(false);
        return;
      }
      const resetCombo = Date.now() - lastComboAt > 3000 ? 0 : combo;
      setCombo(resetCombo + 1);
      setLastComboAt(Date.now());
      runCascade(afterSwap, resetCombo).then(() => {
        setIsAnimating(false);
      });
    }, 250);
  };

  // 游戏结束时保存成绩 + 将前 3 名写入 admin 中奖记录（只执行一次）
  useEffect(() => {
    if (gameState !== 'ended' || hasSavedOnEnd.current) return;
    hasSavedOnEnd.current = true;

    const key = `ranking_${passcode.trim()}`;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ name: nickname, score, time: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list.sort((a: any, b: any) => b.score - a.score)));
    saveRankingToCloud(passcode, nickname, score);

    const run = async () => {
      const top3 = await getTopRankingsForLogs(passcode, 3, { name: nickname, score });
      if (top3.length === 0) return;
      const gifts: { name: string }[] = JSON.parse(localStorage.getItem('app_gifts') || '[]');
      const defaultGifts = ['超级巨无霸甜品', '糖果礼物 2', '糖果礼物 3'];
      const logs: { nickname: string; passcode: string; giftName: string; timestamp: string; score: number }[] =
        JSON.parse(localStorage.getItem('app_logs') || '[]');
      const roomKey = passcode.trim();
      const filtered = logs.filter((l) => l.passcode !== roomKey);
      const now = new Date().toLocaleString();
      top3.forEach((entry, i) => {
        const giftName = gifts[i]?.name ?? defaultGifts[i] ?? `第${i + 1}名`;
        filtered.push({
          nickname: entry.name,
          passcode: roomKey,
          giftName,
          timestamp: now,
          score: entry.score,
        });
      });
      localStorage.setItem('app_logs', JSON.stringify(filtered));
      await saveTop3ToAdminCloud(passcode, top3, gifts);
    };
    run();
  }, [gameState, passcode, nickname, score]);

  if (gameState === 'ended') {
    return (
      <div className="glass-panel p-10 rounded-3xl text-center">
        <h2 className="text-4xl font-bold candy-text mb-6">本局得分: {score}</h2>
        <button onClick={onEnd} className="bubble-btn px-10 py-4 bg-pink-400 text-white rounded-full font-bold">
          返回大厅查看排名
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl p-4">
      <style>{`
        @keyframes candy-pop {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.9; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes candy-drop {
          0% { transform: translateY(-100%); opacity: 0.5; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes candy-swap {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes match-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 107, 149, 0.6); }
          50% { box-shadow: 0 0 12px 4px rgba(255, 107, 149, 0.9); }
        }
        @keyframes combo-burst {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes hint-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.8); }
          50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.5); }
        }
        @keyframes float-score {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-40px) scale(1.2); opacity: 0; }
        }
        .tile-matched { animation: candy-pop 0.3s ease-out forwards; }
        .tile-hint { animation: hint-pulse 0.8s ease-in-out infinite; }
        .float-score { animation: float-score 1s ease-out forwards; }
        .tile-falling { animation: candy-drop 0.35s ease-out; }
        .tile-swapping { animation: candy-swap 0.25s ease-out; }
        .tile-glow { animation: match-glow 0.2s ease-out; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 w-full font-bold text-pink-600 bg-white/80 p-4 rounded-2xl shadow-sm">
        <span>分数: {score}</span>
        {combo > 0 && <span className="text-amber-500 animate-pulse">连击 x{combo + 1} 🔥</span>}
        <button
          onClick={handleShuffle}
          disabled={shuffleLeft <= 0 || isAnimating}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
            shuffleLeft > 0 && !isAnimating
              ? 'bg-violet-400 text-white hover:bg-violet-500 shadow-md'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title={`洗牌 (剩余 ${shuffleLeft} 次)`}
        >
          🔀 洗牌 {shuffleLeft}/3
        </button>
        <span className="text-rose-500">倒计时: {timeLeft}s</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        <div className="relative flex-1">
          <div className="relative grid grid-cols-8 gap-1.5 sm:gap-2 bg-gradient-to-br from-pink-200 to-rose-200 p-3 sm:p-4 rounded-3xl border-4 border-white shadow-xl candy-board">
          {grid.map((row, r) =>
            row.map((cell, c) => {
              if (!cell) return null;
              const isSelected = selected?.r === r && selected?.c === c;
              const isMatched = matchFlash.has(cell.id);
              const isHinted = hintCells.some((h) => h.r === r && h.c === c);
              return (
                <div
                  key={cell.id}
                  onClick={() => handleCellClick(r, c)}
                  className={`
                    w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl cursor-pointer text-xl sm:text-2xl
                    transition-all duration-150 select-none
                    bg-white/90 shadow-md hover:shadow-lg
                    ${isSelected ? 'ring-4 ring-pink-400 scale-110 z-10 shadow-xl' : ''}
                    ${isMatched ? 'tile-matched z-20 pointer-events-none' : ''}
                    ${isHinted ? 'tile-hint ring-2 ring-green-400 z-[5]' : ''}
                    ${cell.isSwapping ? 'tile-swapping' : ''}
                    ${cell.isFalling ? 'tile-falling' : ''}
                  `}
                >
                  {cell.type}
                </div>
              );
            })
          )}
          </div>
          <div
            className="absolute inset-0 grid grid-cols-8 grid-rows-8 gap-1.5 sm:gap-2 p-3 sm:p-4 pointer-events-none z-30"
            style={{ borderRadius: 'inherit' }}
          >
            {floatingScores.map((f) => (
              <div
                key={f.id}
                className="float-score flex items-center justify-center text-lg sm:text-xl font-black text-green-500"
                style={{
                  gridColumn: f.c + 1,
                  gridRow: f.r + 1,
                  textShadow: '0 0 4px white, 0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                +{f.value}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-64 bg-white/90 p-6 rounded-3xl border-2 border-pink-100 shadow-md">
          <h3 className="text-sky-500 font-bold mb-4 flex items-center gap-2">📊 实时榜单</h3>
          <div className="space-y-3">
            {livePlayers.map((p, i) => (
              <div
                key={i}
                className={`flex justify-between items-center p-2 rounded-lg ${p.isMe ? 'bg-pink-100 border border-pink-300' : 'bg-gray-50'}`}
              >
                <span className={`text-sm ${p.isMe ? 'font-bold text-pink-600' : 'text-gray-600'}`}>
                  {i + 1}. {p.name}
                </span>
                <span className="font-mono text-xs font-black">{p.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[10px] text-pink-400 font-bold bg-pink-50 p-2 rounded-lg animate-pulse">
            📢 {battleMessage}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FruitMatchGame;
