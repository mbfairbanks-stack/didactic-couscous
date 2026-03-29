import { useReducer, useCallback } from 'react';
import { gameReducer, createInitialState } from './GameState.js';
import TitleScreen from './components/TitleScreen.jsx';
import StoryScreen from './components/StoryScreen.jsx';
import WorldMap from './components/WorldMap.jsx';
import BattleScreen from './components/BattleScreen.jsx';
import PartyMenu from './components/PartyMenu.jsx';
import ShopMenu from './components/ShopMenu.jsx';
import { STORY_CHAPTERS } from './data/world.js';

function GameOverScreen({ onRetry }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: '#000', fontFamily: 'monospace' }}
    >
      <div className="text-6xl mb-6">💀</div>
      <div
        className="text-4xl font-bold mb-4"
        style={{ color: '#cc2222', textShadow: '0 0 20px #881111' }}
      >
        GAME OVER
      </div>
      <div className="text-sm mb-8" style={{ color: '#443333' }}>
        The Void Serpent drifts, silent and cold...
      </div>
      <button
        className="px-8 py-3 rounded font-bold"
        style={{
          background: 'rgba(30,5,5,0.9)',
          border: '2px solid #882222',
          color: '#cc4444',
          fontSize: '1rem',
        }}
        onClick={onRetry}
      >
        Try Again
      </button>
    </div>
  );
}

function CreditsScreen({ onClose }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#000010,#000820)', fontFamily: 'monospace' }}
    >
      <div className="text-center max-w-lg px-6">
        <div className="text-5xl mb-6">🌌</div>
        <div className="text-3xl font-bold mb-2" style={{ color: '#e8c44a' }}>CONGRATULATIONS!</div>
        <div className="text-sm mb-6" style={{ color: '#4488aa' }}>
          Admiral Nexus has been defeated.
        </div>
        <div className="text-sm leading-relaxed mb-8" style={{ color: '#667788' }}>
          The Galactic Imperium's grip on the outer rim has been broken.<br />
          The Void Serpent sails free among the stars,<br />
          its crew legends of the age.<br /><br />
          <em style={{ color: '#446688' }}>
            "Freedom isn't given — it's taken."<br />
            — Captain Kira
          </em>
        </div>
        <div className="text-xs mb-8" style={{ color: '#334455' }}>
          VOID SERPENT CHRONICLES<br />
          A Space Pirate RPG inspired by SNES Final Fantasy
        </div>
        <button
          className="px-8 py-3 rounded font-bold"
          style={{
            background: 'rgba(20,30,5,0.9)',
            border: '2px solid #446622',
            color: '#88cc44',
          }}
          onClick={onClose}
        >
          Return to Title
        </button>
      </div>
    </div>
  );
}

export default function Game() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);

  const handleStoryNext = useCallback(() => {
    const chapter = state.chapter;
    const chapterData = STORY_CHAPTERS[chapter];
    if (!chapterData) {
      dispatch({ type: 'GO_TO_WORLD' });
      return;
    }
    const nextIndex = state.storySceneIndex + 1;
    if (nextIndex >= chapterData.scenes.length) {
      dispatch({ type: 'GO_TO_WORLD' });
    } else {
      dispatch({ type: 'NEXT_STORY_SCENE' });
    }
  }, [state.chapter, state.storySceneIndex]);

  const handleStorySkip = useCallback(() => {
    dispatch({ type: 'GO_TO_WORLD' });
  }, []);

  const { screen, menuMode } = state;

  // Check for end game (nexus defeated)
  if (screen === 'world' && state.flags['nexus_defeated']) {
    return <CreditsScreen onClose={() => dispatch({ type: 'START_GAME' })} />;
  }

  if (screen === 'title') {
    return <TitleScreen onStart={() => dispatch({ type: 'START_GAME' })} />;
  }

  if (screen === 'story') {
    return (
      <StoryScreen
        chapter={state.chapter}
        sceneIndex={state.storySceneIndex}
        onNext={handleStoryNext}
        onSkip={handleStorySkip}
      />
    );
  }

  if (screen === 'gameover') {
    return <GameOverScreen onRetry={() => dispatch({ type: 'START_GAME' })} />;
  }

  if (screen === 'battle') {
    return <BattleScreen state={state} dispatch={dispatch} />;
  }

  if (screen === 'world') {
    return (
      <>
        <WorldMap state={state} dispatch={dispatch} />
        {menuMode === 'party' && <PartyMenu state={state} dispatch={dispatch} />}
        {menuMode === 'shop' && <ShopMenu state={state} dispatch={dispatch} />}
      </>
    );
  }

  return null;
}
