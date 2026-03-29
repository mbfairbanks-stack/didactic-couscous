import { createCharacter, CHARACTER_CLASSES, getAbilityData } from './data/characters.js';
import { WORLD_NODES } from './data/world.js';
import { ITEMS, WEAPONS, ARMORS } from './data/items.js';

// ── Initial State ────────────────────────────────────────────────────────────
export function createInitialState() {
  return {
    screen: 'title', // title | story | world | battle | gameover | credits
    chapter: 0,
    storySceneIndex: 0,
    flags: {},           // completed areas, story progress
    currentNode: null,
    party: [
      createCharacter('captain', 'Kira'),
      createCharacter('technomancer', 'Zara'),
      createCharacter('scoundrel', 'Rex'),
      createCharacter('gunner', 'Bolt'),
    ],
    inventory: {
      gold: 200,
      items: { stim_pack: 3, ether_cartridge: 2 },
    },
    battle: null,
    message: null,
    menuMode: null,    // null | 'party' | 'items' | 'equip' | 'shop'
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcDamage(attacker, defender, ability) {
  const isMagic = ability?.type === 'magic';
  const power = ability?.power ?? 1.0;
  const stat = isMagic ? attacker.mag : attacker.atk;
  const resist = isMagic ? Math.floor(defender.def * 0.5) : defender.def;
  const base = Math.max(1, stat * power - resist * 0.6);
  const variance = 0.85 + Math.random() * 0.3;
  return Math.max(1, Math.round(base * variance));
}

function calcHeal(caster, ability) {
  const power = ability?.power ?? 1.0;
  return Math.round((caster.mag * 4 + 60) * power);
}

function applyDamage(target, amount) {
  const newHp = Math.max(0, target.hp - amount);
  return { ...target, hp: newHp, isKO: newHp <= 0 };
}

function applyHeal(target, amount) {
  const newHp = Math.min(target.maxHp, target.hp + amount);
  return { ...target, hp: newHp, isKO: false };
}

function getLevelUpStats(classId) {
  return CHARACTER_CLASSES[classId].growthStats;
}

function calcExpToNext(level) {
  return Math.floor(100 * Math.pow(1.35, level - 1));
}

function levelUp(char) {
  const growth = getLevelUpStats(char.classId);
  const newLevel = char.level + 1;
  const cls = CHARACTER_CLASSES[char.classId];
  const newAbilities = cls.abilities
    .filter(a => a.level === newLevel)
    .map(a => a.id);
  return {
    ...char,
    level: newLevel,
    expNext: calcExpToNext(newLevel),
    maxHp: char.maxHp + growth.hp,
    hp: char.hp + growth.hp,
    maxMp: char.maxMp + growth.mp,
    mp: char.mp + growth.mp,
    atk: char.atk + growth.atk,
    def: char.def + growth.def,
    agi: char.agi + growth.agi,
    mag: char.mag + growth.mag,
    abilities: [...char.abilities, ...newAbilities],
  };
}

function addExp(party, expAmount) {
  const results = [];
  const leveled = party.map(char => {
    if (char.isKO) return char;
    let c = { ...char, exp: char.exp + expAmount };
    const levelUps = [];
    while (c.exp >= c.expNext) {
      c = { ...c, exp: c.exp - c.expNext };
      c = levelUp(c);
      levelUps.push(c.level);
    }
    if (levelUps.length) results.push({ name: c.name, levels: levelUps });
    return c;
  });
  return { party: leveled, levelUps: results };
}

function getEnemyAction(enemy, party) {
  const abilities = enemy.abilities || ['attack'];
  const abilityId = abilities[Math.floor(Math.random() * abilities.length)];
  const aliveParty = party.filter(p => !p.isKO);
  const target = aliveParty[Math.floor(Math.random() * aliveParty.length)];
  return { actorId: enemy.instanceId, abilityId, targetId: target?.id };
}

function buildTurnOrder(party, enemies) {
  const actors = [
    ...party.filter(p => !p.isKO).map(p => ({ ...p, isPlayer: true })),
    ...enemies.filter(e => e.hp > 0).map(e => ({ ...e, isPlayer: false })),
  ];
  return actors.sort((a, b) => b.agi - a.agi);
}

// ── Reducer ───────────────────────────────────────────────────────────────────
export function gameReducer(state, action) {
  switch (action.type) {

    case 'START_GAME': {
      return { ...createInitialState(), screen: 'story', chapter: 0, storySceneIndex: 0 };
    }

    case 'NEXT_STORY_SCENE': {
      return { ...state, storySceneIndex: state.storySceneIndex + 1 };
    }

    case 'GO_TO_WORLD': {
      const flags = { ...state.flags };
      if (action.flag) flags[action.flag] = true;
      return { ...state, screen: 'world', message: null, flags, menuMode: null };
    }

    case 'ENTER_NODE': {
      const node = WORLD_NODES.find(n => n.id === action.nodeId);
      if (!node) return state;
      // Auto-unlock node on visit
      const flags = { ...state.flags };
      if (node.id === 'nebula_outpost') flags['nebula_outpost_visited'] = true;
      return { ...state, currentNode: node, flags };
    }

    case 'LEAVE_NODE': {
      return { ...state, currentNode: null, menuMode: null };
    }

    case 'OPEN_MENU': {
      return { ...state, menuMode: action.menuMode };
    }

    case 'CLOSE_MENU': {
      return { ...state, menuMode: null };
    }

    case 'REST': {
      const restedParty = state.party.map(c => ({
        ...c,
        hp: c.maxHp,
        mp: c.maxMp,
        isKO: false,
        statusEffects: [],
      }));
      return { ...state, party: restedParty, message: 'The crew rests. HP and MP fully restored!' };
    }

    // ── Battle ──────────────────────────────────────────────────────────────
    case 'START_BATTLE': {
      const turnOrder = buildTurnOrder(state.party, action.enemies);
      return {
        ...state,
        screen: 'battle',
        battle: {
          enemies: action.enemies,
          isBoss: action.isBoss || false,
          log: ['⚔️ Battle start!'],
          phase: 'select',     // select | animating | result
          currentTurnIndex: 0,
          turnOrder,
          selectedAction: null,
          selectedTarget: null,
          result: null,        // null | 'victory' | 'defeat'
          expGained: 0,
          goldGained: 0,
          levelUps: [],
          loot: [],
        },
      };
    }

    case 'SELECT_ACTION': {
      return {
        ...state,
        battle: { ...state.battle, selectedAction: action.action },
      };
    }

    case 'EXECUTE_TURN': {
      if (!state.battle) return state;
      const { battle, party } = state;
      const { turnOrder, currentTurnIndex, enemies } = battle;
      const actor = turnOrder[currentTurnIndex];
      if (!actor) return state;

      let newParty = [...party];
      let newEnemies = [...enemies];
      let log = [...battle.log];
      let action_data = action.action;

      if (actor.isPlayer) {
        // Player action
        const charIndex = newParty.findIndex(p => p.id === actor.id);
        if (charIndex === -1) return advanceTurn(state);
        const char = newParty[charIndex];
        const abilityId = action_data?.abilityId || 'attack';
        const abilityDef = getAbilityData(char.classId, abilityId);

        if (abilityDef?.type === 'heal') {
          const targetId = action_data?.targetId;
          const targetIndex = newParty.findIndex(p => p.id === targetId);
          if (targetIndex >= 0) {
            const amount = calcHeal(char, abilityDef);
            newParty[targetIndex] = applyHeal(newParty[targetIndex], amount);
            log.push(`✨ ${char.name} uses ${abilityDef.name}! ${newParty[targetIndex].name} recovers ${amount} HP.`);
            // Deduct MP
            if (abilityDef.cost > 0) newParty[charIndex] = { ...char, mp: Math.max(0, char.mp - abilityDef.cost) };
          }
        } else if (abilityDef?.type === 'magic') {
          const cost = abilityDef.cost || 0;
          if (char.mp < cost) {
            log.push(`❌ ${char.name} doesn't have enough MP!`);
          } else {
            newParty[charIndex] = { ...char, mp: char.mp - cost };
            if (abilityDef.aoe) {
              newEnemies = newEnemies.map(e => {
                if (e.hp <= 0) return e;
                const dmg = calcDamage(char, e, abilityDef);
                log.push(`💥 ${char.name} casts ${abilityDef.name}! ${e.name} takes ${dmg} damage!`);
                return applyDamage(e, dmg);
              });
            } else {
              const targetId = action_data?.targetId;
              const tIdx = newEnemies.findIndex(e => e.instanceId === targetId);
              if (tIdx >= 0) {
                const dmg = calcDamage(char, newEnemies[tIdx], abilityDef);
                log.push(`💥 ${char.name} casts ${abilityDef.name}! ${newEnemies[tIdx].name} takes ${dmg} damage!`);
                newEnemies[tIdx] = applyDamage(newEnemies[tIdx], dmg);
              }
            }
          }
        } else {
          // Physical
          const hits = abilityDef?.hits || 1;
          if (abilityDef?.aoe) {
            newEnemies = newEnemies.map(e => {
              if (e.hp <= 0) return e;
              const dmg = calcDamage(char, e, abilityDef);
              log.push(`⚔️ ${char.name} uses ${abilityDef?.name || 'Attack'}! ${e.name} takes ${dmg} damage!`);
              return applyDamage(e, dmg);
            });
          } else {
            const targetId = action_data?.targetId;
            const tIdx = newEnemies.findIndex(e => e.instanceId === targetId);
            if (tIdx >= 0) {
              for (let h = 0; h < hits; h++) {
                const dmg = calcDamage(char, newEnemies[tIdx], abilityDef);
                log.push(`⚔️ ${char.name} uses ${abilityDef?.name || 'Attack'}! ${newEnemies[tIdx].name} takes ${dmg} damage!`);
                newEnemies[tIdx] = applyDamage(newEnemies[tIdx], dmg);
              }
            }
          }
        }
      } else {
        // Enemy action
        const enemyAction = getEnemyAction(actor, newParty);
        const tIdx = newParty.findIndex(p => p.id === enemyAction.targetId);
        if (tIdx >= 0) {
          const dmg = calcDamage(actor, newParty[tIdx], null);
          log.push(`👾 ${actor.name} attacks ${newParty[tIdx].name} for ${dmg} damage!`);
          newParty[tIdx] = applyDamage(newParty[tIdx], dmg);
        }
      }

      // Keep log bounded
      if (log.length > 12) log = log.slice(log.length - 12);

      // Check victory/defeat
      const allEnemiesDead = newEnemies.every(e => e.hp <= 0);
      const allPartyKO = newParty.every(p => p.isKO);

      let result = null;
      let levelUps = [];
      let expGained = battle.expGained;
      let goldGained = battle.goldGained;

      if (allEnemiesDead) {
        result = 'victory';
        const totalExp = enemies.reduce((s, e) => s + e.exp, 0);
        const totalGold = enemies.reduce((s, e) => s + e.gold, 0);
        expGained = totalExp;
        goldGained = totalGold;
        const expResult = addExp(newParty, totalExp);
        newParty = expResult.party;
        levelUps = expResult.levelUps;
        log.push(`🏆 Victory! Gained ${totalExp} EXP and ${totalGold} gold!`);
        if (levelUps.length) {
          levelUps.forEach(l => log.push(`⬆️ ${l.name} leveled up to level ${l.levels[l.levels.length - 1]}!`));
        }
      } else if (allPartyKO) {
        result = 'defeat';
        log.push('💀 The crew has been defeated...');
      }

      // Advance turn index
      const nextTurnIndex = allEnemiesDead || allPartyKO
        ? currentTurnIndex
        : (currentTurnIndex + 1) % turnOrder.length;

      // Rebuild turn order if needed (skip dead)
      const activeTurnOrder = result
        ? turnOrder
        : buildTurnOrder(newParty, newEnemies);

      return {
        ...state,
        party: newParty,
        battle: {
          ...battle,
          enemies: newEnemies,
          log,
          turnOrder: activeTurnOrder,
          currentTurnIndex: result ? 0 : Math.min(nextTurnIndex, activeTurnOrder.length - 1),
          selectedAction: null,
          result,
          expGained,
          goldGained,
          levelUps,
        },
      };
    }

    case 'USE_ITEM_IN_BATTLE': {
      const { itemId, targetId } = action;
      const item = ITEMS[itemId];
      if (!item) return state;
      const inventory = { ...state.inventory, items: { ...state.inventory.items } };
      if (!inventory.items[itemId] || inventory.items[itemId] <= 0) return state;
      inventory.items[itemId]--;
      if (inventory.items[itemId] <= 0) delete inventory.items[itemId];

      let newParty = [...state.party];
      let log = [...state.battle.log];

      if (item.subtype === 'heal') {
        const tIdx = newParty.findIndex(p => p.id === targetId);
        if (tIdx >= 0) {
          newParty[tIdx] = applyHeal(newParty[tIdx], item.healAmount);
          log.push(`💊 Used ${item.name}! ${newParty[tIdx].name} recovers ${item.healAmount} HP.`);
        }
      } else if (item.subtype === 'revive') {
        const tIdx = newParty.findIndex(p => p.id === targetId);
        if (tIdx >= 0 && newParty[tIdx].isKO) {
          const reviveHp = Math.floor(newParty[tIdx].maxHp * 0.25);
          newParty[tIdx] = { ...newParty[tIdx], hp: reviveHp, isKO: false };
          log.push(`💫 Used ${item.name}! ${newParty[tIdx].name} is revived with ${reviveHp} HP!`);
        }
      } else if (item.subtype === 'mp') {
        const tIdx = newParty.findIndex(p => p.id === targetId);
        if (tIdx >= 0) {
          newParty[tIdx] = { ...newParty[tIdx], mp: Math.min(newParty[tIdx].maxMp, newParty[tIdx].mp + item.mpAmount) };
          log.push(`⚗️ Used ${item.name}! ${newParty[tIdx].name} recovers ${item.mpAmount} MP.`);
        }
      }

      return { ...state, party: newParty, inventory, battle: { ...state.battle, log } };
    }

    case 'END_BATTLE': {
      const { battle } = state;
      if (!battle) return state;
      const newGold = state.inventory.gold + (battle.goldGained || 0);

      // Handle boss flags
      const flags = { ...state.flags };
      if (action.bossKey) flags[action.bossKey] = true;

      // Unlock next nodes
      if (flags['asteroid_belt_cleared']) flags['nebula_outpost_visited'] === undefined && (flags['nebula_outpost_unlocked'] = true);

      const newChapter = action.newChapter ?? state.chapter;

      return {
        ...state,
        screen: 'world',
        chapter: newChapter,
        flags,
        inventory: { ...state.inventory, gold: newGold },
        battle: null,
        message: action.message || null,
      };
    }

    case 'FLEE_BATTLE': {
      return {
        ...state,
        screen: 'world',
        battle: null,
        message: '💨 Fled from battle!',
      };
    }

    case 'USE_ITEM': {
      const { itemId, targetId } = action;
      const item = ITEMS[itemId];
      if (!item) return state;
      const inventory = { ...state.inventory, items: { ...state.inventory.items } };
      if (!inventory.items[itemId] || inventory.items[itemId] <= 0) return state;
      inventory.items[itemId]--;
      if (inventory.items[itemId] <= 0) delete inventory.items[itemId];

      let newParty = [...state.party];
      if (item.subtype === 'heal') {
        const tIdx = newParty.findIndex(p => p.id === targetId);
        if (tIdx >= 0) newParty[tIdx] = applyHeal(newParty[tIdx], item.healAmount);
      } else if (item.subtype === 'revive') {
        const tIdx = newParty.findIndex(p => p.id === targetId);
        if (tIdx >= 0 && newParty[tIdx].isKO) {
          const reviveHp = Math.floor(newParty[tIdx].maxHp * 0.25);
          newParty[tIdx] = { ...newParty[tIdx], hp: reviveHp, isKO: false };
        }
      }

      return { ...state, party: newParty, inventory };
    }

    case 'BUY_ITEM': {
      const { itemId, itemType } = action;
      const catalog = itemType === 'weapon' ? WEAPONS : itemType === 'armor' ? ARMORS : ITEMS;
      const item = catalog[itemId];
      if (!item || state.inventory.gold < item.value) return state;
      const inventory = { ...state.inventory, gold: state.inventory.gold - item.value };
      if (itemType === 'consumable') {
        inventory.items = { ...inventory.items, [itemId]: (inventory.items[itemId] || 0) + 1 };
      }
      return { ...state, inventory };
    }

    case 'EQUIP_ITEM': {
      const { charId, slot, itemId } = action;
      const cIdx = state.party.findIndex(p => p.id === charId);
      if (cIdx < 0) return state;
      const newParty = [...state.party];
      newParty[cIdx] = {
        ...newParty[cIdx],
        equipment: { ...newParty[cIdx].equipment, [slot]: itemId },
      };
      return { ...state, party: newParty };
    }

    case 'GAME_OVER': {
      return { ...state, screen: 'gameover', battle: null };
    }

    case 'CLEAR_MESSAGE': {
      return { ...state, message: null };
    }

    case 'ADVANCE_CHAPTER': {
      return { ...state, chapter: action.chapter, screen: 'story', storySceneIndex: 0 };
    }

    default:
      return state;
  }
}

function advanceTurn(state) {
  const battle = state.battle;
  const next = (battle.currentTurnIndex + 1) % battle.turnOrder.length;
  return { ...state, battle: { ...battle, currentTurnIndex: next } };
}
