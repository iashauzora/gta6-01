// Cars: low-poly bodies built from boxes (rounded cabin, wheels that steer and spin,
// headlights, brake lights), and one shared arcade physics step that the player, the
// traffic AI and the police all drive through — throttle, steering, handbrake drift,
// building collision and car-to-car bumps.

import * as THREE from 'three';
import { COLLIDERS } from './city.js';
import { CITY } from './roads.js';
import { clamp, circleHitsBox, pushOutOfBox } from './util.js';

export const CAR_COLORS = [0xd64541, 0x3f7fbf, 0xf2b134, 0xeeeeee, 0x59b06a, 0x8e6cc8, 0xe87fa1, 0x37424e, 0xff7f2a];
let nextCarId = 1;

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
wheelGeo.rotateZ(Math.PI / 2); // axle along x, so mesh.rotation.x is the rolling spin
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d303e });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const brakeMat = new THREE.MeshBasicMaterial({ color: 0x881111 });

/**
 * Build a car's mesh and state. kind: 'car' (civilian), 'police' (black-and-white with a
 * light bar), or 'gold' (the one-of-one convertible Dario has to steal in mission 2).
 */
export function makeCar(x, z, heading, color, kind = 'car') {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, kind === 'gold' ? paint : glassMat);
  cabin.position.set(0, 1.18, kind === 'gold' ? -0.2 : -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lightMat);
    hl.position.set(s * 0.62, 0.72, 2.16);
    group.add(hl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), brakeMat.clone());
    bl.position.set(s * 0.62, 0.74, -2.16);
    group.add(bl);
    if (s === 1) group.userData.brakeMat = bl.material;
  }
  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.5), wheelMat);
    barBase.position.y = 0.1;
    lightBar.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.34, 0.24, 0);
    lightBar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.34, 0.24, 0);
    lightBar.add(blue);
    lightBar.position.set(0, 1.5, -0.25);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    id: nextCarId++,
    mesh: group,
    wheels,
    lightBar,
    brakeMat: group.userData.brakeMat,
    x, z, heading,
    speed: 0,
    steerVis: 0,
    kind,
    radius: 2.35,
    health: 100,
    dead: false,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    flashT: 0,
  };
}

/** Sync a car's mesh to its physics state and spin/steer its wheels. */
export function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -car.steerVis * 0.04;
  const spin = (car.speed * dt) / 0.38;
  for (let i = 0; i < car.wheels.length; i++) {
    car.wheels[i].rotation.x += spin;
    if (i < 2) car.wheels[i].rotation.y = car.steerVis * 0.5;
  }
  if (car.brakeMat) car.brakeMat.color.setHex(car.braking ? 0xff2222 : 0x881111);
  if (car.lightBar) {
    car.flashT += dt * 9;
    const on = Math.sin(car.flashT) > 0;
    car.lightBar.userData.red.material.color.setHex(on ? 0xff3333 : 0x661111);
    car.lightBar.userData.blue.material.color.setHex(on ? 0x661111 : 0x3366ff);
  }
}

/**
 * One arcade physics step. input: {throttle -1..1, steer -1..1, handbrake bool}.
 * Returns an impact speed (0 when nothing was hit hard) so callers can play crash sounds,
 * raise wanted levels and spawn sparks. maxSpeed differs per driver kind.
 */
export function stepCar(car, dt, input, maxSpeed = 34) {
  const accel = car.speed < maxSpeed ? 15 : 0;
  if (input.throttle > 0) car.speed += accel * input.throttle * dt * (1 - car.speed / (maxSpeed * 1.25));
  else if (input.throttle < 0) car.speed += (car.speed > 0.5 ? -26 : -9) * -input.throttle * dt;
  const drag = input.handbrake ? 1.6 : 0.35;
  car.speed -= car.speed * drag * dt;
  if (Math.abs(car.speed) < 0.04 && input.throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -11, maxSpeed * 1.2);
  car.braking = input.throttle < 0 && car.speed > 0.5;
  const steerTarget = input.steer * 0.62 * (car.speed < 0 ? -1 : 1);
  car.steerVis += (steerTarget - car.steerVis) * Math.min(1, dt * 8);
  const grip = input.handbrake ? 2.4 : 1.55;
  if (Math.abs(car.speed) > 0.2) {
    car.heading += car.steerVis * grip * dt * clamp(Math.abs(car.speed) / 9, 0.25, 1.3) * Math.sign(car.speed);
  }
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  let impact = 0;
  let px = nx;
  let pz = nz;
  for (const box of COLLIDERS) {
    if (circleHitsBox(px, pz, car.radius, box)) {
      impact = Math.max(impact, Math.abs(car.speed));
      [px, pz] = pushOutOfBox(px, pz, car.radius, box);
      car.speed *= 0.25;
    }
  }
  car.x = clamp(px, CITY.minX, CITY.maxX);
  car.z = clamp(pz, -252, 250);
  return impact;
}

/** Circle collision between two cars: push both apart and trade a little speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = a.radius + b.radius - 0.7;
  if (d === 0 || d >= min) return 0;
  const push = (min - d) / 2;
  const ux = dx / d;
  const uz = dz / d;
  a.x -= ux * push; a.z -= uz * push;
  b.x += ux * push; b.z += uz * push;
  const rel = Math.abs(a.speed - b.speed);
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.8;
  b.speed = avg * 0.8;
  return rel;
}
