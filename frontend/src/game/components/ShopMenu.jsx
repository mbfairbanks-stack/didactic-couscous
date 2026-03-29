import { useState } from 'react';
import { ITEMS, WEAPONS, ARMORS, SHOP_INVENTORY } from '../data/items.js';

export default function ShopMenu({ state, dispatch }) {
  const [tab, setTab] = useState('items');
  const [hoveredItem, setHoveredItem] = useState(null);

  const nodeId = state.currentNode?.id;
  const shopData = SHOP_INVENTORY[nodeId] || SHOP_INVENTORY.asteroid_belt;
  const { gold, items } = state.inventory;

  function buy(itemId, type) {
    dispatch({ type: 'BUY_ITEM', itemId, itemType: type });
  }

  const shopItems = shopData.items.map(id => ({ id, data: ITEMS[id], type: 'consumable' }));
  const shopWeapons = shopData.weapons.map(id => ({ id, data: WEAPONS[id], type: 'weapon' }));
  const shopArmors = shopData.armors.map(id => ({ id, data: ARMORS[id], type: 'armor' }));

  const catalog = tab === 'items' ? shopItems : tab === 'weapons' ? shopWeapons : shopArmors;

  function getOwnedCount(id) {
    return state.inventory.items[id] || 0;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', zIndex: 30, fontFamily: 'monospace' }}
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'rgba(2,8,20,0.99)',
          border: '2px solid #2a5a3a',
          width: '90%',
          maxWidth: 600,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ background: 'rgba(10,30,15,0.9)', borderBottom: '1px solid #1a4a2a' }}
        >
          <div>
            <div className="font-bold" style={{ color: '#66ccaa' }}>🛒 Space Bazaar</div>
            <div className="text-xs" style={{ color: '#336644' }}>{state.currentNode?.name}</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-bold" style={{ color: '#e8c44a' }}>💰 {gold}g</span>
            <button
              className="text-xs px-3 py-1 rounded"
              style={{ color: '#445566', border: '1px solid #223344', background: 'transparent' }}
              onClick={() => dispatch({ type: 'CLOSE_MENU' })}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-3 gap-2">
          {[
            { key: 'items', label: '💊 Items', count: shopItems.length },
            { key: 'weapons', label: '⚔️ Weapons', count: shopWeapons.length },
            { key: 'armors', label: '🛡️ Armor', count: shopArmors.length },
          ].map(t => (
            <button
              key={t.key}
              className="px-3 py-1 rounded text-xs"
              style={{
                background: tab === t.key ? 'rgba(20,60,30,0.9)' : 'rgba(0,10,5,0.6)',
                border: `1px solid ${tab === t.key ? '#2a7a4a' : '#112a1a'}`,
                color: tab === t.key ? '#66cc88' : '#334444',
              }}
              onClick={() => setTab(t.key)}
            >
              {t.label} {t.count === 0 && <span style={{ color: '#223322' }}>(—)</span>}
            </button>
          ))}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {catalog.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: '#334444' }}>
              No {tab} available here.
            </div>
          )}
          {catalog.map(({ id, data, type }) => {
            if (!data) return null;
            const canAfford = gold >= data.value;
            const owned = type === 'consumable' ? getOwnedCount(id) : null;
            return (
              <div
                key={id}
                className="flex items-center gap-3 p-3 rounded transition-all cursor-pointer"
                style={{
                  background: hoveredItem === id ? 'rgba(15,40,20,0.9)' : 'rgba(5,15,10,0.8)',
                  border: `1px solid ${hoveredItem === id ? '#2a6a3a' : '#112a1a'}`,
                  opacity: canAfford ? 1 : 0.5,
                }}
                onMouseEnter={() => setHoveredItem(id)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span style={{ fontSize: '1.8rem' }}>{data.sprite}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-sm" style={{ color: '#aaccbb' }}>{data.name}</span>
                    {owned !== null && (
                      <span className="text-xs" style={{ color: '#446655' }}>Own: {owned}</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#446655' }}>{data.description}</div>
                  {type === 'weapon' && (
                    <div className="text-xs mt-0.5" style={{ color: '#668844' }}>
                      ATK +{data.atk || 0}
                      {data.mag ? ` · MAG +${data.mag}` : ''}
                      {data.agi ? ` · AGI +${data.agi}` : ''}
                    </div>
                  )}
                  {type === 'armor' && (
                    <div className="text-xs mt-0.5" style={{ color: '#668844' }}>
                      DEF +{data.def || 0}
                      {data.mag ? ` · MAG +${data.mag}` : ''}
                      {data.agi ? ` · AGI +${data.agi}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold" style={{ color: canAfford ? '#e8c44a' : '#664422' }}>
                    {data.value}g
                  </span>
                  <button
                    className="px-3 py-1 rounded text-xs font-bold"
                    style={{
                      background: canAfford ? 'rgba(30,50,10,0.9)' : 'rgba(10,10,10,0.5)',
                      border: `1px solid ${canAfford ? '#448822' : '#223322'}`,
                      color: canAfford ? '#88cc44' : '#334433',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => canAfford && buy(id, type)}
                    disabled={!canAfford}
                  >
                    Buy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
