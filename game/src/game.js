// Coral Bay — Dario's Run. Boot and the one loop: build the city, wire the input, run the
// screens (title, play, pause, busted/wasted), and step every system each frame — Dario
// on foot or driving, traffic, pedestrians, police and the wanted level, Sal's missions,
// taxi fares, combat, effects, the HUD and the minimap.
//
// URL staging for screenshots and testing: ?stage=foot|chase|mission|coast drops straight
// into a posed mid-game scene (no title screen) and sets window.__shotReady when settled.

import * as THREE from 'three';
import { buildCity, PLACES } from './city.js';
import { createPlayer, updatePlayerOnFoot, updateCamera } from './player.js';
import { makeCar, stepCar, syncCarMesh, collideCars } from './vehicles.js';
import { spawnTraffic, spawnParked, updateTrafficCar } from './traffic.js';
import { spawnPeds, updatePed, downPed, makePerson } from './pedestrians.js';
import { createWanted, syncPolice, updateCop } from './police.js';
import { shootGun, punch, updateGangMember, regenHealth } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave, clearSave, freshSave } from './savegame.js';
import { dist2d, clamp } from './util.js';

const params = new URLSearchParams(window.location.search);
const stage = params.get('stage') || params.get('shot');
const STAGED = stage !== null && stage !== 'start';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 30, -60);

const city = buildCity(scene);
const fx = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));

const trafficCars = spawnTraffic(scene, 15);
const parkedCars = spawnParked(scene, 16);
const peds = spawnPeds(scene, 26);
const cops = [];
const player = createPlayer(scene, -134, -176);
const wanted = createWanted();

let save = loadSave();
const game = {
  player,
  wanted,
  save,
  hud,
  audio,
  gang: [],
  goldCar: null,
  farePed: null,
  addMoney(n) { save.money += n; },
  persist() { storeSave(save); },
  spawnGoldCar() {
    if (game.goldCar) {
      scene.remove(game.goldCar.mesh);
      const i = parkedCars.indexOf(game.goldCar);
      if (i >= 0) parkedCars.splice(i, 1);
    }
    const car = makeCar(63.6, -63, 0, 0xd9a821, 'gold');
    car.driver = null;
    scene.add(car.mesh);
    parkedCars.push(car);
    game.goldCar = car;
    return car;
  },
  spawnGang(n, x, z) {
    game.gang = [];
    for (let i = 0; i < n; i++) {
      const { group, limbs } = makePerson(0x23272e, 0xc68863);
      const gx = x + (i - n / 2) * 4;
      const gz = z + (i % 2) * 5;
      group.position.set(gx, 0, gz);
      scene.add(group);
      const ped = {
        mesh: group, limbs, x: gx, z: gz, heading: Math.PI, speed: 0, walkSpeed: 0,
        phase: 0, target: null, state: 'walk', fleeT: 0, downT: 0, health: 100, isGang: true,
        burstT: 1 + i * 0.4, shotsLeft: 3, coolT: 0,
      };
      peds.push(ped);
      game.gang.push(ped);
    }
    return game.gang;
  },
};
const missions = createMissions(game);
game.missions = missions;

// The gold target pillar that marks the current objective in the world.
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
);
marker.visible = false;
scene.add(marker);

// ------------------------------------------------------------------ input
const keys = {};
let screen = 'title'; // title | play | pause | end
let lastShot = { x: 0, z: 0, t: -99 };
let calmT = 0;
let elapsed = 0;
let fareTimer = 8;
let endKind = null;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (screen === 'play') {
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyF') doPunch();
    if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (e.code === 'KeyP') pauseGame();
  } else if (screen === 'pause' && (e.code === 'KeyP' || e.code === 'Enter')) {
    resumeGame();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

/** Pointer lock, best-effort: headless frames and denied requests just skip mouse-look. */
function lockPointer() {
  if (STAGED) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    // No lock available (embedded or headless): keyboard play still works.
  }
}
canvas.addEventListener('click', () => {
  if (screen === 'play') lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (screen === 'play' && !document.pointerLockElement && !STAGED) pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || screen !== 'play') return;
  player.camYaw -= e.movementX * 0.0026;
  player.camPitch = clamp(player.camPitch + e.movementY * 0.002, -0.15, 0.65);
});
canvas.addEventListener('mousedown', (e) => {
  if (screen !== 'play' || e.button !== 0) return;
  if (document.pointerLockElement === canvas || STAGED) doShootOrPunch();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ screens
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
const hudEl = document.getElementById('hud');

function refreshContinue() {
  const btn = document.getElementById('btn-continue');
  const note = document.getElementById('continue-note');
  if (save.started) {
    btn.disabled = false;
    note.textContent = `Saved: $${save.money} · mission ${Math.min(save.missionIndex + 1, 5)} of 5${save.missionIndex >= 5 ? ' · story complete' : ''}`;
  } else {
    btn.disabled = true;
    note.textContent = 'No save yet — start a new game.';
  }
}
refreshContinue();

function startPlay(fresh) {
  if (fresh) {
    clearSave();
    save = freshSave();
    game.save = save;
    save.started = true;
    game.persist();
    player.health = 100;
    player.x = -134; player.z = -176;
    wanted.clear();
  }
  startScreen.hidden = true;
  endScreen.hidden = true;
  pauseScreen.hidden = true;
  hudEl.hidden = false;
  screen = 'play';
  audio.startAmbient();
  missions.start();
  lockPointer();
}
function pauseGame() {
  if (screen !== 'play') return;
  screen = 'pause';
  pauseScreen.hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  pauseScreen.hidden = true;
  screen = 'play';
  lockPointer();
}
function endGame(kind) {
  endKind = kind;
  screen = 'end';
  audio.engine(null);
  audio.siren(false);
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('end-text').textContent = kind === 'busted'
    ? 'The Coral Bay PD empties Dario\u2019s pockets for the trouble — 10% gone — and drops him outside the station.'
    : 'Dario wakes up in Coral Bay General with a headache and a bill — 10% of his cash.';
  endScreen.hidden = false;
  if (kind === 'busted') audio.busted(); else audio.wasted();
}
function respawn() {
  const fine = Math.floor(save.money * 0.1);
  save.money -= fine;
  game.persist();
  wanted.clear();
  for (const cop of cops) scene.remove(cop.mesh);
  cops.length = 0;
  if (player.inCar) exitCar(true);
  player.health = 100;
  if (endKind === 'busted') { player.x = -70; player.z = 12; }
  else { player.x = 70; player.z = 152; }
  player.mesh.visible = true;
  endScreen.hidden = true;
  screen = 'play';
  missions.start();
}

document.getElementById('btn-new').addEventListener('click', () => startPlay(true));
document.getElementById('btn-continue').addEventListener('click', () => startPlay(false));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => startPlay(true));
document.getElementById('btn-respawn').addEventListener('click', respawn);

// ------------------------------------------------------------------ actions
function nearestCar(maxD) {
  let best = null;
  let bd = maxD;
  for (const car of [...trafficCars, ...parkedCars, ...cops]) {
    if (car === player.inCar) continue;
    const d = dist2d(player.x, player.z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function tryInteract() {
  if (player.inCar) {
    exitCar(false);
    return;
  }
  const car = nearestCar(4.6);
  if (!car) return;
  enterCar(car);
}

function enterCar(car) {
  if (car.driver === 'traffic') {
    car.driver = null;
    const i = trafficCars.indexOf(car);
    if (i >= 0) trafficCars.splice(i, 1);
    parkedCars.push(car);
  }
  const ci = cops.indexOf(car);
  if (ci >= 0) cops.splice(ci, 1); // a stolen cruiser is Dario's now; the fleet tops up
  player.inCar = car;
  player.x = car.x;
  player.z = car.z;
  car.driver = 'player';
  player.mesh.visible = false;
  audio.door();
  // Theft is a crime when somebody sees it.
  const copNear = cops.some((c) => dist2d(c.x, c.z, car.x, car.z) < 70);
  const pedNear = peds.some((p) => p.state !== 'down' && dist2d(p.x, p.z, car.x, car.z) < 22);
  if (copNear || pedNear) wanted.report(1, car.x, car.z, copNear);
}

function exitCar(silent) {
  const car = player.inCar;
  if (!car) return;
  player.inCar = null;
  car.driver = null;
  player.x = car.x + Math.cos(car.heading) * 2.6;
  player.z = car.z - Math.sin(car.heading) * 2.6;
  player.mesh.visible = true;
  audio.engine(null);
  if (!silent) audio.door();
}

function doPunch() {
  if (player.inCar || player.punchCd > 0) return;
  player.punchCd = 0.45;
  player.limbs.armR.rotation.x = -1.9;
  const hit = punch(player, peds, fx);
  audio.punch();
  if (hit) {
    const witnessed = cops.length > 0 || peds.some((p) => p.state !== 'down' && p !== hit && dist2d(p.x, p.z, player.x, player.z) < 20);
    if (witnessed) wanted.report(1, player.x, player.z, cops.length > 0);
  }
}

function doShootOrPunch() {
  if (player.inCar) return;
  if (save.hasGun && player.shootCd <= 0) {
    player.shootCd = 0.24;
    audio.gunshot();
    lastShot = { x: player.x, z: player.z, t: elapsed };
    const hit = shootGun(player, player.camYaw, peds.filter((p) => p.isGang), fx);
    if (hit || cops.length) wanted.report(2, player.x, player.z, cops.length > 0);
  } else if (!save.hasGun) {
    doPunch();
  }
}

// ------------------------------------------------------------------ staging
/** Put a traffic car onto a chosen road segment so staged scenes are alive. */
function placeTraffic(car, ax, az, bx, bz, along) {
  const from = { x: ax, z: az };
  const to = { x: bx, z: bz };
  car.route = { from, to, along: 0 };
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  car.x = ax + (dx / len) * along - (dz / len) * 4;
  car.z = az + (dz / len) * along + (dx / len) * 4;
  car.heading = Math.atan2(dx, dz);
  car.speed = 8;
}

let stagedAt = 0;
function stageScene() {
  save.started = true;
  save.hasGun = true;
  startScreen.hidden = true;
  hudEl.hidden = false;
  screen = 'play';
  stagedAt = performance.now();
  if (stage === 'foot') {
    player.x = 10; player.z = -20;
    player.camYaw = Math.PI * 0.95;
    player.camPitch = 0.16;
    // Keep the camera's spot clear of parked cars.
    for (const car of parkedCars) {
      if (dist2d(car.x, car.z, player.x, player.z) < 15) { car.x += 46; car.mesh.position.x = car.x; }
    }
    // A living street: strollers on the near sidewalk, traffic on the avenue.
    const spots = [[10.5, -38], [11, -6], [-10.5, -30], [10.8, 2], [-11, -48], [11, -60]];
    peds.slice(0, spots.length).forEach((ped, i) => {
      ped.x = spots[i][0]; ped.z = spots[i][1];
      ped.target = { x: spots[i][0], z: spots[i][1] + 30 };
    });
    placeTraffic(trafficCars[0], 0, -140, 0, -70, 46);
    placeTraffic(trafficCars[1], 0, 0, 0, -70, 22);
    placeTraffic(trafficCars[2], -70, -70, 0, -70, 30);
    hud.setObjective('Free roam — Coral Bay is yours');
  } else if (stage === 'chase') {
    const car = makeCar(74, -20, Math.PI, 0xd64541);
    scene.add(car.mesh);
    parkedCars.push(car);
    enterCar(car);
    car.speed = 17;
    wanted.report(6, player.x, player.z, true);
    // Two cruisers posed in the chase; the wanted system tops the fleet up.
    for (const [cx, cz] of [[64.5, 9], [76, -54]]) {
      const cop = makeCar(cx, cz, Math.PI, 0xf0f0f0, 'police');
      cop.driver = 'police';
      cop.route = { from: { x: 70, z: 0 }, to: { x: 70, z: -70 } };
      scene.add(cop.mesh);
      cops.push(cop);
    }
    hud.setObjective('Lose the cops!');
  } else if (stage === 'mission') {
    player.x = PLACES.pier.x - 3; player.z = PLACES.pier.z - 14;
    player.camYaw = 0.15;
    player.camPitch = 0.12;
    game.spawnGang(4, PLACES.pier.x, PLACES.pier.z - 8);
    const ricoCar = makeCar(18, 226, Math.PI / 2, 0x59b06a);
    scene.add(ricoCar.mesh);
    parkedCars.push(ricoCar);
    hud.setObjective('Take out the Vultures — 4 standing');
    hud.dialogue('Rico', 'They are at the pier, four of them. I will keep the car running, hero.');
  } else if (stage === 'coast') {
    const car = makeCar(-60, 216, Math.PI / 2, 0x3f7fbf);
    scene.add(car.mesh);
    parkedCars.push(car);
    enterCar(car);
    car.speed = 15;
    placeTraffic(trafficCars[0], -140, 212, -70, 212, 40);
    hud.setObjective('Free roam — Coral Bay is yours');
  }
  // Settle the camera instantly for staged shots.
  updateCamera(camera, player, 10, player.inCar ? player.inCar.heading : player.heading);
}

// ------------------------------------------------------------------ the loop
const allCars = () => [...trafficCars, ...parkedCars, ...cops];
let prev = performance.now();
let shotTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (screen !== 'play') {
    city.update(now / 1000);
    renderer.render(scene, camera);
    return;
  }
  elapsed += dt;
  const inCar = player.inCar;
  // Keep the sun (and its tight shadow frustum) centred on the action.
  city.sun.position.set(player.x + 150, 260, player.z + 70);
  city.sun.target.position.set(player.x, 0, player.z);

  // Player: driving or on foot.
  if (inCar) {
    const input = {
      throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
      handbrake: !!keys.Space,
    };
    const impact = stepCar(inCar, dt, input, 36);
    player.x = inCar.x; player.z = inCar.z;
    player.heading = inCar.heading;
    if (impact > 9) {
      audio.crash(impact > 16);
      fx.sparks(inCar.x, 0.8, inCar.z, 12);
      player.health -= impact > 16 ? 5 : 2;
      calmT = 0;
    } else if (impact > 3) {
      audio.crash(false);
      fx.sparks(inCar.x, 0.8, inCar.z, 5);
    }
    if (input.handbrake && Math.abs(inCar.speed) > 8) fx.skid(inCar.x, 0.2, inCar.z);
    audio.engine(clamp(Math.abs(inCar.speed) / 36, 0, 1));
  } else {
    updatePlayerOnFoot(player, dt, {
      f: !!keys.KeyW || !!keys.ArrowUp, b: !!keys.KeyS || !!keys.ArrowDown,
      l: !!keys.KeyA || !!keys.ArrowLeft, r: !!keys.KeyD || !!keys.ArrowRight,
      sprint: !!keys.ShiftLeft || !!keys.ShiftRight,
    });
  }
  updateCamera(camera, player, dt, inCar ? inCar.heading : player.heading);

  // Traffic with an obstacle field of everything solid and moving.
  const obstacles = [];
  for (const c of allCars()) obstacles.push({ x: c.x, z: c.z });
  for (const p of peds) if (p.state !== 'down') obstacles.push({ x: p.x, z: p.z });
  obstacles.push({ x: player.x, z: player.z });
  for (const car of trafficCars) updateTrafficCar(car, dt, obstacles.filter((o) => o.x !== car.x || o.z !== car.z));

  // Car-to-car bumps.
  const cars = allCars();
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const rel = collideCars(cars[i], cars[j]);
      if (rel > 7) {
        fx.sparks((cars[i].x + cars[j].x) / 2, 0.8, (cars[i].z + cars[j].z) / 2, 8);
        if (cars[i] === inCar || cars[j] === inCar) {
          audio.crash(rel > 12);
          if (cops.includes(cars[i] === inCar ? cars[j] : cars[i])) player.health -= 3;
          const copNear = cops.some((c) => dist2d(c.x, c.z, player.x, player.z) < 90);
          if (copNear) wanted.report(1, player.x, player.z, true);
          calmT = 0;
        }
      }
    }
  }

  // Pedestrians: danger is a fast car nearby or a recent gunshot.
  const shotRecent = elapsed - lastShot.t < 3 ? lastShot : null;
  for (const ped of peds) {
    if (ped.isGang) continue;
    let danger = null;
    if (inCar && Math.abs(inCar.speed) > 6 && dist2d(ped.x, ped.z, inCar.x, inCar.z) < 16) danger = inCar;
    else if (shotRecent && dist2d(ped.x, ped.z, shotRecent.x, shotRecent.z) < 22) danger = shotRecent;
    updatePed(ped, dt, danger);
    // Run over?
    if (ped.state !== 'down') {
      for (const car of cars) {
        if (Math.abs(car.speed) > 3 && dist2d(ped.x, ped.z, car.x, car.z) < 2) {
          downPed(ped, car.speed);
          fx.bloodPuff(ped.x, 0.8, ped.z);
          audio.crash(false);
          if (car === inCar) {
            wanted.report(3, ped.x, ped.z, cops.length > 0);
            player.health -= 1;
          }
          break;
        }
      }
    }
  }

  // Gang members fight back.
  calmT += dt;
  for (const ped of game.gang) {
    if (updateGangMember(ped, dt, { x: player.x, z: player.z, inCar, speed: inCar ? Math.abs(inCar.speed) : player.speed }, fx, audio)) {
      player.health -= 7;
      calmT = 0;
      fx.bloodPuff(player.x, 1.2, player.z);
    }
  }
  regenHealth(player, dt, calmT);

  // Police: keep the fleet matched to the stars, drive it, watch for a bust.
  syncPolice(scene, cops, wanted, player);
  let anySees = false;
  let anyPinning = false;
  const proxy = { x: player.x, z: player.z, speed: inCar ? Math.abs(inCar.speed) : player.speed };
  for (const cop of cops) {
    const r = updateCop(cop, dt, proxy, wanted);
    anySees = anySees || r.sees;
    anyPinning = anyPinning || r.pinning;
  }
  wanted.update(dt, player, anySees);
  if (anyPinning && wanted.stars > 0) {
    wanted.bustT += dt;
    if (wanted.bustT > 2.2) { endGame('busted'); }
  } else {
    wanted.bustT = Math.max(0, wanted.bustT - dt * 2);
  }
  audio.siren(wanted.stars > 0 && cops.length > 0, cops.length ? clamp(1 - dist2d(cops[0].x, cops[0].z, player.x, player.z) / 90, 0, 1) : 0);

  // Fares: keep a hopeful passenger flagged while Dario drives.
  fareTimer -= dt;
  if (fareTimer <= 0) {
    fareTimer = 6;
    if (!game.farePed && inCar) {
      const candidates = peds.filter((p) => !p.isGang && p.state !== 'down');
      if (candidates.length) game.farePed = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (game.farePed && (game.farePed.state === 'down')) game.farePed = null;
  }

  // Missions, marker, HUD.
  missions.update(dt);
  const target = missions.getTarget();
  if (target && screen === 'play') {
    marker.visible = true;
    marker.position.set(target.x, 17, target.z);
    marker.material.opacity = 0.26 + Math.sin(elapsed * 3) * 0.08;
  } else {
    marker.visible = false;
  }
  const nearCar = !inCar && nearestCar(4.6);
  hud.prompt(inCar ? 'E — exit car' : nearCar ? 'E — steal car' : '');
  document.getElementById('crosshair').hidden = !(!inCar && save.hasGun);
  hud.update({ health: player.health, money: save.money, stars: wanted.stars }, dt);
  minimap.draw({ player, cops, cars: trafficCars, target, heading: inCar ? inCar.heading : player.camYaw });

  // Death.
  if (player.health <= 0 && screen === 'play') {
    player.health = 0;
    endGame('wasted');
  }

  for (const car of cars) syncCarMesh(car, dt);
  fx.update(dt);
  audio.update(dt);
  city.update(now / 1000);
  renderer.render(scene, camera);

  if (STAGED && !window.__shotReady) {
    // Wall-clock based: software rendering makes game-time crawl, but the posed scene
    // still needs a few real seconds for traffic and police lights to come alive.
    shotTimer += 1;
    if (shotTimer > 15 && performance.now() - stagedAt > 6000) window.__shotReady = true;
  }
}

// A small handle for automated probes and curious players in the console.
window.__coralBay = { player, wanted, save: () => save, cars: () => allCars(), peds, cops };

if (STAGED) stageScene();
requestAnimationFrame(frame);
