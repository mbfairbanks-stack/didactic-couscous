export const STORY_CHAPTERS = [
  {
    id: 0,
    title: 'Prologue: The Galactic Frontier',
    scenes: [
      {
        id: 'intro_1',
        text: 'The year is 2847. The Galactic Imperium has ruled the stars with an iron fist for three centuries.',
        background: 'stars',
      },
      {
        id: 'intro_2',
        text: 'You are the captain of the *Void Serpent*, the most feared pirate vessel in the outer rim.',
        background: 'ship',
      },
      {
        id: 'intro_3',
        text: 'A distress beacon from the Asteroid Belt... it\'s your old crew member, Zara the Technomancer.',
        background: 'ship',
      },
      {
        id: 'intro_4',
        text: 'But something feels wrong. The Imperium\'s signature is all over this signal.',
        background: 'space',
      },
    ],
  },
  {
    id: 1,
    title: 'Chapter I: Asteroid Belt Ambush',
    scenes: [
      {
        id: 'ch1_1',
        text: 'The Void Serpent drops out of warp near the Kestrel Asteroid Belt.',
        background: 'asteroids',
      },
      {
        id: 'ch1_2',
        text: '"Captain! Imperial drones on sensors!" your Gunner shouts from the bridge.',
        background: 'ship',
      },
    ],
  },
  {
    id: 2,
    title: 'Chapter II: The Nebula Outpost',
    scenes: [
      {
        id: 'ch2_1',
        text: 'With Zara rescued, the crew regroups at the hidden Nebula Outpost.',
        background: 'nebula',
      },
      {
        id: 'ch2_2',
        text: 'Intel reveals Admiral Nexus is constructing a superweapon in the Void Rift.',
        background: 'nebula',
      },
    ],
  },
  {
    id: 3,
    title: 'Chapter III: Imperial Station',
    scenes: [
      {
        id: 'ch3_1',
        text: 'The crew infiltrates the Imperial Research Station to steal the weapon schematics.',
        background: 'station',
      },
    ],
  },
  {
    id: 4,
    title: 'Final Chapter: The Void Rift',
    scenes: [
      {
        id: 'ch4_1',
        text: 'Armed with the schematics, the Void Serpent plunges into the Void Rift.',
        background: 'void',
      },
      {
        id: 'ch4_2',
        text: '"Admiral Nexus!" the Captain shouts. "This ends today!"',
        background: 'void',
      },
    ],
  },
];

export const WORLD_NODES = [
  {
    id: 'void_serpent',
    name: 'Void Serpent',
    subtitle: 'Your Ship',
    sprite: '🚀',
    x: 50, y: 75,
    type: 'hub',
    description: 'Your faithful ship. Repair, rest, and manage your crew here.',
    actions: ['rest', 'manage_party', 'save'],
    unlocked: true,
    chapterRequired: 0,
  },
  {
    id: 'asteroid_belt',
    name: 'Kestrel Asteroid Belt',
    subtitle: 'Zone 1',
    sprite: '☄️',
    x: 25, y: 55,
    type: 'dungeon',
    description: 'A dangerous field of asteroids patrolled by Imperial drones.',
    actions: ['explore', 'shop'],
    encounters: 'asteroid_belt',
    boss: 'boss_captain_vex',
    unlocked: true,
    chapterRequired: 1,
    completedKey: 'asteroid_belt_cleared',
  },
  {
    id: 'nebula_outpost',
    name: 'Nebula Outpost',
    subtitle: 'Safe Zone',
    sprite: '🌌',
    x: 65, y: 40,
    type: 'town',
    description: 'A hidden pirate outpost in the heart of the Cygnus Nebula.',
    actions: ['shop', 'rest', 'story'],
    unlocked: false,
    chapterRequired: 2,
    unlockedBy: 'asteroid_belt_cleared',
  },
  {
    id: 'imperial_station',
    name: 'Imperial Station Alpha',
    subtitle: 'Zone 2',
    sprite: '🏭',
    x: 80, y: 60,
    type: 'dungeon',
    description: 'A heavily guarded Imperial research facility.',
    actions: ['explore'],
    encounters: 'imperial_station',
    boss: null,
    unlocked: false,
    chapterRequired: 3,
    unlockedBy: 'nebula_outpost_visited',
    completedKey: 'station_cleared',
  },
  {
    id: 'void_rift',
    name: 'The Void Rift',
    subtitle: 'Final Zone',
    sprite: '🌀',
    x: 50, y: 20,
    type: 'final',
    description: 'A tear in space-time where Admiral Nexus builds his superweapon.',
    actions: ['explore'],
    encounters: 'void_rift',
    boss: 'boss_admiral_nexus',
    unlocked: false,
    chapterRequired: 4,
    unlockedBy: 'station_cleared',
    completedKey: 'nexus_defeated',
  },
];

export function getNodeById(id) {
  return WORLD_NODES.find(n => n.id === id);
}
