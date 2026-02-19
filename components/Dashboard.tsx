import React, { useEffect, useState } from 'react';
import { generateGameContent } from '../api/gemini';
import { subscribeToRankings, getLocalRankings } from '../api/rankings';
import { getSessionStartTs } from '../api/config';
import { isFirebaseConfigured } from '../api/firebase';

interface DashboardProps {
  nickname: string;
  passcode: string;
  onLogout: () => void;
  onStartGame: () => void;
  hasPlayed: boolean;
  sessionTimeLeft: number | null;
}

const Dashboard: React.FC<DashboardProps> = ({ nickname, passcode, onLogout, onStartGame, hasPlayed, sessionTimeLeft }) => {
  const [aiMessage, setAiMessage] = useState('小仙女/小王子正在准备中...');
  const [rankList, setRankList] = useState<{ name: string; score: number }[]>([]);
  const [myBest, setMyBest] = useState<number | null>(null);

  useEffect(() => {
    let sessionStartTs: number | undefined;
    const setup = async () => {
      sessionStartTs = await getSessionStartTs(passcode);
      if (isFirebaseConfigured()) {
        return subscribeToRankings(passcode, (list) => {
          const slice = list.slice(0, 20);
          setRankList(slice.map((e) => ({ name: e.name, score: e.score })));
          const myEntries = list.filter((e) => e.name === nickname);
          if (myEntries.length) setMyBest(Math.max(...myEntries.map((e) => e.score)));
        }, sessionStartTs);
      }
      const list = getLocalRankings(passcode);
      const filtered = sessionStartTs != null && sessionStartTs > 0
        ? list.filter((e) => e.time && new Date(e.time).getTime() >= sessionStartTs!)
        : list;
      const byName = new Map<string, number>();
      filtered.forEach((e) => {
        const cur = byName.get(e.name);
        if (cur === undefined || e.score > cur) byName.set(e.name, e.score);
      });
      const sorted = [...byName.entries()].map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score).slice(0, 20);
      setRankList(sorted);
      const myEntries = sorted.filter((e) => e.name === nickname);
      if (myEntries.length) setMyBest(myEntries[0].score);
      return () => {};
    };
    let unsub = () => {};
    setup().then((fn) => { unsub = fn; });
    return () => unsub();
  }, [passcode, nickname]);

  useEffect(() => {
    const fetchGreeting = async () => {
      const prompt = `你是一个可爱糖果世界的引导者。现在有一位名叫 "${nickname}" 的玩家登录了。请写一段简短、甜美、激励性的欢迎辞。字数在30字以内。提到：“只有竞技前三名（含并列第三）才有神秘礼盒哦”。`;
      const text = await generateGameContent(prompt);
      setAiMessage(text || `欢迎 ${nickname} 回到糖果屋！积分前三名（含并列第三）的宝宝才能抽礼盒哦，快快冲鸭！`);
    };
    fetchGreeting();
  }, [nickname]);

  const isSessionOver = sessionTimeLeft !== null && sessionTimeLeft <= 0;

  return (
    <div className="glass-panel max-w-2xl w-full p-10 rounded-[4rem] text-center border-4 border-white animate-in fade-in zoom-in duration-700">
      <div className="relative mb-8 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl border-4 border-pink-300 p-1 bg-white shadow-lg rotate-3 overflow-hidden mb-4">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`} alt="Avatar" className="w-full h-full" />
        </div>
        <h2 className="text-3xl font-bold candy-text">你好，<span className="text-sky-500">{nickname}</span></h2>
        
        {sessionTimeLeft !== null && (
          <div className={`mt-3 px-4 py-1 rounded-full text-sm font-bold ${isSessionOver ? 'bg-rose-500 text-white' : 'bg-yellow-400 text-white animate-pulse'}`}>
            {isSessionOver ? "🏁 赛期已截止" : `⏱️ 结算倒计时: ${sessionTimeLeft}s`}
          </div>
        )}
      </div>

      <div className="bg-white/50 p-6 rounded-3xl text-pink-600 font-medium mb-8 border-2 border-pink-50 shadow-inner italic">
        "{aiMessage}"
      </div>

      <div className="mb-8 bg-white/40 p-5 rounded-3xl border-2 border-pink-100">
        <h3 className="text-pink-500 font-bold mb-3 flex items-center justify-center gap-2">🏆 得分表（本赛期）</h3>
        {rankList.length > 0 ? (
          <div className="space-y-2">
            {rankList.map((r, i) => (
              <div key={i} className={`flex justify-between px-4 py-2 rounded-xl text-sm ${r.name === nickname ? 'bg-pink-400 text-white' : 'bg-pink-50 text-pink-700'}`}>
                <span>#{i + 1} {r.name}</span>
                <span className="font-bold">{r.score}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-pink-300 text-sm">暂无记录，快来开一局吧！</p>}
      </div>

      <div className="flex flex-col gap-4">
        {(hasPlayed || isSessionOver) && passcode !== '测试' ? (
          <div className="py-4 bg-gray-100 text-gray-400 rounded-full font-bold border-2 border-dashed">今日挑战已完成 ✨</div>
        ) : (
          <button onClick={onStartGame} className="bubble-btn w-full py-5 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-full font-bold text-xl shadow-lg">开始竞技冲榜</button>
        )}
        <button onClick={onLogout} className="text-pink-400 font-bold hover:text-pink-600 transition-colors">登出账号</button>
      </div>
    </div>
  );
};

export default Dashboard;
