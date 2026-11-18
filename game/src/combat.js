// Fists and the pistol: mouse-aimed shooting from the camera's view line, a short-range
// punch, hit reactions (flinch, blood puff, fall), and the damage Dario takes from gang
// gunfire and police pressure. Enemies here are pedestrians flagged as gang members by the
// mission code; they shoot back in bursts and go down in two hits.

import { dist2d } from './util.js';
import { downPed } from './pedestrians.js';

const GUN_RANGE = 55;
const PUNCH_RANGE = 2.3;

/**
 * Fire Dario's pistol toward the camera aim. targets: array of peds (gang) — the nearest
 * one inside a narrow cone around the aim line takes the hit. Returns the ped hit or null.
 */
export function shootGun(player, camYaw, targets, fx) {
  const ax = player.x + Math.sin(camYaw) * 1.2;
  const az = player.z + Math.cos(camYaw) * 1.2;
  fx.muzzle(player.x + Math.sin(camYaw) * 0.7, 1.45, player.z + Math.cos(camYaw) * 0.7);
  let best = null;
  let bestScore = Infinity;
  for (const t of targets) {
    if (t.state === 'down') continue;
    const dx = t.x - player.x;
    const dz = t.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > GUN_RANGE || d < 0.5) continue;
    const aim = Math.atan2(dx, dz);
    let diff = Math.abs(((aim - camYaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (diff > 0.16) continue;
    const score = d + diff * 30;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  if (best) {
    best.health -= 55;
    fx.bloodPuff(best.x, 1.2, best.z);
    if (best.health <= 0) downPed(best, Math.sin(camYaw));
    else best.state = 'flee', best.fleeT = 0.7;
  }
  return best;
}

/** Swing a punch: the nearest standing ped in front of Dario takes it and drops. */
export function punch(player, targets, fx) {
  let best = null;
  let bd = PUNCH_RANGE;
  for (const t of targets) {
    if (t.state === 'down') continue;
    const d = dist2d(player.x, player.z, t.x, t.z);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) {
    fx.dust(best.x, 0.8, best.z, 4);
    downPed(best, Math.sin(player.heading));
  }
  return best;
}

/**
 * One gang member's brain for a frame: keep a firing distance from Dario, strafe slowly,
 * and shoot in bursts with poor-but-honest accuracy. Returns true when a shot lands
 * (caller applies the damage and the vignette).
 */
export function updateGangMember(ped, dt, player, fx, audio) {
  if (ped.state === 'down') return false;
  const d = dist2d(ped.x, ped.z, player.x, player.z);
  const want = Math.atan2(player.x - ped.x, player.z - ped.z);
  ped.heading = want;
  ped.mesh.rotation.y = want;
  ped.mesh.position.set(ped.x, 0, ped.z);
  if (d > 20) {
    ped.x += Math.sin(want) * 3.4 * dt;
    ped.z += Math.cos(want) * 3.4 * dt;
  } else if (d < 7) {
    ped.x -= Math.sin(want) * 2.2 * dt;
    ped.z -= Math.cos(want) * 2.2 * dt;
  }
  ped.burstT = (ped.burstT ?? 1.2) - dt;
  ped.coolT = (ped.coolT ?? 0) - dt;
  if (ped.burstT <= 0 && d < 34) {
    ped.burstT = 0.14;
    ped.shotsLeft = (ped.shotsLeft ?? 0) - 1;
    if (ped.shotsLeft <= 0) {
      ped.shotsLeft = 3;
      ped.burstT = 1.1 + Math.random() * 0.9;
    }
    fx.muzzle(ped.x + Math.sin(want) * 0.6, 1.4, ped.z + Math.cos(want) * 0.6);
    audio.gunshot();
    // Accuracy falls off with distance; cover of a car (player driving fast) helps too.
    const pHit = Math.max(0.05, 0.34 - d * 0.007) * (player.inCar && Math.abs(player.inCar.speed) > 12 ? 0.5 : 1);
    return Math.random() < pHit;
  }
  return false;
}

/** Slow health regen once the shooting stops: Dario is tough, not immortal. */
export function regenHealth(player, dt, calmT) {
  if (player.health > 0 && player.health < 100 && calmT > 4) {
    player.health = Math.min(100, player.health + dt * 5);
  }
}
