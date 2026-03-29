import { useEffect, useState } from 'react';
import { STORY_CHAPTERS } from '../data/world.js';

const BG_STYLES = {
  stars:     { background: 'linear-gradient(180deg,#000010,#000820)' },
  ship:      { background: 'linear-gradient(135deg,#0a0520,#1a0835)' },
  space:     { background: 'linear-gradient(180deg,#000010,#050020)' },
  asteroids: { background: 'linear-gradient(135deg,#0d0d0d,#1a1005)' },
  nebula:    { background: 'linear-gradient(135deg,#050025,#180520)' },
  station:   { background: 'linear-gradient(135deg,#050a1a,#0a1525)' },
  void:      { background: 'linear-gradient(135deg,#050005,#1a0020)' },
};

const BG_SPRITES = {
  stars:     ['✨','⭐','🌟','💫'],
  ship:      ['🚀','⭐','🌌'],
  space:     ['🌌','💫','⭐'],
  asteroids: ['☄️','🪨','⭐'],
  nebula:    ['🌌','💜','🔮'],
  station:   ['🏭','⚙️','💡'],
  void:      ['🌀','💜','🌑'],
};

export default function StoryScreen({ chapter, sceneIndex, onNext, onSkip }) {
  const chapterData = STORY_CHAPTERS[chapter];
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  if (!chapterData) {
    onSkip();
    return null;
  }

  const scene = chapterData.scenes[sceneIndex];

  useEffect(() => {
    if (!scene) return;
    setDisplayed('');
    setDone(false);
    const text = scene.text;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setDone(true);
      }
    }, 28);
    return () => clearInterval(iv);
  }, [scene?.id]);

  if (!scene) {
    // Chapter fully shown, go to world
    onSkip();
    return null;
  }

  const bgStyle = BG_STYLES[scene.background] || BG_STYLES.stars;
  const sprites = BG_SPRITES[scene.background] || BG_SPRITES.stars;

  function handleClick() {
    if (!done) {
      setDisplayed(scene.text);
      setDone(true);
    } else {
      onNext();
    }
  }

  // Convert *italic* markdown
  const renderText = (text) =>
    text.split(/(\*[^*]+\*)/).map((part, i) =>
      part.startsWith('*') && part.endsWith('*')
        ? <em key={i} style={{ color: '#e8c44a' }}>{part.slice(1, -1)}</em>
        : part
    );

  const totalScenes = chapterData.scenes.length;
  const isLast = sceneIndex === totalScenes - 1;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-end cursor-pointer select-none"
      style={{ ...bgStyle, fontFamily: 'monospace' }}
      onClick={handleClick}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="absolute text-4xl"
            style={{
              left: `${(i * 17 + 5) % 95}%`,
              top: `${(i * 23 + 8) % 60}%`,
              opacity: 0.06 + (i % 3) * 0.03,
              fontSize: `${2 + (i % 4)}rem`,
            }}
          >
            {sprites[i % sprites.length]}
          </div>
        ))}
      </div>

      {/* Chapter header */}
      <div
        className="absolute top-8 left-0 right-0 text-center text-xs tracking-widest uppercase"
        style={{ color: '#4488aa', letterSpacing: '0.3em' }}
      >
        {chapterData.title}
      </div>

      {/* Progress dots */}
      <div className="absolute top-16 flex gap-2">
        {chapterData.scenes.map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 6, height: 6,
              background: i <= sceneIndex ? '#4499ff' : '#223344',
            }}
          />
        ))}
      </div>

      {/* Dialog box */}
      <div
        className="w-full max-w-2xl mx-auto mb-12 p-6 rounded-t-lg"
        style={{
          background: 'rgba(0,8,20,0.92)',
          border: '2px solid #1a3a5a',
          boxShadow: '0 -4px 30px rgba(0,100,200,0.15)',
          minHeight: 120,
        }}
      >
        <p
          className="text-base leading-relaxed mb-3"
          style={{ color: '#c8ddf0', minHeight: '4rem' }}
        >
          {renderText(displayed)}
          {!done && <span style={{ opacity: 0.7, animation: 'blink 0.5s steps(1) infinite' }}>▌</span>}
        </p>
        <div className="flex justify-between items-center">
          <span style={{ color: '#334455', fontSize: '0.7rem' }}>
            {sceneIndex + 1} / {totalScenes}
          </span>
          {done && (
            <span
              className="text-xs tracking-widest"
              style={{ color: '#4488aa', animation: 'pulse 1s ease-in-out infinite' }}
            >
              {isLast ? '[ Begin → ]' : '[ Next → ]'}
            </span>
          )}
        </div>
      </div>

      {/* Skip button */}
      <button
        className="absolute top-6 right-6 text-xs px-3 py-1 rounded"
        style={{ color: '#445566', background: 'rgba(0,0,0,0.4)', border: '1px solid #223344' }}
        onClick={(e) => { e.stopPropagation(); onSkip(); }}
      >
        Skip
      </button>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>
    </div>
  );
}
