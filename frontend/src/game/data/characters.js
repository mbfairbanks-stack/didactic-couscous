export const CHARACTER_CLASSES = {
  captain: {
    id: 'captain',
    name: 'Captain',
    sprite: '🏴‍☠️',
    description: 'A battle-hardened space pirate captain. High HP and ATK.',
    baseStats: { hp: 520, mp: 60, atk: 38, def: 32, agi: 22, mag: 12 },
    growthStats: { hp: 45, mp: 5, atk: 4, def: 3, agi: 2, mag: 1 },
    abilities: [
      { level: 1,  id: 'attack',      name: 'Attack',       type: 'physical', cost: 0 },
      { level: 1,  id: 'slash',       name: 'Plasma Slash', type: 'physical', cost: 0, power: 1.5, description: 'A powerful slash with a plasma blade.' },
      { level: 6,  id: 'provoke',     name: 'Provoke',      type: 'status',   cost: 8, description: 'Taunt enemies to target the Captain.' },
      { level: 12, id: 'blitz_drive', name: 'Blitz Drive',  type: 'physical', cost: 0, power: 2.2, description: 'A devastating combo strike.' },
      { level: 20, id: 'broadside',   name: 'Broadside',    type: 'physical', cost: 0, power: 1.2, hits: 3, description: 'Three rapid strikes.' },
    ],
    equipment: { weapon: 'plasma_blade', armor: 'void_plate', accessory: null },
  },
  technomancer: {
    id: 'technomancer',
    name: 'Technomancer',
    sprite: '🔮',
    description: 'A mage who channels stellar energy. High MAG and MP.',
    baseStats: { hp: 330, mp: 220, atk: 18, def: 18, agi: 24, mag: 42 },
    growthStats: { hp: 28, mp: 20, atk: 1, def: 1, agi: 2, mag: 5 },
    abilities: [
      { level: 1,  id: 'attack',       name: 'Attack',        type: 'physical', cost: 0 },
      { level: 1,  id: 'nova_bolt',    name: 'Nova Bolt',     type: 'magic',    cost: 8,  power: 1.0, element: 'fire',    description: 'A bolt of stellar plasma.' },
      { level: 4,  id: 'void_chill',   name: 'Void Chill',    type: 'magic',    cost: 10, power: 1.0, element: 'ice',     description: 'Freezing void energy.' },
      { level: 8,  id: 'arc_storm',    name: 'Arc Storm',     type: 'magic',    cost: 14, power: 1.0, element: 'thunder', description: 'Crackling ion discharge.' },
      { level: 14, id: 'nebula_blast', name: 'Nebula Blast',  type: 'magic',    cost: 28, power: 2.5, element: 'fire',    description: 'Massive stellar explosion. Hits all enemies.' , aoe: true},
      { level: 18, id: 'cure',         name: 'Medi-Pulse',    type: 'heal',     cost: 12, power: 1.2, description: 'Restores HP to one ally.' },
      { level: 22, id: 'curaga',       name: 'Medi-Surge',    type: 'heal',     cost: 28, power: 2.5, description: 'Greatly restores HP to one ally.' },
    ],
    equipment: { weapon: 'warp_rod', armor: 'phase_cloak', accessory: null },
  },
  scoundrel: {
    id: 'scoundrel',
    name: 'Scoundrel',
    sprite: '🗡️',
    description: 'A cunning rogue who strikes from the shadows. High AGI.',
    baseStats: { hp: 380, mp: 100, atk: 34, def: 22, agi: 38, mag: 18 },
    growthStats: { hp: 32, mp: 8, atk: 3, def: 2, agi: 4, mag: 2 },
    abilities: [
      { level: 1,  id: 'attack',       name: 'Attack',        type: 'physical', cost: 0 },
      { level: 1,  id: 'steal',        name: 'Pilfer',        type: 'steal',    cost: 0, description: 'Steal an item from an enemy.' },
      { level: 5,  id: 'backstab',     name: 'Backstab',      type: 'physical', cost: 0, power: 2.0, description: 'A sneak attack dealing double damage.' },
      { level: 10, id: 'smokescreen',  name: 'Smokescreen',   type: 'status',   cost: 6, description: 'Reduces enemy accuracy.' },
      { level: 16, id: 'shadow_rush',  name: 'Shadow Rush',   type: 'physical', cost: 0, power: 1.3, hits: 2, description: 'Two quick shadow-enhanced strikes.' },
      { level: 24, id: 'deathblow',    name: 'Deathblow',     type: 'physical', cost: 0, power: 3.5, description: 'A devastating strike. May instant KO.' },
    ],
    equipment: { weapon: 'twin_daggers', armor: 'stealth_suit', accessory: null },
  },
  gunner: {
    id: 'gunner',
    name: 'Gunner',
    sprite: '🔫',
    description: 'A mechanical genius and crack shot. Balanced stats.',
    baseStats: { hp: 420, mp: 140, atk: 30, def: 26, agi: 28, mag: 24 },
    growthStats: { hp: 36, mp: 12, atk: 3, def: 2, agi: 2, mag: 2 },
    abilities: [
      { level: 1,  id: 'attack',        name: 'Attack',         type: 'physical', cost: 0 },
      { level: 1,  id: 'aimed_shot',    name: 'Aimed Shot',     type: 'physical', cost: 0, power: 1.4, description: 'A precise shot targeting weak points.' },
      { level: 3,  id: 'repair_drone',  name: 'Repair Drone',   type: 'heal',     cost: 16, power: 1.0, description: 'Deploy a drone to restore HP to an ally.' },
      { level: 7,  id: 'frag_grenade',  name: 'Frag Grenade',   type: 'physical', cost: 0, power: 0.9, aoe: true, description: 'Lob a grenade at all enemies.' },
      { level: 12, id: 'chaingun',      name: 'Chaingun',       type: 'physical', cost: 0, power: 0.6, hits: 4, description: 'Rapid fire attack hitting 4 times.' },
      { level: 20, id: 'orbital_strike','name': 'Orbital Strike', type: 'magic', cost: 30, power: 3.0, aoe: true, description: 'Call down a strike from orbit. Hits all enemies.' },
    ],
    equipment: { weapon: 'ion_cannon', armor: 'combat_rig', accessory: null },
  },
};

export const STARTING_PARTY = ['captain', 'technomancer', 'scoundrel', 'gunner'];

export function createCharacter(classId, name = null) {
  const cls = CHARACTER_CLASSES[classId];
  if (!cls) throw new Error(`Unknown class: ${classId}`);
  return {
    id: `${classId}_${Date.now()}`,
    classId,
    name: name || cls.name,
    sprite: cls.sprite,
    level: 1,
    exp: 0,
    expNext: 100,
    hp: cls.baseStats.hp,
    maxHp: cls.baseStats.hp,
    mp: cls.baseStats.mp,
    maxMp: cls.baseStats.mp,
    atk: cls.baseStats.atk,
    def: cls.baseStats.def,
    agi: cls.baseStats.agi,
    mag: cls.baseStats.mag,
    equipment: { ...cls.equipment },
    statusEffects: [],
    abilities: cls.abilities.filter(a => a.level <= 1).map(a => a.id),
    isKO: false,
  };
}

export function getAvailableAbilities(character) {
  const cls = CHARACTER_CLASSES[character.classId];
  return cls.abilities.filter(a => a.level <= character.level);
}

export function getAbilityData(classId, abilityId) {
  const cls = CHARACTER_CLASSES[classId];
  return cls.abilities.find(a => a.id === abilityId);
}
