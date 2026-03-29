export const ITEMS = {
  // Consumables
  stim_pack: {
    id: 'stim_pack', name: 'Stim Pack', sprite: '💉',
    type: 'consumable', subtype: 'heal',
    description: 'Restores 150 HP to one ally.',
    value: 80, healAmount: 150,
  },
  mega_stim: {
    id: 'mega_stim', name: 'Mega Stim', sprite: '💊',
    type: 'consumable', subtype: 'heal',
    description: 'Restores 500 HP to one ally.',
    value: 300, healAmount: 500,
  },
  ether_cartridge: {
    id: 'ether_cartridge', name: 'Ether Cartridge', sprite: '⚗️',
    type: 'consumable', subtype: 'mp',
    description: 'Restores 40 MP to one ally.',
    value: 120, mpAmount: 40,
  },
  revive_chip: {
    id: 'revive_chip', name: 'Revive Chip', sprite: '💫',
    type: 'consumable', subtype: 'revive',
    description: 'Revives a KO\'d ally with 25% HP.',
    value: 500,
  },
  // Key items
  vex_medallion: {
    id: 'vex_medallion', name: 'Vex\'s Medallion', sprite: '🏅',
    type: 'key', description: 'The medallion of the defeated pirate captain.',
    value: 0,
  },
  nexus_core: {
    id: 'nexus_core', name: 'Nexus Core', sprite: '💎',
    type: 'key', description: 'The power source of Admiral Nexus. The war is over.',
    value: 0,
  },
  // Crafting materials
  circuit_chip: { id: 'circuit_chip', name: 'Circuit Chip', sprite: '💾', type: 'material', value: 15 },
  energy_cell: { id: 'energy_cell', name: 'Energy Cell', sprite: '🔋', type: 'material', value: 25 },
  carapace_shard: { id: 'carapace_shard', name: 'Carapace Shard', sprite: '🦴', type: 'material', value: 20 },
  void_scale: { id: 'void_scale', name: 'Void Scale', sprite: '🐚', type: 'material', value: 60 },
  void_crystal: { id: 'void_crystal', name: 'Void Crystal', sprite: '🔷', type: 'material', value: 80 },
  phantom_essence: { id: 'phantom_essence', name: 'Phantom Essence', sprite: '🌫️', type: 'material', value: 45 },
  ancient_core: { id: 'ancient_core', name: 'Ancient Core', sprite: '⚙️', type: 'material', value: 150 },
};

export const WEAPONS = {
  plasma_blade: { id: 'plasma_blade', name: 'Plasma Blade', sprite: '⚔️', type: 'weapon', atk: 28, value: 200, classes: ['captain'] },
  warp_rod: { id: 'warp_rod', name: 'Warp Rod', sprite: '🪄', type: 'weapon', atk: 14, mag: 18, value: 200, classes: ['technomancer'] },
  twin_daggers: { id: 'twin_daggers', name: 'Twin Daggers', sprite: '🗡️', type: 'weapon', atk: 24, agi: 4, value: 200, classes: ['scoundrel'] },
  ion_cannon: { id: 'ion_cannon', name: 'Ion Cannon', sprite: '🔫', type: 'weapon', atk: 22, mag: 10, value: 200, classes: ['gunner'] },
  // Shop weapons
  nova_sword: { id: 'nova_sword', name: 'Nova Sword', sprite: '⚔️', type: 'weapon', atk: 42, value: 800, classes: ['captain'] },
  star_staff: { id: 'star_staff', name: 'Star Staff', sprite: '🪄', type: 'weapon', atk: 20, mag: 32, value: 800, classes: ['technomancer'] },
  shadow_blades: { id: 'shadow_blades', name: 'Shadow Blades', sprite: '🗡️', type: 'weapon', atk: 38, agi: 8, value: 800, classes: ['scoundrel'] },
  railgun: { id: 'railgun', name: 'Railgun', sprite: '🔫', type: 'weapon', atk: 36, mag: 16, value: 800, classes: ['gunner'] },
};

export const ARMORS = {
  void_plate: { id: 'void_plate', name: 'Void Plate', sprite: '🛡️', type: 'armor', def: 24, value: 200, classes: ['captain'] },
  phase_cloak: { id: 'phase_cloak', name: 'Phase Cloak', sprite: '🧥', type: 'armor', def: 12, mag: 10, value: 200, classes: ['technomancer'] },
  stealth_suit: { id: 'stealth_suit', name: 'Stealth Suit', sprite: '🥷', type: 'armor', def: 16, agi: 6, value: 200, classes: ['scoundrel'] },
  combat_rig: { id: 'combat_rig', name: 'Combat Rig', sprite: '🦺', type: 'armor', def: 20, value: 200, classes: ['gunner'] },
  // Shop armors
  neutron_armor: { id: 'neutron_armor', name: 'Neutron Armor', sprite: '🛡️', type: 'armor', def: 40, value: 1000, classes: ['captain'] },
  quantum_robe: { id: 'quantum_robe', name: 'Quantum Robe', sprite: '🧥', type: 'armor', def: 22, mag: 20, value: 1000, classes: ['technomancer'] },
  dark_shroud: { id: 'dark_shroud', name: 'Dark Shroud', sprite: '🥷', type: 'armor', def: 30, agi: 10, value: 1000, classes: ['scoundrel'] },
  exo_frame: { id: 'exo_frame', name: 'Exo Frame', sprite: '🦺', type: 'armor', def: 36, value: 1000, classes: ['gunner'] },
};

export const SHOP_INVENTORY = {
  asteroid_belt: {
    items: ['stim_pack', 'ether_cartridge'],
    weapons: [],
    armors: [],
  },
  nebula_outpost: {
    items: ['stim_pack', 'mega_stim', 'ether_cartridge', 'revive_chip'],
    weapons: ['nova_sword', 'star_staff', 'shadow_blades', 'railgun'],
    armors: ['neutron_armor', 'quantum_robe', 'dark_shroud', 'exo_frame'],
  },
};
