// Dario Vega's story: five missions for Coral Bay fixer Sal Marchetti, from a welcome-home
// chat to a marina getaway, plus taxi fares to earn in free roam. Each mission is a list of
// steps — go somewhere, steal something, survive something — with dialogue lines, an
// on-screen objective, a map target, a cash reward, and the next mission queued behind it.

import { PLACES } from './city.js';
import { dist2d } from './util.js';

export function createMissions(game) {
  const { hud, audio } = game;
  let active = null; // { def, step, timer }
  let dialogueQueue = [];
  let dialogueT = 0;
  let fare = null; // { ped, dest, fromX, fromZ } while a taxi fare is running
  let startDelay = 0; // let MISSION PASSED breathe before the next title card

  function say(who, text, seconds = 3.4) {
    dialogueQueue.push({ who, text, seconds });
  }

  function playerNear(place, r) {
    return dist2d(game.player.x, game.player.z, place.x, place.z) < r;
  }

  function passMission(reward) {
    const title = active.def.title;
    game.save.missionIndex += 1;
    game.addMoney(reward);
    audio.cash();
    hud.bigTitle('MISSION PASSED', `${title}  ·  +$${reward}`);
    game.persist();
    active = null;
    startDelay = 3;
  }

  const DEFS = [
    {
      title: 'Welcome Home, Dario',
      begin() {},
      steps: [
        {
          text: () => "Go to Sal's Chop Shop",
          target: () => PLACES.chopShop,
          done: () => playerNear(PLACES.chopShop, 7),
          arrive() {
            say('Sal', 'Dario Vega. Six years inside and you still walk like you own the sidewalk.');
            say('Dario', 'Sidewalk is all I own, Sal. Tell me there is work.');
            say('Sal', 'There is work. And a little something for your waistband. Take it.');
            game.save.hasGun = true;
            game.persist();
            passMission(150);
          },
        },
      ],
    },
    {
      title: 'The Gold Convertible',
      begin() {
        game.spawnGoldCar();
        say('Sal', 'A collector owes me. His gold convertible sits on Ocean Ave. Bring it home.');
      },
      steps: [
        {
          text: () => 'Steal the gold convertible on Ocean Ave',
          target: () => PLACES.goldCarSpot,
          done: () => game.player.inCar && game.player.inCar === game.goldCar,
          arrive() {
            say('Dario', 'Sorry, friend. Sal sends his regards.');
            game.wanted.report(2, game.player.x, game.player.z, true);
          },
        },
        {
          text: () => "Deliver the convertible to Sal's Chop Shop",
          target: () => PLACES.chopShop,
          done: () => game.player.inCar === game.goldCar && playerNear(PLACES.chopShop, 10),
          arrive() {
            say('Sal', 'Beautiful. Not a scratch she cannot buff out. You still have the touch.');
            game.goldCar = null;
            passMission(400);
          },
        },
      ],
    },
    {
      title: 'Hot Package',
      begin() {
        say('Sal', 'Sunset Motors is holding a package for me. The whole bay will want it. Drive fast.');
      },
      steps: [
        {
          text: () => 'Pick up the package at Sunset Motors',
          target: () => PLACES.carLot,
          done: () => playerNear(PLACES.carLot, 8),
          arrive() {
            say('Dealer', 'You Sal\u2019s boy? It is in the trunk. Do not stop for anybody, hear me?');
            game.wanted.report(4, game.player.x, game.player.z, true);
            active.timer = 150;
          },
        },
        {
          text: () => `Deliver the package to the Palms Hotel — ${Math.max(0, Math.ceil(active.timer ?? 0))}s`,
          target: () => PLACES.dropOff,
          done: () => playerNear(PLACES.dropOff, 9),
          fail: () => active.timer !== null && active.timer <= 0,
          onFail() {
            say('Sal', 'Package is cold, Dario. Go get it again — and this time, wings.');
            active.step = 0;
            active.timer = null;
          },
          arrive() {
            say('Concierge', 'Mr. Marchetti\u2019s parcel. He said you would be... quick.');
            game.wanted.clear();
            passMission(650);
          },
        },
      ],
    },
    {
      title: 'Beachside Business',
      begin() {
        say('Sal', 'The Vultures are taxing my pier. Rico is waiting. Take the briefcase back.');
      },
      steps: [
        {
          text: () => 'Meet Rico at Coral Pier',
          target: () => PLACES.pier,
          done: () => playerNear(PLACES.pier, 9),
          arrive() {
            say('Rico', 'They are at the pier, four of them. I will keep the car running, hero.');
            game.spawnGang(4, PLACES.pier.x, PLACES.pier.z - 8);
          },
        },
        {
          text: () => `Take out the Vultures — ${game.gang.filter((p) => p.state !== 'down').length} standing`,
          target: () => game.gang.find((p) => p.state !== 'down') || PLACES.pier,
          done: () => game.gang.length > 0 && game.gang.every((p) => p.state === 'down'),
          arrive() {},
        },
        {
          text: () => 'Get back to Sal with the briefcase',
          target: () => PLACES.chopShop,
          done: () => playerNear(PLACES.chopShop, 9),
          arrive() {
            say('Sal', 'The pier is mine again. The Vultures will think twice now.');
            game.gang = [];
            passMission(900);
          },
        },
      ],
    },
    {
      title: 'The Long Goodbye',
      begin() {
        say('Sal', 'Last job, Dario. The boat at the marina is your ticket out. Every cop in the bay knows.');
        active.timer = 130;
        game.wanted.report(6, game.player.x, game.player.z, true);
      },
      steps: [
        {
          text: () => `Reach the boat at Coral Bay Marina — ${Math.max(0, Math.ceil(active.timer ?? 0))}s`,
          target: () => PLACES.marina,
          done: () => playerNear(PLACES.marina, 11),
          fail: () => active.timer !== null && active.timer <= 0,
          onFail() {
            active.timer = 130;
            game.wanted.report(2, game.player.x, game.player.z, true);
            say('Sal', 'The boat waits one more tide, Dario. Again — faster.');
          },
          arrive() {
            say('Sal', 'Cast off, kid. Coral Bay will be here when the heat dies. It always is.');
            game.wanted.clear();
            passMission(2000);
            hud.bigTitle('STORY COMPLETE', 'Dario Vega owns Coral Bay now — free roam is yours', 5);
          },
        },
      ],
    },
  ];

  function startCurrent() {
    const idx = game.save.missionIndex;
    if (idx >= DEFS.length) {
      active = null;
      hud.setObjective('Free roam — pick up taxi fares for cash. Coral Bay is yours.');
      return;
    }
    const def = DEFS[idx];
    active = { def, step: 0, timer: null };
    hud.bigTitle(def.title, `Mission ${idx + 1} of ${DEFS.length}`, 3);
    def.begin();
  }

  /** Taxi fares: a waiting ped boards the player's car and pays to be driven somewhere. */
  function updateFares() {
    const p = game.player;
    if (!fare) {
      if (p.inCar && game.farePed && game.farePed.state !== 'down' &&
          dist2d(p.x, p.z, game.farePed.x, game.farePed.z) < 6 && Math.abs(p.inCar.speed) < 2) {
        fare = {
          ped: game.farePed,
          fromX: p.x, fromZ: p.z,
          dest: { x: -220 + Math.random() * 440, z: -220 + Math.random() * 400 },
        };
        game.farePed.mesh.visible = false;
        game.farePed.state = 'down'; // seated: out of the world until dropped off
        hud.toast('Fare picked up — follow the gold marker');
        audio.pickup();
      }
      return;
    }
    if (!p.inCar) return;
    if (dist2d(p.x, p.z, fare.dest.x, fare.dest.z) < 10 && Math.abs(p.inCar.speed) < 3) {
      const pay = 60 + Math.floor(dist2d(fare.fromX, fare.fromZ, fare.dest.x, fare.dest.z) / 4);
      game.addMoney(pay);
      game.save.fares += 1;
      game.persist();
      hud.toast(`Fare complete: +$${pay}`);
      audio.cash();
      fare.ped.mesh.visible = true;
      fare.ped.state = 'walk';
      fare.ped.x = p.x + 3;
      fare.ped.z = p.z + 3;
      game.farePed = null;
      fare = null;
    }
  }

  return {
    defs: DEFS,
    start: startCurrent,
    get active() { return active; },
    getTarget() {
      if (fare) return fare.dest;
      if (active) {
        const step = active.def.steps[active.step];
        return step && step.target ? step.target() : null;
      }
      return game.farePed || null;
    },
    /** Per-frame: delayed mission starts, timers, step checks, dialogue, fares. */
    update(dt) {
      if (dialogueT > 0) {
        dialogueT -= dt;
        if (dialogueT <= 0) hud.dialogue('', null);
      } else if (dialogueQueue.length) {
        const line = dialogueQueue.shift();
        hud.dialogue(line.who, line.text);
        dialogueT = line.seconds;
      }
      updateFares();
      if (startDelay > 0) {
        startDelay -= dt;
        if (startDelay <= 0) startCurrent();
        return;
      }
      if (!active) return;
      const step = active.def.steps[active.step];
      if (!step) return;
      if (active.timer !== null) active.timer -= dt;
      if (step.fail && step.fail()) {
        step.onFail();
        return;
      }
      hud.setObjective(step.text());
      if (step.done()) {
        active.step += 1;
        if (step.arrive) step.arrive();
      }
    },
    say,
  };
}
