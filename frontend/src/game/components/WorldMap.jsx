import { WORLD_NODES } from '../data/world.js';
import { STORY_CHAPTERS } from '../data/world.js';

function HpBar({ current, max, color = '#22cc55' }) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  const barColor = pct > 50 ? '#22cc55' : pct > 25 ? '#ddaa22' : '#cc3322';
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#112' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.3s' }} />
    </div>
  );
}

function PartyMember({ char }) {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded"
      style={{
        background: char.isKO ? 'rgba(60,0,0,0.5)' : 'rgba(0,12,30,0.7)',
        border: `1px solid ${char.isKO ? '#441111' : '#1a3a5a'}`,
        minWidth: 140,
      }}
    >
      <span style={{ fontSize: '1.4rem', opacity: char.isKO ? 0.4 : 1 }}>{char.sprite}</span>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className="text-xs font-bold truncate" style={{ color: char.isKO ? '#554444' : '#aaccff' }}>
            {char.name}
          </span>
          <span className="text-xs ml-1" style={{ color: '#446688', whiteSpace: 'nowrap' }}>
            Lv{char.level}
          </span>
        </div>
        <HpBar current={char.hp} max={char.maxHp} />
        <div className="flex justify-between mt-0.5">
          <span className="text-xs" style={{ color: char.isKO ? '#663333' : '#66aacc' }}>
            {char.isKO ? 'KO' : `${char.hp}/${char.maxHp}`}
          </span>
          <span className="text-xs" style={{ color: '#445588' }}>
            {char.mp}MP
          </span>
        </div>
      </div>
    </div>
  );
}

function NodeButton({ node, flags, onClick, active }) {
  const isUnlocked = node.unlocked || (node.unlockedBy && flags[node.unlockedBy]);
  const isCompleted = node.completedKey && flags[node.completedKey];

  const typeColors = {
    hub:    { border: '#2244aa', bg: 'rgba(5,15,40,0.9)', glow: '#2244aa' },
    dungeon:{ border: '#882222', bg: 'rgba(20,5,5,0.9)',  glow: '#882222' },
    town:   { border: '#226644', bg: 'rgba(5,20,10,0.9)', glow: '#226644' },
    final:  { border: '#8822aa', bg: 'rgba(15,5,20,0.9)', glow: '#8822aa' },
  };
  const colors = typeColors[node.type] || typeColors.hub;

  if (!isUnlocked) {
    return (
      <div
        className="absolute"
        style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%,-50%)' }}
      >
        <div
          className="flex flex-col items-center gap-1 p-2 rounded"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid #111',
            opacity: 0.35,
            minWidth: 80,
          }}
        >
          <span style={{ fontSize: '1.6rem', filter: 'grayscale(1)' }}>🔒</span>
          <span className="text-xs text-center" style={{ color: '#334455', fontFamily: 'monospace' }}>
            {node.name}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      className="absolute"
      style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%,-50%)' }}
      onClick={() => onClick(node)}
    >
      <div
        className="flex flex-col items-center gap-1 p-2 rounded transition-all duration-150"
        style={{
          background: active ? colors.bg : 'rgba(0,5,15,0.85)',
          border: `2px solid ${active ? colors.border : '#1a2a3a'}`,
          boxShadow: active ? `0 0 16px ${colors.glow}55` : 'none',
          minWidth: 90,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '1.8rem', filter: isCompleted ? 'brightness(0.6)' : 'none' }}>
          {node.sprite}
        </span>
        <span
          className="text-xs text-center font-bold leading-tight"
          style={{ color: active ? '#ddeeff' : '#7799aa', fontFamily: 'monospace', maxWidth: 90 }}
        >
          {node.name}
        </span>
        <span
          className="text-xs"
          style={{ color: isCompleted ? '#336633' : colors.border, fontFamily: 'monospace' }}
        >
          {isCompleted ? '✓ Cleared' : node.subtitle}
        </span>
      </div>
    </button>
  );
}

export default function WorldMap({ state, dispatch }) {
  const { party, flags, chapter, currentNode, message } = state;

  function handleNodeClick(node) {
    dispatch({ type: 'ENTER_NODE', nodeId: node.id });
  }

  function handleExplore(node) {
    if (!node.encounters) return;
    const isBoss = node.boss && !flags[node.completedKey];
    // Start random battle, or boss if area not cleared and boss exists
    if (isBoss && !flags[node.completedKey]) {
      import('../data/enemies.js').then(({ createBoss }) => {
        const enemies = createBoss(node.boss);
        dispatch({ type: 'START_BATTLE', enemies, isBoss: true });
      });
    } else {
      import('../data/enemies.js').then(({ getRandomEncounter }) => {
        const enemies = getRandomEncounter(node.encounters);
        dispatch({ type: 'START_BATTLE', enemies, isBoss: false });
      });
    }
  }

  function handleRest() {
    dispatch({ type: 'REST' });
  }

  const activeNodeId = currentNode?.id;

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#000010,#000820,#001030)', fontFamily: 'monospace' }}
    >
      {/* Star field */}
      {Array.from({ length: 60 }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 17.3) % 100}%`,
            top: `${(i * 13.7) % 100}%`,
            width: (i % 3) + 1,
            height: (i % 3) + 1,
            background: '#fff',
            opacity: 0.15 + (i % 5) * 0.08,
          }}
        />
      ))}

      {/* Connection lines between nodes */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        {WORLD_NODES.slice(1).map(node => {
          const from = WORLD_NODES[0]; // all connect from hub
          const isUnlocked = node.unlocked || (node.unlockedBy && flags[node.unlockedBy]);
          return (
            <line
              key={node.id}
              x1={`${from.x}%`} y1={`${from.y}%`}
              x2={`${node.x}%`}  y2={`${node.y}%`}
              stroke={isUnlocked ? '#1a3a5a' : '#0a1520'}
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity={isUnlocked ? 0.5 : 0.2}
            />
          );
        })}
      </svg>

      {/* Map nodes */}
      {WORLD_NODES.map(node => (
        <NodeButton
          key={node.id}
          node={node}
          flags={flags}
          onClick={handleNodeClick}
          active={activeNodeId === node.id}
        />
      ))}

      {/* Chapter indicator */}
      <div
        className="absolute top-4 left-0 right-0 text-center text-xs tracking-widest"
        style={{ color: '#334455', letterSpacing: '0.3em' }}
      >
        {STORY_CHAPTERS[chapter]?.title || 'Galaxy Map'}
      </div>

      {/* Message toast */}
      {message && (
        <div
          className="absolute top-12 left-1/2 transform -translate-x-1/2 px-6 py-2 rounded text-sm"
          style={{
            background: 'rgba(0,20,40,0.95)',
            border: '1px solid #1a4a6a',
            color: '#aaddff',
            fontFamily: 'monospace',
            maxWidth: 400,
            textAlign: 'center',
            zIndex: 20,
          }}
          onClick={() => dispatch({ type: 'CLEAR_MESSAGE' })}
        >
          {message}
        </div>
      )}

      {/* Node action panel */}
      {currentNode && (
        <div
          className="absolute bottom-0 left-0 right-0 p-4"
          style={{
            background: 'rgba(0,5,15,0.96)',
            border: '2px solid #1a3a5a',
            borderBottom: 'none',
          }}
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <span style={{ fontSize: '1.8rem' }}>{currentNode.sprite}</span>
              <div>
                <div className="font-bold" style={{ color: '#ddeeff' }}>{currentNode.name}</div>
                <div className="text-xs" style={{ color: '#556677' }}>{currentNode.description}</div>
              </div>
              <button
                className="ml-auto text-xs px-3 py-1 rounded"
                style={{ color: '#445566', border: '1px solid #223344', background: 'transparent' }}
                onClick={() => dispatch({ type: 'LEAVE_NODE' })}
              >
                ✕ Close
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {currentNode.actions.includes('explore') && (
                <button
                  className="px-4 py-2 rounded text-sm font-bold transition-all"
                  style={{
                    background: flags[currentNode.completedKey] ? '#112' : 'rgba(80,20,20,0.9)',
                    border: `1px solid ${flags[currentNode.completedKey] ? '#334' : '#882222'}`,
                    color: flags[currentNode.completedKey] ? '#445566' : '#ffaaaa',
                    cursor: flags[currentNode.completedKey] ? 'default' : 'pointer',
                  }}
                  onClick={() => !flags[currentNode.completedKey] && handleExplore(currentNode)}
                  disabled={!!flags[currentNode.completedKey]}
                >
                  ⚔️ {currentNode.boss && !flags[currentNode.completedKey]
                    ? (flags[`${currentNode.encounters}_explored`] ? 'Boss Fight' : 'Explore')
                    : flags[currentNode.completedKey] ? 'Cleared' : 'Explore'}
                </button>
              )}
              {currentNode.actions.includes('explore') && !flags[currentNode.completedKey] && (
                <button
                  className="px-4 py-2 rounded text-sm font-bold"
                  style={{ background: 'rgba(20,40,80,0.9)', border: '1px solid #224488', color: '#88aaff' }}
                  onClick={() => {
                    import('../data/enemies.js').then(({ getRandomEncounter }) => {
                      const enemies = getRandomEncounter(currentNode.encounters);
                      dispatch({ type: 'START_BATTLE', enemies, isBoss: false });
                    });
                  }}
                >
                  🔀 Random Battle
                </button>
              )}
              {currentNode.actions.includes('rest') && (
                <button
                  className="px-4 py-2 rounded text-sm font-bold"
                  style={{ background: 'rgba(20,50,20,0.9)', border: '1px solid #224422', color: '#88cc88' }}
                  onClick={() => { handleRest(); dispatch({ type: 'LEAVE_NODE' }); }}
                >
                  💤 Rest (Free)
                </button>
              )}
              {currentNode.actions.includes('shop') && (
                <button
                  className="px-4 py-2 rounded text-sm font-bold"
                  style={{ background: 'rgba(40,30,10,0.9)', border: '1px solid #664411', color: '#ccaa44' }}
                  onClick={() => dispatch({ type: 'OPEN_MENU', menuMode: 'shop' })}
                >
                  🛒 Shop
                </button>
              )}
              {currentNode.actions.includes('manage_party') && (
                <button
                  className="px-4 py-2 rounded text-sm font-bold"
                  style={{ background: 'rgba(20,20,50,0.9)', border: '1px solid #223366', color: '#8899cc' }}
                  onClick={() => dispatch({ type: 'OPEN_MENU', menuMode: 'party' })}
                >
                  👥 Party
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Party status bar (always visible) */}
      <div
        className="absolute top-0 right-0 p-3 flex flex-col gap-1"
        style={{ zIndex: 10, maxWidth: 200 }}
      >
        <div className="text-xs mb-1" style={{ color: '#334455', textAlign: 'right' }}>
          💰 {state.inventory.gold}g
        </div>
        {party.map(char => (
          <PartyMember key={char.id} char={char} />
        ))}
      </div>
    </div>
  );
}
