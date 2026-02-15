import React, { useEffect, useState } from 'react';
// Fix path to point to the correct api directory from root
import { geminiProxy } from './api/gemini';

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
    const key = `ranking_${passcode}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      setRankList([]);
      setMyBest(null);
      return;
    }
    const list: { name: string; score: number; timestamp: string }[] = JSON.parse(raw);
    const sorted = [...list].sort((a, b) => b.score - a.score);
    setRankList(sorted.slice(0, 10).map(({ name, score }) => ({ name, score })));
    const myEntries = list.filter((e: { name: string }) => e.name === nickname);
    const best = myEntries.length ? Math.max(...myEntries.map((e: { score: number }) => e.score)) : null;
    setMyBest(best);
  }, [passcode, nickname]);

  useEffect(() => {
    const fetchGreeting = async () => {
      try {
        const response = await geminiProxy({
          contents: `你是一个可爱糖果世界的引导者。现在有一位名叫 "${nickname}" 的小可爱登录了游戏，正在参加一场帮派活动。请写一段简短、甜美、可爱且个性化的欢迎辞。Mention: "竞技前三才有奖"。`,
          temperature: 0.9,
        });
        // Access .text property directly
        setAiMessage(response.text || '欢呼！最甜的宝宝回来啦！');
      } catch (err) {
        setAiMessage(`呀！欢迎 ${nickname} 回到糖果屋！只有积分排名前三的宝宝才能拿走礼物哦，快快冲鸭！`);
      }
    };

    fetchGreeting();
  }, [nickname]);

  const isSessionOver = sessionTimeLeft !== null && sessionTimeLeft <= 0;

  return (
    <div className="glass-panel max-w-2xl w-full p-12 rounded-[4rem] text-center border-4 border-white/60 animate-in fade-in zoom-in duration-700">
      <div className="relative mb-8">
        <div className="w-32 h-32 mx-auto rounded-[2rem] border-4 border-pink-300 p-2 shadow-xl bg-white rotate-3 overflow-hidden mb-6">
            <img 
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}&backgroundColor=ffdfbf`} 
                alt="Avatar" 
                className="w-full h-full object-cover"
            />
        </div>
        <h2 className="text-4xl font-bold candy-text mb-3">你好，<span className="text-sky-500">{nickname}</span></h2>

        {passcode === '测试' && (
          <div className="mt-2 py-1 px-4 rounded-full text-xs font-bold bg-sky-100 text-sky-600">🧪 测试暗号 · 无赛期限制，可重复冲榜</div>
        )}
        
        {sessionTimeLeft !== null && (
          <div className="mt-2 flex flex-col items-center gap-1">
            <div className={`py-1 px-4 rounded-full font-bold text-sm ${isSessionOver ? 'bg-rose-500 text-white' : 'bg-yellow-400 text-white animate-pulse'}`}>
              {isSessionOver ? "🏁 本轮赛期已截止" : `⏱️ 赛期结算倒计时: ${sessionTimeLeft}s`}
            </div>
            {isSessionOver && (
              <p className="text-xs text-pink-400">管理员可在后台「基本设置」→ 重置赛期 重新开放</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white/40 p-8 rounded-[2rem] text-pink-600 leading-relaxed text-xl font-medium mb-6 border-2 border-pink-50 shadow-inner">
        " {aiMessage} "
      </div>

      {/* 排名系统 */}
      <div className="w-full max-w-md mx-auto mb-8">
        <div className="bg-white/60 rounded-2xl p-4 border-2 border-pink-100 shadow-inner">
          <h3 className="text-pink-500 font-bold mb-3 flex items-center gap-2">🏆 本暗号排行榜</h3>
          {myBest !== null && (
            <p className="text-sm text-pink-600 font-bold mb-2">我的最佳：<span className="font-mono text-pink-700">{myBest}</span> 分</p>
          )}
          {rankList.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {rankList.map((r, i) => (
                <div
                  key={`${r.name}-${i}`}
                  className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-sm ${r.name === nickname ? 'bg-pink-400 text-white' : 'bg-pink-50 text-pink-700'}`}
                >
                  <span className="font-bold">#{i + 1} {r.name}</span>
                  <span className="font-mono font-black">{r.score}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-pink-400 text-sm">暂无记录，快来打一局冲榜吧～</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 max-w-xs mx-auto">
        {passcode !== '测试' && (hasPlayed || isSessionOver) ? (
          <div className="py-5 bg-gray-100 text-gray-400 rounded-full font-bold text-xl border-2 border-dashed border-gray-200">
            {isSessionOver ? "本轮已结束 ⏳" : "今日挑战已完成 ✨"}
          </div>
        ) : (
          <button 
            onClick={onStartGame}
            className="bubble-btn w-full py-5 bg-gradient-to-r from-sky-400 to-blue-400 text-white rounded-full shadow-lg shadow-sky-200/50 font-bold text-2xl tracking-widest"
          >
            开始竞技冲榜
          </button>
        )}
        <button 
          onClick={onLogout}
          className="w-full py-4 text-pink-400 font-bold hover:text-pink-600 transition-colors"
        >
          登出账号
        </button>
      </div>

      <p className="mt-8 text-pink-300 text-sm font-bold">
        {isSessionOver ? "正在进行强制统计中，前三名宝宝将获得奖励！" : "糖果屋竞技场：一次机会，赢取前三！"}
      </p>
    </div>
  );
};

export default Dashboard;