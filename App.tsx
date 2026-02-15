
import React, { useState, useEffect, useRef } from 'react';
import LoginForm from './LoginForm';
import Dashboard from './components/Dashboard';
import FruitMatchGame from './components/FruitMatchGame';
import AdminPanel from './AdminPanel';
import ThankYouPage from './ThankYouPage';

const App: React.FC = () => {
  const [user, setUser] = useState<{ nickname: string; passcode: string } | null>(null);
  const [gameState, setGameState] = useState<'login' | 'dashboard' | 'playing' | 'finished' | 'admin'>('login');
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!user || user.passcode === '测试') return;

    const checkSession = () => {
      const key = `session_start_${user.passcode}`;
      const start = localStorage.getItem(key);
      if (start) {
        const elapsed = (Date.now() - parseInt(start)) / 1000;
        const remaining = Math.max(0, 120 - elapsed);
        setSessionTimeLeft(Math.floor(remaining));
        if (remaining <= 0 && gameState === 'playing') setGameState('finished');
      }
    };

    const interval = setInterval(checkSession, 1000);
    return () => clearInterval(interval);
  }, [user, gameState]);

  const handleLogin = (nickname: string, passcode: string) => {
    setUser({ nickname, passcode });
    setGameState('dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="bg-custom absolute inset-0 pointer-events-none" />
      
      <main className="relative z-10 w-full flex justify-center">
        {gameState === 'login' && <LoginForm onLoginSuccess={handleLogin} onAdminLogin={() => setGameState('admin')} />}
        
        {gameState === 'dashboard' && user && (
          <Dashboard 
            {...user} 
            onLogout={() => { setUser(null); setGameState('login'); }} 
            onStartGame={() => setGameState('playing')}
            hasPlayed={false}
            sessionTimeLeft={sessionTimeLeft}
          />
        )}

        {gameState === 'playing' && user && (
          <FruitMatchGame 
            {...user} 
            onEnd={() => setGameState('finished')} 
            sessionTimeLeft={sessionTimeLeft}
          />
        )}

        {gameState === 'finished' && <ThankYouPage onBack={() => setGameState('login')} />}
        
        {gameState === 'admin' && <AdminPanel onExit={() => setGameState('login')} />}
      </main>
    </div>
  );
};

export default App;
