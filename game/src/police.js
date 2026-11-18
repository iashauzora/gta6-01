// The Coral Bay PD: a wanted level of 0-5 stars that crimes raise and hiding lowers, and
// cruisers that spawn in proportion to the stars, hunt the player's last known position,
// and ram or pin the player. Pin a slow player long enough and it's BUSTED; keep out of
// sight and the stars drain away one by one.

import { nearestNode, neighbours, lanePoint, headingOf } from './roads.js';
import { makeCar, stepCar } from './vehicles.js';
import { dist2d, turnToward, angleDelta, clamp } from './util.js';

/** How many cruisers hunt at each wanted level. */
const COPS_BY_STARS = [0, 1, 2, 3, 4, 6];
/** Seconds of being unseen that shed one star. */
const DECAY_SECONDS = 16;

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // fractional progress toward the next star
    unseenT: 0,
    lastSeen: null, // {x, z} the police last saw the player
    bustT: 0,
    /** Report a crime: severity 1 = theft seen, 2 = assault, 3 = shooting / hit-and-run. */
    report(severity, x, z, seen = true) {
      this.heat += severity * 0.55;
      while (this.heat >= 1 && this.stars < 5) {
        this.stars += 1;
        this.heat -= 1;
      }
      if (this.stars === 0 && this.heat > 0.4) this.stars = 1;
      if (seen) {
        this.lastSeen = { x, z };
        this.unseenT = 0;
      }
    },
    /** Per-frame bookkeeping: decay while hidden, keep lastSeen fresh while visible. */
    update(dt, playerPos, anyCopSees) {
      if (anyCopSees) {
        this.lastSeen = { x: playerPos.x, z: playerPos.z };
        this.unseenT = 0;
      } else if (this.stars > 0) {
        this.unseenT += dt;
        if (this.unseenT >= DECAY_SECONDS) {
          this.stars -= 1;
          this.heat = 0;
          this.unseenT = 0;
          if (this.stars === 0) this.lastSeen = null;
        }
      }
    },
    clear() {
      this.stars = 0;
      this.heat = 0;
      this.unseenT = 0;
      this.lastSeen = null;
      this.bustT = 0;
    },
  };
}

/** Spawn (or top up) the cruiser fleet for the current wanted level. */
export function syncPolice(scene, cops, wanted, playerPos) {
  const want = COPS_BY_STARS[wanted.stars];
  let guard = 0;
  while (cops.length < want && guard++ < 60) {
    // Spawn on a road near — but not on top of — the player.
    const node = nearestNode(playerPos.x + (Math.random() - 0.5) * 220, playerPos.z + (Math.random() - 0.5) * 220);
    if (dist2d(node.x, node.z, playerPos.x, playerPos.z) < 55 && guard < 50) continue;
    const opts = neighbours(node);
    const to = opts[Math.floor(Math.random() * opts.length)];
    const [x, z] = lanePoint(node, to, 4);
    const cop = makeCar(x, z, headingOf(node, to), 0xf0f0f0, 'police');
    cop.driver = 'police';
    cop.route = { from: node, to };
    cop.mode = 'hunt';
    scene.add(cop.mesh);
    cops.push(cop);
  }
  while (cops.length > want) {
    const cop = cops.pop();
    scene.remove(cop.mesh);
  }
  return cops;
}

/**
 * Drive one cruiser. It steers for the player's last seen position (or the player directly
 * when in sight), rams when close, and falls back to patrolling its route when the trail is
 * cold. Returns {seesPlayer, pinning} for the wanted/bust logic.
 */
export function updateCop(cop, dt, player, wanted) {
  const d = dist2d(cop.x, cop.z, player.x, player.z);
  const sees = d < 95;
  const target = sees ? player : wanted.lastSeen;
  let steer = 0;
  let throttle = 0.5;
  let pinning = false;
  if (target) {
    const want = Math.atan2(target.x - cop.x, target.z - cop.z);
    steer = clamp(angleDelta(cop.heading, want) * 2.4, -1, 1);
    const td = dist2d(cop.x, cop.z, target.x, target.z);
    if (sees && td < 7) {
      // On top of the player: match speed and lean in — this is what pins and busts.
      throttle = player.speed > 2 ? 0.7 : 0.12;
      pinning = Math.abs(player.speed) < 2.2;
    } else if (td < 16) {
      throttle = 0.35;
    } else {
      throttle = 0.85;
    }
  } else {
    // No trail: patrol the road graph like traffic, slower.
    const { from, to } = cop.route;
    const segLen = Math.hypot(to.x - from.x, to.z - from.z);
    const here = Math.hypot(cop.x - from.x, cop.z - from.z);
    const [tx, tz] = lanePoint(from, to, Math.min(segLen, here + 9));
    const want = Math.atan2(tx - cop.x, tz - cop.z);
    steer = clamp(angleDelta(cop.heading, want) * 2.2, -1, 1);
    throttle = cop.speed < 10 ? 0.5 : 0;
    if (here >= segLen - 4) {
      const opts = neighbours(to);
      cop.route = { from: to, to: opts[Math.floor(Math.random() * opts.length)] };
    }
  }
  const maxSpeed = 26 + wanted.stars * 2.2;
  stepCar(cop, dt, { throttle, steer, handbrake: false }, maxSpeed);
  return { sees, pinning };
}
