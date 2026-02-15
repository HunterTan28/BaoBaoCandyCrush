import React, { useState, useEffect, useRef } from 'react';
import { subscribeToAppearance, getGiftsForDraw, getSessionStartTs, type GiftForDraw } from './api/config';
import { getTopRankingsForLogs, addWinnerToAdminLogs } from './api/rankings';

const DEFAULT_MUSIC_URL = '/bkmusic.mp3';

interface ThankYouPageProps {
  nickname: string;
  passcode: string;
  score: number;
  onBack: () => void;
}

const DEFAULT_THANK_YOU = "感谢宝宝在诛仙世界浮生若梦服，积极参与宝宝有时差的帮派活动，为帮派建设做出贡献~未来我们一起携手做大做强再创辉煌！✨";

/** 按概率权重随机抽取一个礼物 */
function pickGiftByProbability(gifts: GiftForDraw[]): GiftForDraw | null {
  const valid = gifts.filter((g) => g.name?.trim() && (g.probability ?? 0) > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((s, g) => s + (g.probability ?? 0), 0);
  if (total <= 0) return valid[0] ?? null;
  let r = Math.random() * total;
  for (const g of valid) {
    r -= g.probability ?? 0;
    if (r <= 0) return g;
  }
  return valid[valid.length - 1] ?? null;
}

const ThankYouPage: React.FC<ThankYouPageProps> = ({ nickname, passcode, score, onBack }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [customMessage, setCustomMessage] = useState(DEFAULT_THANK_YOU);
  const [musicUrl, setMusicUrl] = useState(DEFAULT_MUSIC_URL);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isTop3, setIsTop3] = useState<boolean | null>(null);
  const [gifts, setGifts] = useState<GiftForDraw[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonGift, setWonGift] = useState<string | null>(null);
  const [hasSpun, setHasSpun] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const roomKey = (passcode || '').trim();
      if (!roomKey || roomKey === '测试') {
        setIsTop3(false);
        return;
      }
      const sessionStartTs = await getSessionStartTs(roomKey);
      const top3 = await getTopRankingsForLogs(roomKey, 3, { name: nickname, score }, sessionStartTs ?? undefined);
      if (cancelled) return;
      const rank = top3.findIndex((e) => e.name === nickname);
      setIsTop3(rank >= 0 && rank < 3);
      const g = await getGiftsForDraw();
      if (!cancelled) setGifts(g.filter((x) => x.name?.trim()).length > 0 ? g : [{ name: '糖果礼物', probability: 100 }]);
    };
    check();
    return () => { cancelled = true; };
  }, [passcode, nickname, score]);

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(audioRef.current.muted);
    }
  };

  const handleSpin = async () => {
    if (isSpinning || hasSpun || gifts.length === 0) return;
    setIsSpinning(true);
    setWonGift(null);

    const picked = pickGiftByProbability(gifts);
    if (!picked) {
      setIsSpinning(false);
      return;
    }

    const giftIndex = gifts.findIndex((g) => g.name === picked.name);
    const segmentCount = gifts.length;
    const degPerSegment = 360 / segmentCount;
    const targetIndex = giftIndex >= 0 ? giftIndex : 0;
    const targetAngle = 360 - (targetIndex * degPerSegment + degPerSegment / 2) + 360 * 5;

    if (wheelRef.current) {
      wheelRef.current.style.transition = 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)';
      wheelRef.current.style.transform = `rotate(${targetAngle}deg)`;
    }

    await new Promise((r) => setTimeout(r, 4200));
    setWonGift(picked.name);
    setHasSpun(true);
    setIsSpinning(false);
    await addWinnerToAdminLogs(nickname, passcode, picked.name, score);
  };

  const showWheel = isTop3 === true && gifts.length > 0;
  const showThankYou = !showWheel;

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-pink-200 via-white to-sky-100 flex flex-col items-center justify-center p-8 overflow-hidden text-center">
      <audio ref={audioRef} loop src={musicUrl} />
      <button
        onClick={toggleMute}
        className="absolute top-8 right-8 w-16 h-16 bg-white/80 rounded-full flex items-center justify-center text-3xl shadow-lg z-50 hover:scale-110 transition-transform"
      >
        {isMuted ? '🔇' : '🔊'}
      </button>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <div className="love-wave-container">
          <div className="love-heart"></div>
          <div className="love-heart delay-1"></div>
          <div className="love-heart delay-2"></div>
        </div>
      </div>

      {isTop3 === null && (
        <div className="relative z-10 glass-panel p-16 rounded-[5rem] animate-pulse">
          <p className="text-pink-600 font-bold">加载中...</p>
        </div>
      )}

      {showWheel && !hasSpun && (
        <div className="relative z-10 glass-panel p-12 rounded-[3rem] border-8 border-white/60 shadow-2xl max-w-lg">
          <h2 className="text-3xl font-black candy-text mb-6">🎉 恭喜进入前三！抽奖领礼物</h2>
          <div className="relative w-64 h-64 mx-auto mb-8">
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 w-0 h-0 border-l-[16px] border-r-[16px] border-t-[28px] border-l-transparent border-r-transparent border-t-pink-500"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
            />
            <div
              ref={wheelRef}
              className="w-full h-full rounded-full border-8 border-pink-300 overflow-hidden shadow-inner"
              style={{
                background: `conic-gradient(${gifts
                  .map((_, i) => {
                    const hue = (i * 360) / Math.max(gifts.length, 1);
                    return `hsl(${hue}, 75%, 88%) ${(i * 360) / gifts.length}deg ${((i + 1) * 360) / gifts.length}deg`;
                  })
                  .join(', ')})`,
              }}
            />
          </div>
          <p className="text-xs text-pink-500 mb-4">奖品：{gifts.map((g) => g.name).join('、')}</p>
          <button
            onClick={handleSpin}
            disabled={isSpinning}
            className="bubble-btn px-12 py-5 bg-pink-400 text-white rounded-full text-xl font-black shadow-xl border-4 border-white disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSpinning ? '转盘中...' : '开始抽奖'}
          </button>
        </div>
      )}

      {showWheel && hasSpun && wonGift && (
        <div className="relative z-10 glass-panel p-12 rounded-[3rem] border-8 border-amber-200 shadow-2xl max-w-lg animate-in fade-in zoom-in duration-500">
          <h2 className="text-4xl font-black candy-text mb-4">🎊 恭喜获得</h2>
          <p className="text-3xl font-black text-amber-600 mb-8">{wonGift}</p>
          <p className="text-pink-500 text-sm mb-6">已同步到中奖记录</p>
          <button onClick={onBack} className="bubble-btn px-16 py-4 bg-pink-400 text-white rounded-full text-xl font-bold shadow-xl border-4 border-white">
            完成并登出
          </button>
        </div>
      )}

      {showThankYou && (
        <div className="relative z-10 glass-panel p-16 rounded-[5rem] border-8 border-white/60 shadow-2xl max-w-4xl animate-in fade-in zoom-in duration-1000">
          <div className="text-8xl mb-8 animate-bounce">💖</div>
          <h2 className="text-5xl font-black candy-text mb-12">感谢陪伴</h2>
          <div className="space-y-8 text-2xl font-bold leading-relaxed text-pink-600">
            {customMessage.split('\n').map((line, i) => (
              <p key={i} className={i === 0 ? 'animate-pulse' : ''}>{line}</p>
            ))}
            <div className="mt-12 text-center">
              <span className="inline-block animate-bounce text-4xl">✨</span>
            </div>
          </div>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={toggleMute}
              className="px-8 py-4 bg-white/80 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
            >
              {isMuted ? '🔇 点击恢复音乐' : '🔊 点击静音'}
            </button>
            <button
              onClick={onBack}
              className="bubble-btn px-20 py-6 bg-pink-400 text-white rounded-full text-2xl font-bold shadow-xl border-4 border-white"
            >
              完成并登出
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-10 flex gap-4 text-4xl opacity-50">
        <span>🌸</span><span>🌈</span><span>🍦</span><span>🦋</span><span>🍭</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .love-wave-container { position: relative; width: 500px; height: 500px; display: flex; justify-content: center; align-items: center; }
        .love-heart { position: absolute; width: 100px; height: 100px; background: #ff85a2; transform: rotate(-45deg); animation: wave-pulse 4s infinite linear; opacity: 0; }
        .love-heart::before, .love-heart::after { content: ''; position: absolute; width: 100px; height: 100px; background: #ff85a2; border-radius: 50%; }
        .love-heart::before { top: -50px; left: 0; }
        .love-heart::after { left: 50px; top: 0; }
        @keyframes wave-pulse { 0% { transform: rotate(-45deg) scale(0.5); opacity: 1; } 100% { transform: rotate(-45deg) scale(8); opacity: 0; } }
        .delay-1 { animation-delay: 1.3s; }
        .delay-2 { animation-delay: 2.6s; }
      `}} />
    </div>
  );
};

export default ThankYouPage;
