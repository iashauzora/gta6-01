// Pedestrians: low-poly Coral Bay locals who stroll the sidewalks between waypoints,
// and who run screaming (well, silently but quickly) when a car mounts the kerb, a gun
// goes off, or someone gets hit nearby. A ped who is run over falls and stays down.

import * as THREE from 'three';
import { AVENUES, ALL_STREETS, ROAD_HALF, BEACH_Z } from './roads.js';
import { createRandom, dist2d, turnToward } from './util.js';

const rand = createRandom(4242);
const SHIRTS = [0xf26d5b, 0x5b8ef2, 0xf2d05b, 0x7dd069, 0xf2f2f2, 0xb06ad6, 0x5bd0c8];
const SKINS = [0xf2c89b, 0xc68863, 0x8d5524, 0xffdbac];

/** A simple articulated figure: torso, head, two arms, two legs that swing as it walks. */
export function makePerson(shirtColor, skinColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3a46 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.62;
  g.add(head);
  const limbs = {};
  for (const [name, geo, mat, x, y] of [
    ['armL', new THREE.BoxGeometry(0.16, 0.62, 0.16), shirt, -0.42, 1.28],
    ['armR', new THREE.BoxGeometry(0.16, 0.62, 0.16), shirt, 0.42, 1.28],
    ['legL', new THREE.BoxGeometry(0.2, 0.68, 0.2), pants, -0.16, 0.62],
    ['legR', new THREE.BoxGeometry(0.2, 0.68, 0.2), pants, 0.16, 0.62],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = name.startsWith('arm') ? -0.26 : -0.3;
    pivot.add(m);
    g.add(pivot);
    limbs[name] = pivot;
  }
  return { group: g, limbs };
}

/** Spawn pedestrians on sidewalks and the boardwalk, each with a stroll target. */
export function spawnPeds(scene, count = 26) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const { group, limbs } = makePerson(
      SHIRTS[Math.floor(rand() * SHIRTS.length)],
      SKINS[Math.floor(rand() * SKINS.length)],
    );
    const onShore = rand() < 0.3;
    const x = -235 + rand() * 470;
    const z = onShore ? 224 + rand() * 8 : -235 + rand() * 440;
    group.position.set(x, 0, z);
    scene.add(group);
    peds.push({
      mesh: group,
      limbs,
      x, z,
      heading: rand() * Math.PI * 2,
      speed: 0,
      walkSpeed: 1.1 + rand() * 0.9,
      phase: rand() * 6,
      target: null,
      state: 'walk', // walk | flee | down
      fleeT: 0,
      downT: 0,
      health: 30,
      isGang: false,
    });
  }
  return peds;
}

/** A random sidewalk point to stroll toward: along a road edge or the boardwalk. */
function pickTarget(ped) {
  const vertical = rand() < 0.5;
  if (vertical) {
    const ax = AVENUES[Math.floor(rand() * AVENUES.length)];
    return { x: ax + (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6), z: -238 + rand() * 476 };
  }
  const sz = ALL_STREETS[Math.floor(rand() * ALL_STREETS.length)];
  return { x: -238 + rand() * 476, z: sz + (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6) };
}

/**
 * Advance one pedestrian. danger: {x, z} of a threat to flee from (or null).
 * Returns 'hit' events are handled by the caller through distance checks.
 */
export function updatePed(ped, dt, danger) {
  if (ped.state === 'down') {
    ped.downT += dt;
    ped.mesh.rotation.x = Math.min(Math.PI / 2, ped.downT * 6) * (ped.fallDir || 1);
    return;
  }
  if (danger && dist2d(ped.x, ped.z, danger.x, danger.z) < 15) {
    ped.state = 'flee';
    ped.fleeT = 1.6;
  }
  let speed = ped.walkSpeed;
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    if (ped.fleeT <= 0) ped.state = 'walk';
    const away = Math.atan2(ped.x - danger.x, ped.z - danger.z);
    ped.heading = turnToward(ped.heading, away, dt * 7);
    speed = 4.4;
  } else {
    if (!ped.target || dist2d(ped.x, ped.z, ped.target.x, ped.target.z) < 2.5) ped.target = pickTarget(ped);
    const want = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
    ped.heading = turnToward(ped.heading, want, dt * 4);
  }
  ped.x += Math.sin(ped.heading) * speed * dt;
  ped.z += Math.cos(ped.heading) * speed * dt;
  ped.z = Math.min(ped.z, BEACH_Z + 14);
  ped.phase += dt * speed * 3.4;
  const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.8 : 0.45);
  ped.limbs.legL.rotation.x = swing;
  ped.limbs.legR.rotation.x = -swing;
  ped.limbs.armL.rotation.x = -swing * 0.8;
  ped.limbs.armR.rotation.x = swing * 0.8;
  ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.phase)) * 0.05, ped.z);
  ped.mesh.rotation.y = ped.heading;
}

/** Knock a pedestrian down (run over, punched out, or shot). */
export function downPed(ped, dirX = 1) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = 0;
  ped.fallDir = dirX >= 0 ? 1 : -1;
}
