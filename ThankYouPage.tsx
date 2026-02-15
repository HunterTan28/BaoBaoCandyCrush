import React, { useState, useEffect, useRef } from 'react';
import { subscribeToAppearance } from './api/config';

const DEFAULT_MUSIC_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

interface ThankYouPageProps {
  onBack: () => void;
}

const DEFAULT_THANK_YOU = "感谢宝宝在诛仙世界浮生若梦服，积极参与宝宝有时差的帮派活动，为帮派建设做出贡献~未来我们一起携手做大做强再创辉煌！✨";

const ThankYouPage: React.FC<ThankYouPageProps> = ({ onBack }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [customMessage, setCustomMessage] = useState(DEFAULT_THANK_YOU);
  const [musicUrl, setMusicUrl] = useState(DEFAULT_MUSIC_URL);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToAppearance((cfg) => {
      setMusicUrl((cfg.endMusicUrl || '').trim() || DEFAULT_MUSIC_URL);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(() => {});
    }
  }, [musicUrl]);

  useEffect(() => {
    const savedMsg = localStorage.getItem('app_thank_you_message');
    if (savedMsg) setCustomMessage(savedMsg);
  }, []);

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(audioRef.current.muted);
    }
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-pink-200 via-white to-sky-100 flex flex-col items-center justify-center p-8 overflow-hidden text-center">
      {/* 音乐播放器 */}
      <audio 
        ref={audioRef} 
        loop 
        src={musicUrl} 
      />
      
      {/* 静音按钮 */}
      <button 
        onClick={toggleMute}
        className="absolute top-8 right-8 w-16 h-16 bg-white/80 rounded-full flex items-center justify-center text-3xl shadow-lg z-50 hover:scale-110 transition-transform"
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      {/* 爱心光波背景层 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <div className="love-wave-container">
          <div className="love-heart"></div>
          <div className="love-heart delay-1"></div>
          <div className="love-heart delay-2"></div>
        </div>
      </div>

      <div className="relative z-10 glass-panel p-16 rounded-[5rem] border-8 border-white/60 shadow-2xl max-w-4xl animate-in fade-in zoom-in duration-1000">
        <div className="text-8xl mb-8 animate-bounce">💖</div>
        <h2 className="text-5xl font-black candy-text mb-12">感谢陪伴</h2>
        
        <div className="space-y-8 text-2xl font-bold leading-relaxed text-pink-600">
          {/* 将文本按换行符拆分渲染 */}
          {customMessage.split('\n').map((line, i) => (
            <p key={i} className={i === 0 ? "animate-pulse" : ""}>{line}</p>
          ))}
          
          <div className="mt-12 text-center">
             <span className="inline-block animate-bounce text-4xl">✨</span>
          </div>
        </div>

        <button 
          onClick={onBack}
          className="mt-12 bubble-btn px-20 py-6 bg-pink-400 text-white rounded-full text-2xl font-bold shadow-xl border-4 border-white"
        >
          完成并登出
        </button>
      </div>

      {/* 底部装饰 */}
      <div className="absolute bottom-10 flex gap-4 text-4xl opacity-50">
        <span>🌸</span><span>🌈</span><span>🍦</span><span>🦋</span><span>🍭</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .love-wave-container {
          position: relative;
          width: 500px;
          height: 500px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .love-heart {
          position: absolute;
          width: 100px;
          height: 100px;
          background: #ff85a2;
          transform: rotate(-45deg);
          animation: wave-pulse 4s infinite linear;
          opacity: 0;
        }
        .love-heart::before, .love-heart::after {
          content: '';
          position: absolute;
          width: 100px;
          height: 100px;
          background: #ff85a2;
          border-radius: 50%;
        }
        .love-heart::before { top: -50px; left: 0; }
        .love-heart::after { left: 50px; top: 0; }

        @keyframes wave-pulse {
          0% { transform: rotate(-45deg) scale(0.5); opacity: 1; }
          100% { transform: rotate(-45deg) scale(8); opacity: 0; }
        }
        .delay-1 { animation-delay: 1.3s; }
        .delay-2 { animation-delay: 2.6s; }
      `}} />
    </div>
  );
};

export default ThankYouPage;
