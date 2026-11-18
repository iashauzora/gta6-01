// Civilian traffic: cars that pick a neighbouring intersection and drive the right-hand
// lane to it, slowing for whatever is ahead of them — another car, a pedestrian crossing,
// or Dario standing in the road. Parked cars line the kerbs, waiting to be stolen.

import * as THREE from 'three';
import { NODES, neighbours, lanePoint, headingOf, AVENUES, ALL_STREETS, ROAD_HALF } from './roads.js';
import { makeCar, stepCar, CAR_COLORS } from './vehicles.js';
import { createRandom, dist2d, turnToward, angleDelta } from './util.js';

const rand = createRandom(777);

/** Spawn the city's moving traffic and parked cars into the scene. */
export function spawnTraffic(scene, count = 15) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const from = NODES[Math.floor(rand() * NODES.length)];
    const opts = neighbours(from);
    const to = opts[Math.floor(rand() * opts.length)];
    const [x, z] = lanePoint(from, to, rand() * 40 + 6);
    const car = makeCar(x, z, headingOf(from, to), CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
    car.driver = 'traffic';
    car.route = { from, to, along: 0 };
    car.cruise = 9 + rand() * 5;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

/** Parked cars along the kerbs: unlocked, engine off, free for the taking. */
export function spawnParked(scene, count = 16) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < 300) {
    tries++;
    const vertical = rand() < 0.5;
    const line = vertical
      ? AVENUES[Math.floor(rand() * AVENUES.length)]
      : ALL_STREETS[Math.floor(rand() * ALL_STREETS.length)];
    const along = -235 + rand() * 470;
    const side = rand() < 0.5 ? -1 : 1;
    const x = vertical ? line + side * (ROAD_HALF - 1.6) : along;
    const z = vertical ? along : line + side * (ROAD_HALF - 1.6);
    if (cars.some((c) => dist2d(c.x, c.z, x, z) < 12)) continue;
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(x, z, heading, CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
    car.driver = null;
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

/**
 * Advance one traffic car. obstacles: [{x, z, r}] of things it must not hit (other cars,
 * the player). It steers for a point ahead on its lane and eases off when blocked.
 */
export function updateTrafficCar(car, dt, obstacles) {
  const { from, to } = car.route;
  const segLen = Math.hypot(to.x - from.x, to.z - from.z);
  // Aim at a lookahead point on the lane.
  const here = Math.hypot(car.x - from.x, car.z - from.z);
  const [tx, tz] = lanePoint(from, to, Math.min(segLen, here + 9));
  const targetHeading = Math.atan2(tx - car.x, tz - car.z);
  const steer = Math.max(-1, Math.min(1, angleDelta(car.heading, targetHeading) * 2.2));

  // Obstacle scan: anything within a corridor ahead slows or stops the car.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let blocked = 0;
  for (const o of obstacles) {
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 11 && side < 2.4) blocked = Math.max(blocked, 1 - ahead / 11);
  }
  const wantSpeed = car.cruise * (1 - blocked);
  const throttle = car.speed < wantSpeed ? 0.55 : -0.4;
  const impact = stepCar(car, dt, { throttle, steer, handbrake: false }, 15);
  if (here >= segLen - 4) {
    const opts = neighbours(to).filter((n) => n !== from);
    const next = opts.length && Math.random() > 0.25
      ? opts[Math.floor(Math.random() * opts.length)]
      : (neighbours(to)[Math.floor(Math.random() * neighbours(to).length)] || from);
    car.route = { from: to, to: next, along: 0 };
  }
  return impact;
}
