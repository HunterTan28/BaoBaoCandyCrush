import React, { useState, useEffect } from 'react';
import { subscribeToSecretCode, subscribeToAppearance, getAppearanceSync } from './api/config';

interface LoginFormProps {
  onLoginSuccess: (nickname: string, passcode: string) => void;
  onAdminLogin: () => void;
}

/** 测试暗号：可登录且不受赛期/已玩过限制，与 App 中一致 */
const TEST_PASSCODE = '测试';

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, onAdminLogin }) => {
  const [nickname, setNickname] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isShake, setIsShake] = useState(false);
  const [secretCode, setSecretCode] = useState('宝宝');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    const unsub = subscribeToSecretCode((code) => setSecretCode(code || '宝宝'));
    return unsub;
  }, []);

  useEffect(() => {
    const cfg = getAppearanceSync();
    if (cfg.logoUrl) setLogoUrl(cfg.logoUrl);
    const unsub = subscribeToAppearance((c) => setLogoUrl(c.logoUrl || ''));
    return unsub;
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nickname.trim()) {
      handleError('名字还没填哦~');
      return;
    }

    const trimmedPasscode = passcode.trim();
    if (trimmedPasscode !== secretCode && trimmedPasscode !== TEST_PASSCODE) {
      handleError('暗号不对呢，小调皮~');
      return;
    }

    const isTestPasscode = trimmedPasscode === TEST_PASSCODE;
    if (!isTestPasscode) {
      const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
      const hasPlayed = logs.some((log: any) => 
        log.nickname === nickname.trim() && log.passcode === trimmedPasscode
      );
      if (hasPlayed) {
        handleError('你已经参加过这次派对啦~');
        return;
      }
    }

    onLoginSuccess(nickname.trim(), trimmedPasscode);
  };

  const handleError = (msg: string) => {
    setError(msg);
    setIsShake(true);
    setTimeout(() => setIsShake(false), 500);
  };

  return (
    <div className={`glass-panel w-full max-w-md p-10 rounded-[3rem] transition-all duration-500 transform ${isShake ? 'animate-vibrate' : 'scale-100'} hover:shadow-[0_25px_60px_rgba(255,105,180,0.4)]`}>
      <div className="text-center mb-10">
        <div className="inline-block mb-4 animate-bounce">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-md" />
          ) : (
            <span className="text-6xl drop-shadow-md">🍭</span>
          )}
        </div>
        <h1 className="text-5xl font-bold candy-text mb-3 tracking-tighter">宝宝有时差</h1>
        <p className="text-pink-400 text-lg tracking-[0.2em] font-bold opacity-80">糖果世界 · 竞技登场</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="group">
          <label className="block text-pink-500 text-xs font-black mb-3 pl-4 uppercase tracking-[0.3em] group-focus-within:text-pink-600 transition-colors">游戏昵称</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full px-8 py-5 bg-white/70 backdrop-blur-sm border-2 border-pink-100 rounded-full text-pink-600 placeholder-pink-200 focus:outline-none focus:ring-4 focus:ring-pink-200/50 focus:border-pink-300 transition-all text-xl font-bold shadow-inner"
            placeholder="写下你的可爱名字"
          />
        </div>

        <div className="group">
          <label className="block text-sky-500 text-xs font-black mb-3 pl-4 uppercase tracking-[0.3em] group-focus-within:text-sky-600 transition-colors">魔法暗号</label>
          <input
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-8 py-5 bg-white/70 backdrop-blur-sm border-2 border-sky-100 rounded-full text-sky-600 placeholder-sky-200 focus:outline-none focus:ring-4 focus:ring-sky-200/50 focus:border-sky-300 transition-all text-xl font-bold shadow-inner"
            placeholder="请听YY语音提示"
          />
        </div>

        {error && (
          <div className="text-white text-center bg-gradient-to-r from-rose-400 to-pink-500 py-4 px-6 rounded-2xl border-2 border-white/50 font-black text-sm shadow-lg animate-in fade-in slide-in-from-top-2">
            ✨ {error}
          </div>
        )}

        <button
          type="submit"
          className="bubble-btn w-full py-6 bg-gradient-to-br from-pink-400 via-rose-400 to-pink-500 text-white text-2xl font-black rounded-full shadow-[0_10px_25px_rgba(244,114,182,0.4)] border-b-4 border-pink-600 active:border-b-0 active:translate-y-1"
        >
          开始奇幻之旅
        </button>
      </form>

      <div className="mt-12 pt-8 border-t border-pink-100/50 flex flex-col items-center gap-4">
        <p className="text-pink-300 text-xs font-bold tracking-widest uppercase">Secret Entrance Below</p>
        <span 
          onClick={onAdminLogin}
          className="text-pink-200 hover:text-pink-400 cursor-pointer transition-all text-sm font-bold border-2 border-pink-50 px-6 py-1 rounded-full hover:bg-white/50"
        >
          后台入口
        </span>
      </div>
    </div>
  );
};

export default LoginForm;
