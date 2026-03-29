import { useState } from 'react';
import { CHARACTER_CLASSES, getAvailableAbilities } from '../data/characters.js';
import { WEAPONS, ARMORS, ITEMS } from '../data/items.js';

function StatRow({ label, value, diff }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span style={{ color: '#556677' }}>{label}</span>
      <span style={{ color: diff > 0 ? '#44cc88' : diff < 0 ? '#cc4444' : '#aabbcc' }}>
        {value}
        {diff !== 0 && <span style={{ color: diff > 0 ? '#44cc88' : '#cc4444', marginLeft: 4 }}>
          ({diff > 0 ? '+' : ''}{diff})
        </span>}
      </span>
    </div>
  );
}

function CharacterPanel({ char, selected, onClick }) {
  const cls = CHARACTER_CLASSES[char.classId];
  const expPct = char.expNext > 0 ? (char.exp / char.expNext) * 100 : 0;
  return (
    <button
      className="rounded p-3 text-left transition-all w-full"
      style={{
        background: selected ? 'rgba(20,40,80,0.95)' : 'rgba(0,10,25,0.8)',
        border: `2px solid ${selected ? '#4488ff' : '#1a3a5a'}`,
        boxShadow: selected ? '0 0 16px #224488' : 'none',
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 mb-2">
        <span style={{ fontSize: '2rem' }}>{char.sprite}</span>
        <div>
          <div className="font-bold" style={{ color: '#ddeeff' }}>{char.name}</div>
          <div className="text-xs" style={{ color: '#4488aa' }}>{cls.name} · Lv{char.level}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <StatRow label="HP" value={`${char.hp}/${char.maxHp}`} diff={0} />
        <StatRow label="MP" value={`${char.mp}/${char.maxMp}`} diff={0} />
        <StatRow label="ATK" value={char.atk} diff={0} />
        <StatRow label="DEF" value={char.def} diff={0} />
        <StatRow label="AGI" value={char.agi} diff={0} />
        <StatRow label="MAG" value={char.mag} diff={0} />
      </div>
      <div className="mt-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span style={{ color: '#446688' }}>EXP</span>
          <span style={{ color: '#446688' }}>{char.exp}/{char.expNext}</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: '#112' }}>
          <div style={{ width: `${expPct}%`, height: '100%', background: '#4466dd' }} />
        </div>
      </div>
    </button>
  );
}

export default function PartyMenu({ state, dispatch }) {
  const { party, inventory } = state;
  const [selectedCharIdx, setSelectedCharIdx] = useState(0);
  const [tab, setTab] = useState('stats'); // stats | abilities | equip

  const char = party[selectedCharIdx];
  const cls = CHARACTER_CLASSES[char?.classId];

  const abilities = char ? getAvailableAbilities(char) : [];

  const equippedWeapon = char?.equipment?.weapon ? WEAPONS[char.equipment.weapon] : null;
  const equippedArmor = char?.equipment?.armor ? ARMORS[char.equipment.armor] : null;

  return (
    <div
      className="fixed inset-0 flex overflow-hidden"
      style={{ background: 'rgba(0,5,15,0.97)', fontFamily: 'monospace', zIndex: 30 }}
    >
      {/* Left: character list */}
      <div
        className="flex flex-col gap-2 p-4 overflow-y-auto"
        style={{ width: 240, borderRight: '1px solid #1a2a3a' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm" style={{ color: '#88aacc' }}>Party</span>
          <span className="text-xs" style={{ color: '#446688' }}>💰 {inventory.gold}g</span>
        </div>
        {party.map((c, i) => (
          <CharacterPanel
            key={c.id}
            char={c}
            selected={i === selectedCharIdx}
            onClick={() => setSelectedCharIdx(i)}
          />
        ))}
        <button
          className="mt-auto py-2 rounded text-sm"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #223344', color: '#445566' }}
          onClick={() => dispatch({ type: 'CLOSE_MENU' })}
        >
          ← Close
        </button>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {char && (
          <>
            {/* Character header */}
            <div className="flex items-center gap-4 mb-4 pb-3" style={{ borderBottom: '1px solid #1a2a3a' }}>
              <span style={{ fontSize: '3rem' }}>{char.sprite}</span>
              <div>
                <div className="text-xl font-bold" style={{ color: '#ddeeff' }}>{char.name}</div>
                <div className="text-sm" style={{ color: '#4488aa' }}>{cls?.name} · Level {char.level}</div>
                <div className="text-xs mt-1" style={{ color: '#336655' }}>{cls?.description}</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {['stats', 'abilities', 'equip'].map(t => (
                <button
                  key={t}
                  className="px-4 py-1 rounded text-xs capitalize"
                  style={{
                    background: tab === t ? 'rgba(20,40,80,0.9)' : 'rgba(0,10,25,0.6)',
                    border: `1px solid ${tab === t ? '#4488ff' : '#1a3a5a'}`,
                    color: tab === t ? '#88bbff' : '#445566',
                  }}
                  onClick={() => setTab(t)}
                >
                  {t === 'stats' ? '📊 Stats' : t === 'abilities' ? '✨ Skills' : '⚔️ Equip'}
                </button>
              ))}
            </div>

            {tab === 'stats' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded p-3" style={{ background: 'rgba(0,10,25,0.7)', border: '1px solid #1a3a5a' }}>
                  <div className="text-xs mb-2 font-bold" style={{ color: '#4488aa' }}>Combat Stats</div>
                  <StatRow label="HP" value={`${char.hp} / ${char.maxHp}`} diff={0} />
                  <StatRow label="MP" value={`${char.mp} / ${char.maxMp}`} diff={0} />
                  <StatRow label="ATK" value={char.atk} diff={0} />
                  <StatRow label="DEF" value={char.def} diff={0} />
                  <StatRow label="AGI" value={char.agi} diff={0} />
                  <StatRow label="MAG" value={char.mag} diff={0} />
                </div>
                <div className="rounded p-3" style={{ background: 'rgba(0,10,25,0.7)', border: '1px solid #1a3a5a' }}>
                  <div className="text-xs mb-2 font-bold" style={{ color: '#4488aa' }}>Progress</div>
                  <StatRow label="Level" value={char.level} diff={0} />
                  <StatRow label="EXP" value={char.exp} diff={0} />
                  <StatRow label="Next Lv" value={char.expNext} diff={0} />
                  <div className="mt-2">
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#112' }}>
                      <div style={{ width: `${(char.exp / char.expNext) * 100}%`, height: '100%', background: '#4466dd' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'abilities' && (
              <div className="flex flex-col gap-2">
                {abilities.map(ab => (
                  <div
                    key={ab.id}
                    className="rounded p-3"
                    style={{ background: 'rgba(5,15,35,0.8)', border: '1px solid #1a3060' }}
                  >
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-sm" style={{ color: '#aabbff' }}>{ab.name}</span>
                      <div className="flex gap-3 text-xs">
                        <span style={{ color: '#446688' }}>{ab.type}</span>
                        {ab.cost > 0 && <span style={{ color: '#4466aa' }}>{ab.cost} MP</span>}
                        {ab.power && ab.power !== 1.0 && (
                          <span style={{ color: '#668844' }}>{ab.power}× power</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: '#556677' }}>{ab.description}</div>
                  </div>
                ))}
                {/* Upcoming abilities */}
                {cls?.abilities.filter(a => a.level > char.level).slice(0, 3).map(ab => (
                  <div
                    key={ab.id}
                    className="rounded p-3 opacity-40"
                    style={{ background: 'rgba(0,5,15,0.5)', border: '1px solid #0a1a2a' }}
                  >
                    <div className="flex justify-between">
                      <span className="text-sm" style={{ color: '#445566' }}>{ab.name}</span>
                      <span className="text-xs" style={{ color: '#334455' }}>Lv{ab.level}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'equip' && (
              <div className="flex flex-col gap-3">
                <div className="rounded p-3" style={{ background: 'rgba(0,10,25,0.7)', border: '1px solid #1a3a5a' }}>
                  <div className="text-xs mb-2 font-bold" style={{ color: '#4488aa' }}>Equipped</div>
                  <div className="flex items-center gap-3 mb-2">
                    <span style={{ fontSize: '1.5rem' }}>{equippedWeapon?.sprite || '—'}</span>
                    <div>
                      <div className="text-sm" style={{ color: '#ccddee' }}>{equippedWeapon?.name || 'No Weapon'}</div>
                      {equippedWeapon && <div className="text-xs" style={{ color: '#446688' }}>ATK +{equippedWeapon.atk || 0}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '1.5rem' }}>{equippedArmor?.sprite || '—'}</span>
                    <div>
                      <div className="text-sm" style={{ color: '#ccddee' }}>{equippedArmor?.name || 'No Armor'}</div>
                      {equippedArmor && <div className="text-xs" style={{ color: '#446688' }}>DEF +{equippedArmor.def || 0}</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

