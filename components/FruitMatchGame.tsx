
import React, { useState, useEffect } from 'react';
import { useLiveScores } from '../api/liveScores';
import { generateGameContent } from '../api/gemini';
import { saveRankingToCloud } from '../api/rankings';

const TILES = ['🍬', '🍭', '🧁', '🍮', '🍩', '🍫', '🥯', '🥞'];
const ROWS = 8;
const COLS = 8;
const GAME_DURATION = 90;

interface Cell { type: string; id: string; }

const FruitMatchGame: React.FC<{ nickname: string; passcode: string; onEnd: () => void; sessionTimeLeft: number | null }> = ({ nickname, passcode, onEnd, sessionTimeLeft }) => {
  const [grid, setGrid] = useState<(Cell | null)[][]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameState, setGameState] = useState<'playing' | 'ended'>('playing');
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [battleMessage, setBattleMessage] = useState('游戏开始！');
  
  const { livePlayers, isLive } = useLiveScores(passcode, nickname, score);

  // 初始化棋盘
  useEffect(() => {
    const newGrid = Array.from({ length: ROWS }, (_, r) => 
      Array.from({ length: COLS }, (_, c) => ({
        type: TILES[Math.floor(Math.random() * TILES.length)],
        id: `${r}-${c}-${Math.random()}`
      }))
    );
    setGrid(newGrid);
  }, []);

  // 倒计时
  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('ended');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  // AI 战况播报
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(async () => {
       const msg = await generateGameContent(`生成一条简短的游戏实时战况播报，主角是"${nickname}"，语境是糖果世界。例如："${nickname} 连续消除了三块大白兔奶糖！"`, false);
       if (msg) setBattleMessage(msg);
    }, 15000);
    return () => clearInterval(interval);
  }, [nickname, gameState]);

  const handleCellClick = (r: number, c: number) => {
    if (!selected) {
      setSelected({ r, c });
      return;
    }
    // 这里实现交换逻辑... (简化处理，直接加分模拟)
    const dist = Math.abs(selected.r - r) + Math.abs(selected.c - c);
    if (dist === 1) {
      setScore(s => s + 30);
      // 模拟消除动画
      const newGrid = [...grid];
      newGrid[r][c] = { type: TILES[Math.floor(Math.random() * TILES.length)], id: Math.random().toString() };
      newGrid[selected.r][selected.c] = { type: TILES[Math.floor(Math.random() * TILES.length)], id: Math.random().toString() };
      setGrid(newGrid);
    }
    setSelected(null);
  };

  if (gameState === 'ended') {
    // 本地存储（兼容无 Firebase 场景）
    const key = `ranking_${passcode}`;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ name: nickname, score, time: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list.sort((a: any, b: any) => b.score - a.score)));
    // 云端同步（多人线上竞技）
    saveRankingToCloud(passcode, nickname, score);
    
    return (
      <div className="glass-panel p-10 rounded-3xl text-center">
        <h2 className="text-4xl font-bold candy-text mb-6">本局得分: {score}</h2>
        <button onClick={onEnd} className="bubble-btn px-10 py-4 bg-pink-400 text-white rounded-full font-bold">返回大厅查看排名</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl p-4">
      <div className="flex justify-between w-full font-bold text-pink-600 bg-white/80 p-4 rounded-2xl shadow-sm">
        <span>分数: {score}</span>
        <span className="text-rose-500">倒计时: {timeLeft}s</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full">
        {/* 游戏棋盘 */}
        <div className="grid grid-cols-8 gap-2 bg-pink-200/50 p-4 rounded-3xl border-4 border-white shadow-xl flex-1">
          {grid.map((row, r) => row.map((cell, c) => (
            <div 
              key={cell?.id} 
              onClick={() => handleCellClick(r, c)}
              className={`w-10 h-10 flex items-center justify-center bg-white rounded-xl cursor-pointer text-2xl transition-all shadow-sm
                ${selected?.r === r && selected?.c === c ? 'scale-110 border-4 border-pink-400 ring-4 ring-pink-200' : 'hover:scale-105'}`}
            >
              {cell?.type}
            </div>
          )))}
        </div>

        {/* 侧边栏：实时排名 */}
        <div className="w-full lg:w-64 bg-white/90 p-6 rounded-3xl border-2 border-pink-100 shadow-md">
          <h3 className="text-sky-500 font-bold mb-4 flex items-center gap-2">📊 实时榜单</h3>
          <div className="space-y-3">
            {livePlayers.map((p, i) => (
              <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${p.isMe ? 'bg-pink-100 border border-pink-300' : 'bg-gray-50'}`}>
                <span className={`text-sm ${p.isMe ? 'font-bold text-pink-600' : 'text-gray-600'}`}>{i + 1}. {p.name}</span>
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
