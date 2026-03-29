import { useState, useEffect } from 'react';
import { CHARACTER_CLASSES, getAvailableAbilities } from '../data/characters.js';
import { ITEMS } from '../data/items.js';
import { WORLD_NODES } from '../data/world.js';

function HpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, (current / max) * 100) : 0;
  const color = pct > 50 ? '#22cc55' : pct > 25 ? '#ddaa22' : '#cc3322';
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: '#112' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
    </div>
  );
}

function MpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, (current / max) * 100) : 0;
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: '#112' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: '#4466dd', transition: 'width 0.4s' }} />
    </div>
  );
}

function PartyCard({ char, isActive, onClick, selectable }) {
  return (
    <button
      className="rounded p-2 text-left transition-all w-full"
      style={{
        background: isActive
          ? 'rgba(20,40,80,0.95)'
          : char.isKO
          ? 'rgba(30,5,5,0.7)'
          : 'rgba(0,10,25,0.85)',
        border: `1px solid ${isActive ? '#4488ff' : char.isKO ? '#441111' : '#1a3a5a'}`,
        boxShadow: isActive ? '0 0 12px #224488' : 'none',
        cursor: selectable && !char.isKO ? 'pointer' : 'default',
        opacity: selectable && char.isKO ? 0.4 : 1,
      }}
      onClick={selectable && !char.isKO ? onClick : undefined}
      disabled={char.isKO && selectable}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: '1.2rem', opacity: char.isKO ? 0.3 : 1 }}>{char.sprite}</span>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between">
            <span className="text-xs font-bold truncate" style={{ color: isActive ? '#88bbff' : '#8899aa' }}>
              {char.name}
            </span>
            <span className="text-xs" style={{ color: '#446688' }}>Lv{char.level}</span>
          </div>
        </div>
      </div>
      <HpBar current={char.hp} max={char.maxHp} />
      <div className="flex justify-between mt-0.5 mb-0.5">
        <span className="text-xs" style={{ color: char.isKO ? '#663333' : '#66aacc' }}>
          {char.isKO ? '☠ KO' : `${char.hp}/${char.maxHp}`}
        </span>
      </div>
      <MpBar current={char.mp} max={char.maxMp} />
      <div className="text-xs mt-0.5" style={{ color: '#334466' }}>MP {char.mp}/{char.maxMp}</div>
    </button>
  );
}

function EnemyCard({ enemy, isSelected, onClick, selectable }) {
  const pct = (enemy.hp / enemy.maxHp) * 100;
  return (
    <button
      className="rounded p-2 text-center transition-all"
      style={{
        background: isSelected ? 'rgba(80,20,20,0.9)' : 'rgba(20,5,5,0.8)',
        border: `1px solid ${isSelected ? '#cc4444' : '#441111'}`,
        boxShadow: isSelected ? '0 0 12px #882222' : 'none',
        cursor: selectable && enemy.hp > 0 ? 'pointer' : 'default',
        opacity: enemy.hp <= 0 ? 0.3 : 1,
        minWidth: 90,
      }}
      onClick={selectable && enemy.hp > 0 ? onClick : undefined}
      disabled={enemy.hp <= 0}
    >
      <div style={{ fontSize: '2rem', filter: enemy.hp <= 0 ? 'grayscale(1)' : 'none' }}>
        {enemy.sprite}
      </div>
      <div className="text-xs mt-1" style={{ color: '#cc8888', fontFamily: 'monospace' }}>
        {enemy.name}
      </div>
      <HpBar current={enemy.hp} max={enemy.maxHp} />
      <div className="text-xs mt-0.5" style={{ color: '#664444' }}>
        {enemy.hp <= 0 ? '☠' : `${enemy.hp}/${enemy.maxHp}`}
      </div>
    </button>
  );
}

const ACTION_PHASES = {
  root: 'root',           // Attack / Skill / Item / Flee
  skill: 'skill',        // Choose ability
  item: 'item',          // Choose item
  target_enemy: 'target_enemy',
  target_ally: 'target_ally',
  target_ally_ko: 'target_ally_ko',  // For revive
};

export default function BattleScreen({ state, dispatch }) {
  const { battle, party } = state;
  const [phase, setPhase] = useState(ACTION_PHASES.root);
  const [pendingAction, setPendingAction] = useState(null);
  const [logScroll, setLogScroll] = useState(0);
  const [shaking, setShaking] = useState(null); // instanceId being hit

  if (!battle) return null;

  const { enemies, log, turnOrder, currentTurnIndex, result } = battle;
  const currentActor = turnOrder[currentTurnIndex];
  const isPlayerTurn = currentActor?.isPlayer;
  const activeChar = isPlayerTurn ? party.find(p => p.id === currentActor?.id) : null;

  // Auto-execute enemy turns
  useEffect(() => {
    if (!battle || battle.result) return;
    if (isPlayerTurn) return; // wait for player
    const t = setTimeout(() => {
      dispatch({ type: 'EXECUTE_TURN', action: null });
    }, 800);
    return () => clearTimeout(t);
  }, [currentTurnIndex, battle?.result, isPlayerTurn]);

  // Reset phase on turn change
  useEffect(() => {
    setPhase(ACTION_PHASES.root);
    setPendingAction(null);
  }, [currentTurnIndex]);

  // Keep log scrolled to bottom
  useEffect(() => {
    setLogScroll(log.length);
  }, [log.length]);

  function handleAbilitySelect(ability) {
    if (ability.type === 'heal' || ability.type === 'status') {
      if (ability.id === 'repair_drone' || ability.type === 'heal') {
        setPendingAction({ abilityId: ability.id });
        setPhase(ACTION_PHASES.target_ally);
        return;
      }
    }
    if (ability.aoe) {
      dispatch({ type: 'EXECUTE_TURN', action: { abilityId: ability.id, targetId: enemies[0]?.instanceId } });
      return;
    }
    setPendingAction({ abilityId: ability.id });
    setPhase(ACTION_PHASES.target_enemy);
  }

  function handleEnemyTarget(enemy) {
    if (!pendingAction || enemy.hp <= 0) return;
    dispatch({ type: 'EXECUTE_TURN', action: { ...pendingAction, targetId: enemy.instanceId } });
  }

  function handleAllyTarget(char) {
    if (!pendingAction) return;
    if (phase === ACTION_PHASES.target_ally_ko && !char.isKO) return;
    if (phase === ACTION_PHASES.target_ally && char.isKO) return;
    if (pendingAction.itemId) {
      dispatch({ type: 'USE_ITEM_IN_BATTLE', itemId: pendingAction.itemId, targetId: char.id });
      setPhase(ACTION_PHASES.root);
      setPendingAction(null);
    } else {
      dispatch({ type: 'EXECUTE_TURN', action: { ...pendingAction, targetId: char.id } });
    }
  }

  function handleAttack() {
    setPendingAction({ abilityId: 'attack' });
    setPhase(ACTION_PHASES.target_enemy);
  }

  function handleItemSelect(itemId, item) {
    if (item.subtype === 'revive') {
      setPendingAction({ itemId });
      setPhase(ACTION_PHASES.target_ally_ko);
    } else if (item.subtype === 'heal' || item.subtype === 'mp') {
      setPendingAction({ itemId });
      setPhase(ACTION_PHASES.target_ally);
    } else {
      dispatch({ type: 'USE_ITEM_IN_BATTLE', itemId, targetId: activeChar?.id });
    }
  }

  // Battle result handling
  function handleEndBattle() {
    if (battle.result === 'victory') {
      // Check if boss was defeated
      const bossEnemy = enemies.find(e => e.isBoss);
      const currentNode = WORLD_NODES.find(n => n.boss === bossEnemy?.id);
      const bossKey = currentNode?.completedKey;
      const newChapter = bossKey ? state.chapter + 1 : state.chapter;
      dispatch({
        type: 'END_BATTLE',
        bossKey: bossKey || null,
        newChapter,
        message: bossKey
          ? `⚔️ Boss defeated! Area cleared!`
          : null,
      });
      if (bossKey && newChapter <= 4) {
        setTimeout(() => dispatch({ type: 'ADVANCE_CHAPTER', chapter: newChapter }), 100);
      }
    } else {
      dispatch({ type: 'GAME_OVER' });
    }
  }

  const aliveEnemies = enemies.filter(e => e.hp > 0);
  const consumableItems = Object.entries(state.inventory.items)
    .filter(([id]) => ITEMS[id]?.type === 'consumable')
    .map(([id, count]) => ({ id, count, item: ITEMS[id] }));

  const availableAbilities = activeChar ? getAvailableAbilities(activeChar) : [];

  const bgStyle =
    battle.isBoss
      ? 'linear-gradient(180deg,#0d0005,#1a0010)'
      : 'linear-gradient(180deg,#050a15,#000510)';

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: bgStyle, fontFamily: 'monospace' }}
    >
      {/* Battle header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid #1a2a3a' }}
      >
        <span className="text-xs tracking-widest" style={{ color: '#556677' }}>
          {battle.isBoss ? '💀 BOSS BATTLE' : '⚔️ ENCOUNTER'}
        </span>
        {isPlayerTurn && activeChar && (
          <span className="text-xs" style={{ color: '#4488aa' }}>
            {activeChar.sprite} {activeChar.name}'s turn
          </span>
        )}
        {!isPlayerTurn && currentActor && (
          <span className="text-xs" style={{ color: '#cc6644' }}>
            {currentActor.sprite} {currentActor.name} acts...
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Enemy area */}
        <div className="flex-1 flex flex-col">
          {/* Enemies */}
          <div className="flex-1 flex items-center justify-center gap-6 p-6">
            {enemies.map(enemy => (
              <EnemyCard
                key={enemy.instanceId}
                enemy={enemy}
                isSelected={phase === ACTION_PHASES.target_enemy && pendingAction !== null}
                selectable={phase === ACTION_PHASES.target_enemy}
                onClick={() => handleEnemyTarget(enemy)}
              />
            ))}
          </div>

          {/* Battle log */}
          <div
            className="mx-4 mb-2 p-2 rounded overflow-y-auto"
            style={{
              background: 'rgba(0,5,15,0.8)',
              border: '1px solid #1a2a3a',
              height: 120,
              fontSize: '0.72rem',
              color: '#8899aa',
            }}
          >
            {log.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('Victory') || line.includes('🏆') ? '#e8c44a'
                    : line.includes('☠') || line.includes('defeat') ? '#cc4444'
                    : line.includes('⬆️') ? '#44ddaa'
                    : line.includes('✨') || line.includes('💊') ? '#44cc88'
                    : line.includes('👾') ? '#cc8844'
                    : '#8899aa',
                  paddingBottom: 1,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Party + Actions */}
        <div
          className="flex flex-col gap-2 p-3 overflow-y-auto"
          style={{
            width: 220,
            background: 'rgba(0,3,12,0.9)',
            borderLeft: '1px solid #1a2a3a',
          }}
        >
          {/* Party cards */}
          {party.map(char => (
            <PartyCard
              key={char.id}
              char={char}
              isActive={char.id === currentActor?.id}
              selectable={phase === ACTION_PHASES.target_ally || phase === ACTION_PHASES.target_ally_ko}
              onClick={() => handleAllyTarget(char)}
            />
          ))}

          {/* Action menu */}
          {!battle.result && isPlayerTurn && activeChar && !activeChar.isKO && (
            <div
              className="mt-2 rounded p-2"
              style={{ background: 'rgba(0,10,25,0.9)', border: '1px solid #1a3a5a' }}
            >
              {/* Back button */}
              {phase !== ACTION_PHASES.root && (
                <button
                  className="w-full text-left text-xs mb-2 px-2 py-1 rounded"
                  style={{ color: '#446688', background: 'rgba(0,0,0,0.3)' }}
                  onClick={() => { setPhase(ACTION_PHASES.root); setPendingAction(null); }}
                >
                  ← Back
                </button>
              )}

              {phase === ACTION_PHASES.root && (
                <div className="flex flex-col gap-1">
                  <button className="action-btn" onClick={handleAttack}
                    style={{ background: 'rgba(60,20,20,0.8)', border: '1px solid #882222', color: '#ffaaaa' }}>
                    ⚔️ Attack
                  </button>
                  <button className="action-btn" onClick={() => setPhase(ACTION_PHASES.skill)}
                    style={{ background: 'rgba(20,20,60,0.8)', border: '1px solid #224488', color: '#aabbff' }}>
                    ✨ Skills
                  </button>
                  <button className="action-btn" onClick={() => setPhase(ACTION_PHASES.item)}
                    style={{ background: 'rgba(40,30,10,0.8)', border: '1px solid #664422', color: '#ccaa66' }}>
                    💊 Items
                  </button>
                  <button className="action-btn" onClick={() => dispatch({ type: 'FLEE_BATTLE' })}
                    style={{ background: 'rgba(20,40,20,0.8)', border: '1px solid #224422', color: '#88cc88' }}>
                    💨 Flee
                  </button>
                </div>
              )}

              {phase === ACTION_PHASES.skill && (
                <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 200 }}>
                  <div className="text-xs mb-1" style={{ color: '#446688' }}>— Choose Skill —</div>
                  {availableAbilities.map(ab => (
                    <button
                      key={ab.id}
                      className="action-btn text-left"
                      disabled={ab.cost > activeChar.mp}
                      style={{
                        background: ab.cost > activeChar.mp ? 'rgba(10,10,20,0.5)' : 'rgba(20,20,60,0.8)',
                        border: '1px solid #224466',
                        color: ab.cost > activeChar.mp ? '#334455' : '#aabbdd',
                        opacity: ab.cost > activeChar.mp ? 0.5 : 1,
                      }}
                      onClick={() => handleAbilitySelect(ab)}
                    >
                      <div className="flex justify-between">
                        <span>{ab.name}</span>
                        {ab.cost > 0 && <span style={{ color: '#4466aa', fontSize: '0.65rem' }}>{ab.cost}MP</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {phase === ACTION_PHASES.item && (
                <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 200 }}>
                  <div className="text-xs mb-1" style={{ color: '#446688' }}>— Choose Item —</div>
                  {consumableItems.length === 0 && (
                    <div className="text-xs" style={{ color: '#334455' }}>No items</div>
                  )}
                  {consumableItems.map(({ id, count, item }) => (
                    <button
                      key={id}
                      className="action-btn text-left"
                      style={{ background: 'rgba(40,30,10,0.8)', border: '1px solid #664422', color: '#ccaa66' }}
                      onClick={() => handleItemSelect(id, item)}
                    >
                      <div className="flex justify-between">
                        <span>{item.sprite} {item.name}</span>
                        <span style={{ color: '#886633', fontSize: '0.65rem' }}>x{count}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {phase === ACTION_PHASES.target_enemy && (
                <div className="text-xs text-center" style={{ color: '#cc8844' }}>
                  ↑ Select a target
                </div>
              )}

              {(phase === ACTION_PHASES.target_ally || phase === ACTION_PHASES.target_ally_ko) && (
                <div className="text-xs text-center" style={{ color: '#44aacc' }}>
                  ↑ Select an ally
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Result overlay */}
      {battle.result && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', zIndex: 50 }}
        >
          {battle.result === 'victory' ? (
            <>
              <div className="text-5xl mb-4">🏆</div>
              <div className="text-3xl font-bold mb-2" style={{ color: '#e8c44a', fontFamily: 'monospace' }}>
                VICTORY!
              </div>
              <div className="text-sm mb-1" style={{ color: '#88aacc' }}>
                +{battle.expGained} EXP  |  +{battle.goldGained}g
              </div>
              {battle.levelUps?.map((l, i) => (
                <div key={i} className="text-sm" style={{ color: '#44ddaa' }}>
                  ⬆️ {l.name} → Lv {l.levels[l.levels.length - 1]}!
                </div>
              ))}
              <button
                className="mt-6 px-8 py-3 rounded font-bold text-lg"
                style={{ background: 'rgba(40,30,5,0.9)', border: '2px solid #cc9922', color: '#e8c44a', fontFamily: 'monospace' }}
                onClick={handleEndBattle}
              >
                Continue →
              </button>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">💀</div>
              <div className="text-3xl font-bold mb-2" style={{ color: '#cc4444', fontFamily: 'monospace' }}>
                DEFEAT
              </div>
              <div className="text-sm mb-6" style={{ color: '#664444' }}>The crew has fallen...</div>
              <button
                className="px-8 py-3 rounded font-bold"
                style={{ background: 'rgba(30,5,5,0.9)', border: '2px solid #882222', color: '#cc4444', fontFamily: 'monospace' }}
                onClick={handleEndBattle}
              >
                Game Over
              </button>
            </>
          )}
        </div>
      )}

      <style>{`
        .action-btn {
          width: 100%;
          padding: 6px 10px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.78rem;
          text-align: left;
          transition: filter 0.1s;
          cursor: pointer;
        }
        .action-btn:hover:not(:disabled) {
          filter: brightness(1.3);
        }
      `}</style>
    </div>
  );
}
