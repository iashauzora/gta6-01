// Dario on foot: a third-person character with mouse-look (pointer lock), WASD movement
// relative to the camera, sprinting, and a simple walk cycle. Driving lives in game.js —
// this module owns the man, his health, and where the camera sits behind him.

import * as THREE from 'three';
import { COLLIDERS } from './city.js';
import { BEACH_Z, CITY } from './roads.js';
import { makePerson } from './pedestrians.js';
import { clamp, circleHitsBox, pushOutOfBox } from './util.js';

export function createPlayer(scene, x, z) {
  const { group, limbs } = makePerson(0xd64541, 0xc68863);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group,
    limbs,
    x, z,
    heading: 0, // facing
    camYaw: Math.PI, // camera starts behind him, looking north up Ocean Ave
    camPitch: 0.32,
    speed: 0,
    health: 100,
    radius: 0.55,
    phase: 0,
    inCar: null,
    punchCd: 0,
    shootCd: 0,
    dead: false,
  };
}

/**
 * Move Dario for one frame. input: {f, b, l, r, sprint} booleans from the keyboard,
 * interpreted relative to the camera yaw. Collides with buildings and the sea wall.
 */
export function updatePlayerOnFoot(p, dt, input) {
  let mx = 0;
  let mz = 0;
  const sy = Math.sin(p.camYaw);
  const cy = Math.cos(p.camYaw);
  if (input.f) { mx += sy; mz += cy; }
  if (input.b) { mx -= sy; mz -= cy; }
  if (input.l) { mx += cy; mz -= sy; }
  if (input.r) { mx -= cy; mz += sy; }
  const len = Math.hypot(mx, mz);
  const moving = len > 0.01;
  const speed = input.sprint ? 8.4 : 4.6;
  if (moving) {
    mx /= len; mz /= len;
    p.heading = Math.atan2(mx, mz);
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.speed = speed;
    p.phase += dt * speed * 2.6;
  } else {
    p.speed = 0;
    p.phase += (0 - p.phase % (Math.PI * 2)) * Math.min(1, dt * 10); // settle legs
  }
  for (const box of COLLIDERS) {
    if (circleHitsBox(p.x, p.z, p.radius, box)) {
      [p.x, p.z] = pushOutOfBox(p.x, p.z, p.radius, box);
    }
  }
  p.x = clamp(p.x, CITY.minX, CITY.maxX);
  p.z = clamp(p.z, -252, BEACH_Z + 16);
  const swing = moving ? Math.sin(p.phase) * 0.55 : 0;
  p.limbs.legL.rotation.x = swing;
  p.limbs.legR.rotation.x = -swing;
  p.limbs.armL.rotation.x = -swing * 0.7;
  p.limbs.armR.rotation.x = swing * 0.7;
  p.mesh.position.set(p.x, moving ? Math.abs(Math.sin(p.phase)) * 0.06 : 0, p.z);
  p.mesh.rotation.y = p.heading;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
}

/**
 * Place the camera: behind and above Dario (or his car) with smooth follow. When driving,
 * the camera settles behind the car's heading; on foot it orbits with the mouse.
 */
export function updateCamera(camera, p, dt, driveHeading) {
  let targetYaw;
  let dist;
  let height;
  let focusY = 1.6;
  if (p.inCar) {
    // Ease the orbit yaw toward the car's heading so the camera settles behind the tail:
    // the view direction (sin yaw, cos yaw) must equal the car's direction of travel.
    let d = driveHeading - p.camYaw;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    p.camYaw += d * Math.min(1, dt * 2.6);
    targetYaw = p.camYaw;
    dist = 10.5;
    height = 4.2;
    focusY = 1.2;
  } else {
    targetYaw = p.camYaw;
    dist = 7.2;
    height = 2.6 + p.camPitch * 6;
  }
  const cx = p.x - Math.sin(targetYaw) * dist;
  const cz = p.z - Math.cos(targetYaw) * dist;
  const cy2 = height + p.camPitch * 4;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 7);
  camera.position.y += (cy2 - camera.position.y) * Math.min(1, dt * 7);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 7);
  camera.lookAt(p.x, focusY, p.z);
}
