export const ENEMIES = {
  // Early game
  space_drone: {
    id: 'space_drone',
    name: 'Space Drone',
    sprite: '🤖',
    hp: 80, maxHp: 80,
    atk: 12, def: 8, agi: 14, mag: 5,
    exp: 24, gold: 18,
    abilities: ['attack'],
    loot: [{ item: 'circuit_chip', chance: 0.3 }, { item: 'energy_cell', chance: 0.15 }],
  },
  smuggler_grunt: {
    id: 'smuggler_grunt',
    name: 'Smuggler Grunt',
    sprite: '👤',
    hp: 120, maxHp: 120,
    atk: 18, def: 12, agi: 16, mag: 6,
    exp: 35, gold: 28,
    abilities: ['attack', 'aimed_shot'],
    loot: [{ item: 'stim_pack', chance: 0.25 }, { item: 'credits', chance: 0.4 }],
  },
  asteroid_crab: {
    id: 'asteroid_crab',
    name: 'Asteroid Crab',
    sprite: '🦀',
    hp: 200, maxHp: 200,
    atk: 24, def: 20, agi: 8, mag: 4,
    exp: 60, gold: 42,
    abilities: ['attack', 'pincer'],
    loot: [{ item: 'carapace_shard', chance: 0.4 }, { item: 'stim_pack', chance: 0.2 }],
  },
  // Mid game
  imperial_soldier: {
    id: 'imperial_soldier',
    name: 'Imperial Soldier',
    sprite: '💂',
    hp: 280, maxHp: 280,
    atk: 32, def: 28, agi: 20, mag: 10,
    exp: 95, gold: 70,
    abilities: ['attack', 'aimed_shot', 'shield_bash'],
    loot: [{ item: 'imperial_badge', chance: 0.15 }, { item: 'ration', chance: 0.35 }],
  },
  plasma_wraith: {
    id: 'plasma_wraith',
    name: 'Plasma Wraith',
    sprite: '👻',
    hp: 220, maxHp: 220,
    atk: 28, def: 14, agi: 30, mag: 36,
    exp: 110, gold: 65,
    abilities: ['attack', 'nova_bolt', 'drain'],
    loot: [{ item: 'phantom_essence', chance: 0.3 }, { item: 'void_crystal', chance: 0.1 }],
  },
  void_beast: {
    id: 'void_beast',
    name: 'Void Beast',
    sprite: '🐉',
    hp: 420, maxHp: 420,
    atk: 44, def: 32, agi: 22, mag: 28,
    exp: 180, gold: 120,
    abilities: ['attack', 'void_breath', 'tail_swipe'],
    loot: [{ item: 'void_scale', chance: 0.5 }, { item: 'ancient_core', chance: 0.12 }],
  },
  // Bosses
  boss_captain_vex: {
    id: 'boss_captain_vex',
    name: 'Captain Vex',
    sprite: '💀',
    hp: 1200, maxHp: 1200,
    atk: 48, def: 36, agi: 26, mag: 20,
    exp: 500, gold: 300,
    abilities: ['attack', 'plasma_slash', 'provoke', 'blitz_drive'],
    loot: [{ item: 'vex_medallion', chance: 1.0 }],
    isBoss: true,
    bossAI: 'vex',
  },
  boss_admiral_nexus: {
    id: 'boss_admiral_nexus',
    name: 'Admiral Nexus',
    sprite: '🌌',
    hp: 2400, maxHp: 2400,
    atk: 62, def: 50, agi: 30, mag: 58,
    exp: 1200, gold: 800,
    abilities: ['attack', 'nebula_blast', 'orbital_strike', 'void_pulse', 'gravity_crush'],
    loot: [{ item: 'nexus_core', chance: 1.0 }],
    isBoss: true,
    bossAI: 'nexus',
  },
};

export const ENCOUNTER_TABLES = {
  asteroid_belt: ['space_drone', 'space_drone', 'asteroid_crab'],
  nebula_outpost: ['smuggler_grunt', 'plasma_wraith', 'smuggler_grunt'],
  imperial_station: ['imperial_soldier', 'imperial_soldier', 'plasma_wraith'],
  void_rift: ['void_beast', 'plasma_wraith', 'void_beast'],
};

export function getRandomEncounter(zone) {
  const table = ENCOUNTER_TABLES[zone] || ENCOUNTER_TABLES.asteroid_belt;
  const count = Math.floor(Math.random() * 2) + 1; // 1-2 enemies
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const templateId = table[Math.floor(Math.random() * table.length)];
    const template = ENEMIES[templateId];
    enemies.push({
      ...template,
      instanceId: `${templateId}_${i}`,
      hp: template.maxHp,
      statusEffects: [],
    });
  }
  return enemies;
}

export function createBoss(bossId) {
  const boss = ENEMIES[bossId];
  return [{ ...boss, instanceId: bossId, hp: boss.maxHp, statusEffects: [] }];
}
