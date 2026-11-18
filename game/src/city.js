// Coral Bay itself: sun-bleached blocks of pastel towers with lit windows, palm-lined
// sidewalks, street lamps, a boardwalk, the beach and the ocean. Everything is built from
// boxes and shared canvas textures so the whole city costs a handful of draw calls' worth
// of geometry, and every solid building registers an AABB collider for the physics code.

import * as THREE from 'three';
import { AVENUES, ALL_STREETS, STREETS, SHORE_Z, ROAD_HALF, BEACH_Z, CITY } from './roads.js';
import { createRandom } from './util.js';

const rand = createRandom(20261118);

/** Building colliders, filled by buildCity: {minX, maxX, minZ, maxZ}. */
export const COLLIDERS = [];
/** Named places missions point at: chop shop, marina, pier, car lot, hideout. */
export const PLACES = {
  chopShop: { x: -140, z: -168, name: "Sal's Chop Shop" },
  carLot: { x: 146, z: -76, name: 'Sunset Motors' },
  goldCarSpot: { x: 70, z: -63, name: 'Ocean Ave' },
  pier: { x: 30, z: 246, name: 'Coral Pier' },
  marina: { x: -196, z: 224, name: 'Coral Bay Marina' },
  hideout: { x: -238, z: -238, name: 'the old cannery' },
  dropOff: { x: 182, z: 132, name: 'the Palms Hotel' },
};

/** A canvas texture of a tower facade: rows of windows, some lit warm, some dark glass. */
function facadeTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 6; x++) {
      const lit = rand() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#22384a';
      g.fillRect(8 + x * 20, 10 + y * 15, 12, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A palm-frond texture drawn once and reused by every palm in the city. */
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#2e8b3a';
  g.lineWidth = 10;
  g.lineCap = 'round';
  for (let i = -4; i <= 4; i++) {
    g.beginPath();
    g.moveTo(64, 120);
    g.quadraticCurveTo(64 + i * 13, 58, 64 + i * 21, 12 + Math.abs(i) * 9);
    g.stroke();
  }
  g.strokeStyle = '#3aa348';
  g.lineWidth = 5;
  for (let i = -4; i <= 4; i++) {
    g.beginPath();
    g.moveTo(64, 120);
    g.quadraticCurveTo(64 + i * 15, 70, 64 + i * 24, 26 + Math.abs(i) * 7);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PASTELS = ['#f2d5c4', '#e8b4a0', '#f7e8b0', '#bfe3dd', '#f4c6d8', '#d9e6f2', '#f9f0dc', '#cfe8c0'];

/** One palm tree: a leaning trunk and a crown of frond planes. */
function makePalm(h) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = 0.08;
  palm.add(trunk);
  const fronds = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 7.6),
    new THREE.MeshLambertMaterial({ map: frondTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
  );
  fronds.rotation.x = -Math.PI / 2;
  fronds.rotation.z = Math.random() * Math.PI;
  fronds.position.set(0.08 * h * 0.5, h + 0.4, 0);
  palm.add(fronds);
  return palm;
}

/**
 * Build the whole city into `scene`. Returns { update(dt, t) } for the water shimmer and
 * lamp glow; lamps and palms are placed along sidewalks, buildings fill each block with a
 * courtyard gap, and the named PLACES get small landmark props (signs, crates, a boat).
 */
export function buildCity(scene) {
  COLLIDERS.length = 0;
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0xa8d4ee, 180, 620);

  const sun = new THREE.DirectionalLight(0xffe3b3, 2.9);
  sun.position.set(150, 260, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  // The shadow camera follows the player (game.js moves sun + target), so a tight
  // frustum gives crisp shadows where the action is and culls the rest of the city.
  sun.shadow.camera.left = -135; sun.shadow.camera.right = 135;
  sun.shadow.camera.top = 135; sun.shadow.camera.bottom = -135;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0xe8d8b0, 1.2));
  scene.add(new THREE.AmbientLight(0xffe8c8, 0.35));

  // Ground: city slab, then beach sand, then the ocean plane beyond.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 520),
    new THREE.MeshLambertMaterial({ color: 0x9aa08e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -6);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 90),
    new THREE.MeshLambertMaterial({ color: 0xf0d9a0 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.02, BEACH_Z + 42);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterMat = new THREE.MeshPhongMaterial({ color: 0x1d7fa8, shininess: 120, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, BEACH_Z + 130 + 180);
  scene.add(water);

  // Asphalt: one long plane per road with the centre dashes painted into a repeating
  // canvas texture (hundreds of separate dash meshes would crawl), plus sidewalk strips.
  const dashCanvasV = document.createElement('canvas');
  dashCanvasV.width = 32; dashCanvasV.height = 128;
  const dv = dashCanvasV.getContext('2d');
  dv.fillStyle = '#3d4148'; dv.fillRect(0, 0, 32, 128);
  dv.fillStyle = '#f5e9b8'; dv.fillRect(15, 24, 2, 40);
  const dashTexV = new THREE.CanvasTexture(dashCanvasV);
  dashTexV.wrapS = THREE.RepeatWrapping; dashTexV.wrapT = THREE.RepeatWrapping;
  dashTexV.repeat.set(1, 40);
  dashTexV.anisotropy = 8; // keep the dashes crisp at the camera's grazing angle
  dashTexV.colorSpace = THREE.SRGBColorSpace;
  const dashCanvasH = document.createElement('canvas');
  dashCanvasH.width = 128; dashCanvasH.height = 32;
  const dh = dashCanvasH.getContext('2d');
  dh.fillStyle = '#3d4148'; dh.fillRect(0, 0, 128, 32);
  dh.fillStyle = '#f5e9b8'; dh.fillRect(24, 15, 40, 2);
  const dashTexH = new THREE.CanvasTexture(dashCanvasH);
  dashTexH.wrapS = THREE.RepeatWrapping; dashTexH.wrapT = THREE.RepeatWrapping;
  dashTexH.repeat.set(40, 1);
  dashTexH.anisotropy = 8;
  dashTexH.colorSpace = THREE.SRGBColorSpace;
  const asphaltMatV = new THREE.MeshLambertMaterial({ map: dashTexV });
  const asphaltMatH = new THREE.MeshLambertMaterial({ map: dashTexH });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
  const roadGroup = new THREE.Group();
  for (const x of AVENUES) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 520), asphaltMatV);
    road.rotation.x = -Math.PI / 2; road.position.set(x, 0, -6); road.receiveShadow = true;
    roadGroup.add(road);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 520), walkMat);
      walk.rotation.x = -Math.PI / 2; walk.position.set(x + s * (ROAD_HALF + 1.5), 0.01, -6);
      roadGroup.add(walk);
    }
  }
  for (const z of ALL_STREETS) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(520, ROAD_HALF * 2), asphaltMatH);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, z); road.receiveShadow = true;
    roadGroup.add(road);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(520, 3), walkMat);
      walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.01, z + s * (ROAD_HALF + 1.5));
      roadGroup.add(walk);
    }
  }
  scene.add(roadGroup);

  // Buildings: fill each block with 1-4 pastel towers, leaving the block's heart open.
  const facades = PASTELS.map((p, i) => facadeTexture(p, 0.3 + (i % 3) * 0.12));
  const xs = [-245, ...AVENUES, 245];
  const zs = [-245, ...STREETS, SHORE_Z, 245];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < zs.length - 1; bj++) {
      const x0 = xs[bi] + ROAD_HALF + 3;
      const x1 = xs[bi + 1] - ROAD_HALF - 3;
      const z0 = zs[bj] + ROAD_HALF + 3;
      const z1 = zs[bj + 1] - ROAD_HALF - 3;
      if (x1 - x0 < 16 || z1 - z0 < 16) continue;
      if (z0 > SHORE_Z) continue; // nothing built on the beach
      const spots = [
        [x0 + 9, z0 + 9], [x1 - 9, z0 + 9], [x0 + 9, z1 - 9], [x1 - 9, z1 - 9],
      ];
      for (const [bx, bz] of spots) {
        if (rand() < 0.16) continue;
        const w = 13 + rand() * 5;
        const d = 13 + rand() * 5;
        const h = 14 + rand() * rand() * 46;
        const tex = facades[Math.floor(rand() * facades.length)];
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(bx, h / 2, bz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        COLLIDERS.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(w + 1, 1.2, d + 1),
          new THREE.MeshLambertMaterial({ color: 0xb0563a }),
        );
        cap.position.set(bx, h + 0.6, bz);
        scene.add(cap);
      }
    }
  }

  // Palms and lamps along the sidewalks and the shore.
  const lampHeads = [];
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x39424e });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (let x = -240; x <= 240; x += 34) {
    for (const z of [SHORE_Z - ROAD_HALF - 2.4, -70 - ROAD_HALF - 2.4, 70 + ROAD_HALF + 2.4]) {
      const palm = makePalm(6.5 + rand() * 2.5);
      palm.position.set(x + rand() * 4, 0, z);
      palm.rotation.y = rand() * Math.PI;
      scene.add(palm);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.6, 5), lampMat);
    pole.position.set(x, 2.8, SHORE_Z + ROAD_HALF + 2.2);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat);
    bulb.position.set(x, 5.7, SHORE_Z + ROAD_HALF + 2.2);
    scene.add(bulb);
    lampHeads.push(bulb);
  }
  for (const x of AVENUES) {
    for (let z = -230; z <= 200; z += 46) {
      const palm = makePalm(6 + rand() * 3);
      palm.position.set(x + ROAD_HALF + 2.2, 0, z + rand() * 6);
      scene.add(palm);
    }
  }

  // Landmarks: the chop shop's open yard, the pier planks, the marina boat.
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), new THREE.MeshLambertMaterial({ color: 0x8b8578 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(PLACES.chopShop.x, 0.015, PLACES.chopShop.z + 20);
  yard.receiveShadow = true;
  scene.add(yard);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 66),
    new THREE.MeshLambertMaterial({ color: 0xa9835a }),
  );
  pier.position.set(PLACES.pier.x, 0.5, BEACH_Z + 40);
  pier.castShadow = true;
  scene.add(pier);
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 14), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  hull.position.y = 1.4;
  boat.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 5), new THREE.MeshLambertMaterial({ color: 0x2a6f8f }));
  cabin.position.set(0, 3.4, -1);
  boat.add(cabin);
  boat.position.set(PLACES.marina.x, 0.1, PLACES.marina.z + 34);
  scene.add(boat);

  return {
    water,
    sun,
    update(t) {
      water.position.y = -0.4 + Math.sin(t * 0.7) * 0.08;
      waterMat.color.setHSL(0.54, 0.68, 0.36 + Math.sin(t * 0.4) * 0.03);
    },
  };
}
