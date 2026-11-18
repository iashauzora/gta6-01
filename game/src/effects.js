// Juice: a pooled particle system (impact sparks, dust, skid smoke, muzzle smoke), a
// point-light muzzle flash, floating cash popups in the HUD, and the red damage vignette.
// Particles are THREE.Points with per-particle velocity and life, updated on the CPU —
// a few hundred points is plenty and costs nothing.

import * as THREE from 'three';

const MAX = 420;

export function createEffects(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);

  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ life: 0, maxLife: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grav: 0 });
    positions[i * 3 + 1] = -99;
  }
  let cursor = 0;

  const flash = new THREE.PointLight(0xffc873, 0, 16);
  scene.add(flash);
  let flashT = 0;

  function spawn(x, y, z, opts) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.x = x; p.y = y; p.z = z;
    const spread = opts.spread ?? 2.4;
    p.vx = (Math.random() - 0.5) * spread;
    p.vz = (Math.random() - 0.5) * spread;
    p.vy = Math.random() * (opts.up ?? 2.4);
    p.maxLife = opts.life ?? 0.6;
    p.life = p.maxLife;
    p.grav = opts.grav ?? -3;
    const c = new THREE.Color(opts.color ?? 0xffffff);
    p.r = c.r; p.g = c.g; p.b = c.b;
  }

  return {
    sparks(x, y, z, n = 10) {
      for (let i = 0; i < n; i++) spawn(x, y, z, { color: 0xffc84d, life: 0.4, up: 3.4, spread: 5 });
    },
    dust(x, y, z, n = 6) {
      for (let i = 0; i < n; i++) spawn(x, y, z, { color: 0xd8cbb0, life: 0.8, up: 1.1, spread: 1.6, grav: -0.4 });
    },
    skid(x, y, z) {
      spawn(x, y, z, { color: 0x555555, life: 0.5, up: 0.7, spread: 0.7, grav: -0.2 });
    },
    muzzle(x, y, z) {
      flash.position.set(x, y, z);
      flash.intensity = 26;
      flashT = 0.05;
      for (let i = 0; i < 3; i++) spawn(x, y, z, { color: 0xffe9a8, life: 0.16, up: 0.6, spread: 1.2, grav: 0 });
    },
    bloodPuff(x, y, z) {
      for (let i = 0; i < 6; i++) spawn(x, y, z, { color: 0xb03030, life: 0.45, up: 1.6, spread: 2 });
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { positions[i * 3 + 1] = -99; continue; }
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) p.y = 0.05;
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const fade = p.life / p.maxLife;
        colors[i * 3] = p.r * fade; colors[i * 3 + 1] = p.g * fade; colors[i * 3 + 2] = p.b * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) flash.intensity = 0;
      }
    },
  };
}
