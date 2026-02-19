import React, { useEffect } from 'react';
import { subscribeToSessionStart } from '../api/config';

interface WaitingRoomProps {
  nickname: string;
  passcode: string;
  onSessionStarted: () => void;
  onLogout: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({ nickname, passcode, onSessionStarted, onLogout }) => {
  useEffect(() => {
    const unsub = subscribeToSessionStart(passcode, (started) => {
      if (started) onSessionStarted();
    });
    return unsub;
  }, [passcode, onSessionStarted]);

  return (
    <div className="glass-panel max-w-2xl w-full p-10 rounded-[4rem] text-center border-4 border-white animate-in fade-in zoom-in duration-700">
      <div className="relative mb-8 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl border-4 border-pink-300 p-1 bg-white shadow-lg rotate-3 overflow-hidden mb-4">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`} alt="Avatar" className="w-full h-full" />
        </div>
        <h2 className="text-3xl font-bold candy-text">你好，<span className="text-sky-500">{nickname}</span></h2>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-3xl text-amber-800 mb-8">
        <p className="text-xl font-bold mb-2">⏳ 等待室</p>
        <p className="text-pink-600">管理员尚未开始本局游戏，请稍候…</p>
        <p className="text-sm text-pink-400 mt-2">开始后会自动进入大厅，无需刷新</p>
      </div>

      <button onClick={onLogout} className="text-pink-400 font-bold hover:text-pink-600 transition-colors">登出账号</button>
    </div>
  );
};

export default WaitingRoom;
