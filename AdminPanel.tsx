import React, { useState, useEffect, useRef } from 'react';
import { subscribeToAdminLogs, clearAdminLogs, getSessionTimeLeft, mergePendingToAdminLogs, fetchAdminLogs } from './api/rankings';
import { subscribeToSecretCode, saveSecretCodeToCloud, saveSessionStartToCloud, subscribeToGifts, saveGiftsToCloud, subscribeToAppearance, saveAppearanceToCloud, type AppearanceConfig } from './api/config';
import { cropImageToSquare } from './utils/imageCrop';

interface Gift {
  id: string;
  name: string;
  probability: number;
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

const GET_DEFAULT_GIFTS = (): Gift[] => Array.from({ length: 8 }, (_, i) => ({
  id: `g${i}`,
  name: i === 0 ? "超级巨无霸甜品" : `糖果礼物 ${i + 1}`,
  probability: i < 4 ? 12 : 13,
}));

const AdminPanel: React.FC<AdminPanelProps> = ({ onExit }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'gifts' | 'logs' | 'settings' | 'sync' | 'appearance'>('gifts');
  
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [secretCode, setSecretCode] = useState('宝宝');
  const [thankYouMessage, setThankYouMessage] = useState(DEFAULT_THANK_YOU);
  const [saveStatus, setSaveStatus] = useState('');
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);
  const [appearance, setAppearance] = useState<AppearanceConfig>({ backgroundUrl: '', tileImages: [], endMusicUrl: '', logoUrl: '' });
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const tileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const unsub = subscribeToGifts((data) => setGifts(data));
    return unsub;
  }, []);

  useEffect(() => {
    const savedThankYou = localStorage.getItem('app_thank_you_message');
    if (savedThankYou) setThankYouMessage(savedThankYou);
  }, []);

  useEffect(() => {
    const unsub = subscribeToSecretCode((code) => setSecretCode(code || '宝宝'));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAdminLogs((data) => setLogs(data));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAppearance((cfg) => setAppearance(cfg));
    return unsub;
  }, []);

  useEffect(() => {
    if (activeTab !== 'logs') return;
    const tick = () => {
      const left = getSessionTimeLeft(secretCode);
      setSessionTimeLeft(left);
      if (left === 0) mergePendingToAdminLogs(secretCode).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeTab, secretCode]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUsername === 'baoerjie' && adminPassword === 'HHSZMD') {
      setIsAdminLoggedIn(true);
    } else {
      alert('账号或密码错误！');
    }
  };

  const handleSaveGifts = () => {
    const sum = gifts.reduce((s, g) => s + (Number(g.probability) || 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      setSaveStatus(`概率总和必须为 100%，当前为 ${sum}%`);
      setTimeout(() => setSaveStatus(''), 4000);
      return;
    }
    try {
      saveGiftsToCloud(gifts);
      setSaveStatus('礼物清单已保存并同步到全服');
    } catch (e) {
      setSaveStatus(e instanceof Error ? e.message : '保存失败');
    }
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

  const handleSaveAppearance = () => {
    saveAppearanceToCloud(appearance);
    setSaveStatus('外观音效已保存并同步到全服');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const handleTileUpload = async (index: number, file: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    try {
      const dataUrl = await cropImageToSquare(file, 128);
      const next = [...(appearance.tileImages || [])];
      while (next.length <= index) next.push('');
      next[index] = dataUrl;
      setAppearance({ ...appearance, tileImages: next });
      setSaveStatus(`图标 ${index + 1} 已裁剪为正方形`);
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      alert('图片处理失败，请重试');
    }
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('请选择图片或动图（支持 GIF）');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAppearance({ ...appearance, logoUrl: dataUrl });
      setSaveStatus('顶部图标已更新（支持 GIF 动图）');
      setTimeout(() => setSaveStatus(''), 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveTile = (index: number) => {
    const next = [...(appearance.tileImages || [])];
    next[index] = '';
    setAppearance({ ...appearance, tileImages: next });
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

      <div className="flex bg-white/20 flex-wrap">
        <button onClick={() => setActiveTab('gifts')} className={`flex-1 min-w-[80px] py-5 font-bold transition-all ${activeTab === 'gifts' ? 'bg-pink-400 text-white' : 'text-pink-300'}`}>礼物配置</button>
        <button onClick={() => setActiveTab('logs')} className={`flex-1 min-w-[80px] py-5 font-bold transition-all ${activeTab === 'logs' ? 'bg-sky-400 text-white' : 'text-sky-300'}`}>中奖记录</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 min-w-[80px] py-5 font-bold transition-all ${activeTab === 'settings' ? 'bg-pink-500 text-white' : 'text-pink-300'}`}>基本设置</button>
        <button onClick={() => setActiveTab('appearance')} className={`flex-1 min-w-[80px] py-5 font-bold transition-all ${activeTab === 'appearance' ? 'bg-violet-500 text-white' : 'text-violet-300'}`}>外观音效</button>
        <button onClick={() => setActiveTab('sync')} className={`flex-1 min-w-[80px] py-5 font-bold transition-all ${activeTab === 'sync' ? 'bg-indigo-500 text-white' : 'text-indigo-300'}`}>全服同步</button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-white/30">
        {activeTab === 'gifts' && (
          <div className="space-y-6 max-w-2xl">
            <p className="text-pink-600 font-bold">8 个礼物选项，前三名抽奖转盘从中抽取。每个礼物的概率（%）总和必须为 100。</p>
            <div className="space-y-3">
              {gifts.map((gift, i) => (
                <div key={gift.id} className="flex items-center gap-4 flex-wrap">
                  <span className="w-8 text-pink-500 font-bold">{i + 1}.</span>
                  <input
                    type="text"
                    value={gift.name}
                    onChange={(e) => {
                      const next = [...gifts];
                      next[i] = { ...next[i], name: e.target.value };
                      setGifts(next);
                    }}
                    className="flex-1 min-w-[140px] px-6 py-4 bg-white/80 border-2 border-pink-100 rounded-2xl text-pink-600 font-bold focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300"
                    placeholder={`礼物 ${i + 1}`}
                  />
                  <label className="flex items-center gap-2">
                    <span className="text-pink-500 font-bold text-sm">概率%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gift.probability ?? 12}
                      onChange={(e) => {
                        const next = [...gifts];
                        next[i] = { ...next[i], probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                        setGifts(next);
                      }}
                      className="w-16 px-3 py-2 bg-white/80 border-2 border-pink-100 rounded-xl text-pink-600 font-bold focus:outline-none"
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="text-sm text-pink-500">当前概率总和: {gifts.reduce((s, g) => s + (Number(g.probability) || 0), 0)}%</p>
            <button onClick={handleSaveGifts} className="bubble-btn px-10 py-3 bg-pink-400 text-white rounded-full font-bold">保存配置</button>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h3 className="text-2xl font-bold text-sky-600">中奖名单（赛期结束后更新）</h3>
              <div className="flex gap-3">
                <button type="button" onClick={async () => { await mergePendingToAdminLogs(secretCode, true); const data = await fetchAdminLogs(); setLogs(data); setSaveStatus('已刷新'); setTimeout(() => setSaveStatus(''), 2000); }} className="bubble-btn px-6 py-2 bg-sky-400 text-white rounded-full font-bold text-sm hover:bg-sky-500">🔄 刷新</button>
                <button type="button" onClick={handleClearLogs} className="bubble-btn px-6 py-2 bg-rose-400 text-white rounded-full font-bold text-sm hover:bg-rose-500">清空中奖记录</button>
              </div>
            </div>
            {sessionTimeLeft !== null && sessionTimeLeft > 0 ? (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-8 text-center">
                <p className="text-amber-600 font-bold text-lg mb-2">赛期进行中</p>
                <p className="text-4xl font-black text-amber-500 tabular-nums">{sessionTimeLeft} 秒</p>
                <p className="text-amber-500 text-sm mt-2">距离截止后更新中奖记录</p>
              </div>
            ) : (
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
            )}
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-8 max-w-2xl">
            <h3 className="text-2xl font-bold text-violet-600">外观与音效</h3>

            <div className="space-y-3">
              <label className="text-pink-600 font-bold">顶部棒棒糖图标</label>
              <p className="text-sm text-pink-500">上传图片或动图（支持 GIF）</p>
              <div className="flex flex-wrap items-center gap-4">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoUpload(f);
                    e.target.value = '';
                  }}
                />
                <button type="button" onClick={() => logoInputRef.current?.click()} className="bubble-btn px-6 py-3 bg-pink-400 text-white rounded-full font-bold">上传图片/动图</button>
                {appearance.logoUrl && (
                  <button type="button" onClick={() => setAppearance({ ...appearance, logoUrl: '' })} className="px-4 py-2 bg-rose-400 text-white rounded-full text-sm font-bold">恢复默认</button>
                )}
              </div>
              {appearance.logoUrl && (
                <div className="w-24 h-24 rounded-2xl border-2 border-pink-200 bg-white/80 overflow-hidden flex items-center justify-center">
                  <img src={appearance.logoUrl} alt="预览" className="max-w-full max-h-full object-contain" />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-pink-600 font-bold">背景图</label>
              <p className="text-sm text-pink-500">上传背景图片</p>
              <div className="flex items-center gap-4">
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        setAppearance({ ...appearance, backgroundUrl: reader.result as string });
                        setSaveStatus('背景图已更新');
                        setTimeout(() => setSaveStatus(''), 2000);
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
                <button type="button" onClick={() => bgInputRef.current?.click()} className="bubble-btn px-6 py-3 bg-pink-400 text-white rounded-full font-bold">上传背景图</button>
                {appearance.backgroundUrl && (
                  <button type="button" onClick={() => setAppearance({ ...appearance, backgroundUrl: '' })} className="px-4 py-2 bg-rose-400 text-white rounded-full text-sm font-bold">恢复默认</button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-pink-600 font-bold">消消乐图标（8 个）</label>
              <p className="text-sm text-pink-500">上传图片将自动居中裁剪为正方形，适配任意分辨率</p>
              <div className="grid grid-cols-4 sm:grid-cols-4 gap-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="relative flex flex-col items-center">
                    <div className="aspect-square rounded-2xl border-2 border-pink-200 bg-white/80 overflow-hidden flex items-center justify-center">
                      {appearance.tileImages?.[i] ? (
                        <img src={appearance.tileImages[i]} alt={`图标${i + 1}`} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-4xl opacity-40">🍬</span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <input
                        ref={(el) => { tileInputRefs.current[i] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleTileUpload(i, f);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => tileInputRefs.current[i]?.click()}
                        className="flex-1 py-1 px-2 bg-pink-400 text-white text-xs rounded-lg font-bold"
                      >上传</button>
                      {appearance.tileImages?.[i] && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTile(i)}
                          className="py-1 px-2 bg-rose-400 text-white text-xs rounded-lg font-bold"
                        >删除</button>
                      )}
                    </div>
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-400 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-pink-600 font-bold">结束页音乐</label>
              <p className="text-sm text-pink-500">上传 MP3 等音频文件</p>
              <div className="flex items-center gap-4">
                <input
                  ref={musicInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.type.startsWith('audio/')) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        setAppearance({ ...appearance, endMusicUrl: reader.result as string });
                        setSaveStatus('结束音乐已更新');
                        setTimeout(() => setSaveStatus(''), 2000);
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
                <button type="button" onClick={() => musicInputRef.current?.click()} className="bubble-btn px-6 py-3 bg-pink-400 text-white rounded-full font-bold">上传音乐</button>
                {appearance.endMusicUrl && (
                  <button type="button" onClick={() => setAppearance({ ...appearance, endMusicUrl: '' })} className="px-4 py-2 bg-rose-400 text-white rounded-full text-sm font-bold">恢复默认</button>
                )}
              </div>
            </div>

            <button onClick={handleSaveAppearance} className="bubble-btn px-10 py-3 bg-violet-500 text-white rounded-full font-bold">保存外观音效</button>
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
