import { useEffect, useState } from 'react';

export default function TitleScreen({ onStart }) {
  const [stars, setStars] = useState([]);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const s = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 3 + 1,
    }));
    setStars(s);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none cursor-pointer"
      style={{ background: 'linear-gradient(180deg, #000010 0%, #000820 50%, #001030 100%)' }}
      onClick={onStart}
    >
      {/* Stars */}
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: '#fff',
            opacity: s.opacity,
            animation: `twinkle ${s.speed}s ease-in-out infinite alternate`,
          }}
        />
      ))}

      {/* Ship silhouette */}
      <div className="absolute" style={{ top: '12%', right: '15%', fontSize: '5rem', opacity: 0.25, transform: 'rotate(-15deg)' }}>
        🚀
      </div>
      <div className="absolute" style={{ top: '60%', left: '10%', fontSize: '3rem', opacity: 0.15 }}>
        ☄️
      </div>
      <div className="absolute" style={{ top: '20%', left: '20%', fontSize: '2.5rem', opacity: 0.1 }}>
        🌌
      </div>

      {/* Main content */}
      <div className="relative flex flex-col items-center justify-center h-full gap-6">
        {/* Subtitle */}
        <div
          className="text-xs tracking-widest uppercase"
          style={{ color: '#4499ff', fontFamily: 'monospace', letterSpacing: '0.4em' }}
        >
          ✦ A Space Pirate Adventure ✦
        </div>

        {/* Title */}
        <div className="text-center" style={{ fontFamily: 'monospace' }}>
          <div
            className="text-4xl md:text-6xl font-bold mb-2"
            style={{
              color: '#e8c44a',
              textShadow: '0 0 20px #e8c44a, 0 0 40px #ff8800, 0 0 60px #ff4400',
              letterSpacing: '0.05em',
            }}
          >
            VOID SERPENT
          </div>
          <div
            className="text-xl md:text-2xl tracking-widest"
            style={{
              color: '#88aaff',
              textShadow: '0 0 10px #4466ff',
              letterSpacing: '0.3em',
            }}
          >
            CHRONICLES
          </div>
        </div>

        {/* Tagline */}
        <div
          className="text-sm text-center max-w-xs"
          style={{ color: '#667788', fontFamily: 'monospace', lineHeight: 1.8 }}
        >
          Defy the Galactic Imperium.<br />
          Plunder the stars.<br />
          Become legend.
        </div>

        {/* Press start */}
        <div
          className="mt-4 text-base tracking-widest"
          style={{
            color: '#aaccff',
            fontFamily: 'monospace',
            opacity: blink ? 1 : 0,
            transition: 'opacity 0.15s',
            letterSpacing: '0.2em',
          }}
        >
          — PRESS START —
        </div>

        {/* Credits */}
        <div
          className="absolute bottom-6 text-xs"
          style={{ color: '#334455', fontFamily: 'monospace' }}
        >
          Inspired by SNES Final Fantasy
        </div>
      </div>

      <style>{`
        @keyframes twinkle {
          from { opacity: 0.2; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
