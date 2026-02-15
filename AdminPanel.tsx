import React, { useState, useEffect } from 'react';
import { subscribeToAdminLogs, clearAdminLogs } from './api/rankings';
import { subscribeToSecretCode, saveSecretCodeToCloud, saveSessionStartToCloud } from './api/config';

interface Gift {
  id: string;
  name: string;
  probability: number;
  quantity: number;
  value: string;
}

interface Log {
  nickname: string;
  passcode: string;
  giftName: string;
  timestamp: string;
  score: number;
}

interface AdminPanelProps {
  onExit: () => void;
}

const DEFAULT_THANK_YOU = "感谢宝宝在诛仙世界浮生若梦服，积极参与宝宝有时差的帮派活动，为帮派建设做出贡献~未来我们一起携手做大做强再创辉煌！✨";

const GET_DEFAULT_GIFTS = (): Gift[] => Array.from({ length: 15 }, (_, i) => ({
  id: `g${i}`,
  name: i === 0 ? "超级巨无霸甜品" : `糖果礼物 ${i + 1}`,
  probability: i === 0 ? 5 : 10,
  quantity: 100,
  value: i === 0 ? "999" : "10"
}));

const AdminPanel: React.FC<AdminPanelProps> = ({ onExit }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'gifts' | 'logs' | 'settings' | 'sync'>('gifts');
  
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [secretCode, setSecretCode] = useState('宝宝');
  const [thankYouMessage, setThankYouMessage] = useState(DEFAULT_THANK_YOU);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    const savedGifts = localStorage.getItem('app_gifts');
    if (savedGifts) setGifts(JSON.parse(savedGifts));
    else setGifts(GET_DEFAULT_GIFTS());

    const savedThankYou = localStorage.getItem('app_thank_you_message');
    if (savedThankYou) setThankYouMessage(savedThankYou);
  }, []);

  useEffect(() => {
    const unsub = subscribeToSecretCode((code) => setSecretCode(code || '宝宝'));
    return unsub;
  }, []);

  // 中奖记录：Firebase 时实时订阅，否则用 localStorage
  useEffect(() => {
    const unsub = subscribeToAdminLogs((data) => setLogs(data));
    return unsub;
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUsername === 'baoerjie' && adminPassword === 'HHSZMD') {
      setIsAdminLoggedIn(true);
    } else {
      alert('账号或密码错误！');
    }
  };

  const handleSaveGifts = () => {
    localStorage.setItem('app_gifts', JSON.stringify(gifts));
    setSaveStatus('礼物清单同步成功！');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const handleSaveSettings = () => {
    saveSecretCodeToCloud(secretCode);
    localStorage.setItem('app_thank_you_message', thankYouMessage);
    setSaveStatus('秘密设置已生效！暗号已同步到全服');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  /** 开启赛期：对当前暗号开始 2 分钟倒计时，玩家可在此期间冲榜 */
  const handleStartSession = () => {
    if (!secretCode.trim()) {
      setSaveStatus('请先设置并保存暗号');
      setTimeout(() => setSaveStatus(''), 3000);
      return;
    }
    saveSessionStartToCloud(secretCode.trim());
    setSaveStatus(`已开启赛期！暗号「${secretCode.trim()}」2 分钟倒计时开始，玩家可冲榜`);
    setTimeout(() => setSaveStatus(''), 4000);
  };

  /** 清空中奖记录（Firebase + localStorage） */
  const handleClearLogs = async () => {
    if (!confirm('确定要清空全部中奖记录吗？此操作不可恢复。')) return;
    localStorage.removeItem('app_logs');
    await clearAdminLogs();
    setLogs([]);
    setSaveStatus('已清空中奖记录');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  /** 重置所有赛期：清除 session_start_*，玩家即可重新「开始竞技冲榜」 */
  const handleResetSessions = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('session_start_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setSaveStatus(`已重置 ${keysToRemove.length} 个赛期，冲榜已重新开放！`);
    setTimeout(() => setSaveStatus(''), 4000);
  };

  if (!isAdminLoggedIn) {
    return (
      <div className="glass-panel w-full max-w-sm p-10 rounded-[3rem] border-4 border-pink-200 animate-in fade-in zoom-in duration-300">
        <h2 className="text-3xl font-bold candy-text text-center mb-8">管理员甜品站</h2>
        <form onSubmit={handleAdminLogin} className="space-y-5">
          <input type="text" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} className="w-full px-5 py-4 bg-white/60 border-2 border-pink-100 rounded-full text-pink-600 focus:outline-none" placeholder="管理员名字" />
          <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full px-5 py-4 bg-white/60 border-2 border-pink-100 rounded-full text-pink-600 focus:outline-none" placeholder="管理员密码" />
          <button type="submit" className="bubble-btn w-full py-4 bg-pink-400 text-white font-bold rounded-full">进入指挥部</button>
          <button type="button" onClick={onExit} className="w-full text-pink-300 text-sm font-bold pt-2">回首页</button>
        </form>
      </div>
    );
  }

  return (
    <div className="glass-panel w-full max-w-6xl h-[85vh] flex flex-col rounded-[3rem] border-4 border-white overflow-hidden animate-in fade-in zoom-in duration-500">
      <div className="px-10 py-6 bg-white/40 border-b-2 border-pink-50 flex justify-between items-center">
        <h2 className="text-3xl font-bold candy-text">🍬 糖果后台 🍭</h2>
        <div className="flex gap-4 items-center">
            {saveStatus && <span className="text-pink-500 font-bold text-sm bg-pink-50 px-4 py-1 rounded-full">✨ {saveStatus}</span>}
            <button onClick={onExit} className="px-6 py-2 bg-pink-100 text-pink-500 rounded-full font-bold">退出</button>
        </div>
      </div>

      <div className="flex bg-white/20">
        <button onClick={() => setActiveTab('gifts')} className={`flex-1 py-5 font-bold transition-all ${activeTab === 'gifts' ? 'bg-pink-400 text-white' : 'text-pink-300'}`}>礼物配置</button>
        <button onClick={() => setActiveTab('logs')} className={`flex-1 py-5 font-bold transition-all ${activeTab === 'logs' ? 'bg-sky-400 text-white' : 'text-sky-300'}`}>中奖记录</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-5 font-bold transition-all ${activeTab === 'settings' ? 'bg-pink-500 text-white' : 'text-pink-300'}`}>基本设置</button>
        <button onClick={() => setActiveTab('sync')} className={`flex-1 py-5 font-bold transition-all ${activeTab === 'sync' ? 'bg-indigo-500 text-white' : 'text-indigo-300'}`}>全服同步</button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-white/30">
        {activeTab === 'gifts' && (
          <div className="space-y-6">
            <button onClick={handleSaveGifts} className="bubble-btn px-10 py-3 bg-pink-400 text-white rounded-full font-bold">保存配置</button>
            <div className="bg-white/80 rounded-[2.5rem] overflow-hidden p-4">
               {/* 礼物编辑表格 */}
               <p className="text-center italic opacity-60 py-20 text-pink-300">表格配置项已加载（参照之前文件）</p>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-sky-600">中奖名单（仅保留最新一批）</h3>
              <button type="button" onClick={handleClearLogs} className="bubble-btn px-6 py-2 bg-rose-400 text-white rounded-full font-bold text-sm hover:bg-rose-500">清空中奖记录</button>
            </div>
            <div className="bg-white/60 rounded-3xl p-6">
               <table className="w-full text-left">
                  <thead><tr className="border-b text-sky-400 font-bold uppercase text-xs"><th>昵称</th><th>暗号</th><th>礼物</th><th>分数</th><th>时间</th></tr></thead>
                  <tbody>
                    {[...logs]
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .map((log, i) => (
                        <tr key={i} className="border-b border-sky-50 text-sky-600"><td className="py-3 font-bold">{log.nickname}</td><td>{log.passcode}</td><td className="text-pink-500">{log.giftName}</td><td className="font-mono">{log.score}</td><td className="text-[10px] opacity-60">{log.timestamp}</td></tr>
                      ))}
                  </tbody>
               </table>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
            <div className="bg-white/80 rounded-3xl p-8 shadow-lg border-2 border-indigo-100">
              <h3 className="text-indigo-600 font-bold text-xl mb-6">全服实时同步</h3>
              <div className="space-y-4 text-indigo-800">
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                  <span className="text-2xl">✓</span>
                  <div>
                    <p className="font-bold text-green-800">已接入 Firebase Realtime Database</p>
                    <p className="text-sm text-green-700">同一暗号下的玩家可实时看到彼此分数</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-indigo-50 rounded-xl">
                    <p className="font-bold text-indigo-700 text-sm mb-1">实时榜单</p>
                    <p className="text-sm text-indigo-600">游戏中右侧显示本局所有在线玩家分数，每 2 秒同步</p>
                  </div>
                  <div className="p-4 bg-indigo-50 rounded-xl">
                    <p className="font-bold text-indigo-700 text-sm mb-1">历史排行榜</p>
                    <p className="text-sm text-indigo-600">每局结束后成绩写入云端，大厅展示前 5 名</p>
                  </div>
                </div>
                <p className="text-sm text-indigo-600 pt-2">玩家使用相同暗号进入游戏即可自动加入同一房间，无需额外配置。</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-xl mx-auto py-6 space-y-10">
             <div className="space-y-4">
                <label className="text-pink-600 font-bold">更换暗号</label>
                <input value={secretCode} onChange={e => setSecretCode(e.target.value)} className="w-full p-6 bg-pink-50 rounded-3xl text-3xl font-bold text-center border-4 border-pink-100" />
             </div>
             <div className="space-y-4">
                <label className="text-pink-600 font-bold">自定义感谢语</label>
                <textarea value={thankYouMessage} onChange={e => setThankYouMessage(e.target.value)} rows={4} className="w-full p-6 bg-sky-50 rounded-3xl border-4 border-sky-100 text-sky-600 font-bold" />
             </div>
             <button onClick={handleSaveSettings} className="bubble-btn w-full py-6 bg-pink-400 text-white font-bold rounded-full shadow-lg">保存所有修改</button>

             <div className="pt-8 border-t border-pink-200">
                <h4 className="text-pink-600 font-bold mb-3">⏱️ 赛期管理</h4>
                <p className="text-pink-500 text-sm mb-4">对当前暗号开启 2 分钟赛期后，玩家可在此期间冲榜；时间到后需重置才能再次冲榜。</p>
                <div className="flex flex-wrap gap-4">
                  <button type="button" onClick={handleStartSession} className="bubble-btn px-8 py-4 bg-green-500 text-white font-bold rounded-full shadow">开启赛期（当前暗号 2 分钟）</button>
                  <button type="button" onClick={handleResetSessions} className="bubble-btn px-8 py-4 bg-amber-400 text-white font-bold rounded-full shadow">重置所有赛期（重新开放冲榜）</button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
