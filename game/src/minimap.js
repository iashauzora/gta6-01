// The minimap: a 2D canvas in the corner that draws the road grid, the beach, the player
// as a white arrow, police as flashing red/blue dots, traffic as grey dots, and the
// current mission target as a gold diamond. North is up; the view follows the player.

import { AVENUES, ALL_STREETS, SHORE_Z, BEACH_Z } from './roads.js';

const SIZE = 176;
const RANGE = 150; // world metres visible across the map

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  canvas.width = SIZE;
  canvas.height = SIZE;

  function draw(state) {
    const { player, cops, cars, target } = state;
    const scale = SIZE / RANGE;
    const toMap = (x, z) => [
      SIZE / 2 + (x - player.x) * scale,
      SIZE / 2 + (z - player.z) * scale,
    ];
    g.fillStyle = '#20262e';
    g.fillRect(0, 0, SIZE, SIZE);
    // Beach + sea strip at the south edge of the world.
    const [, beachY] = toMap(0, BEACH_Z);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, beachY, SIZE, SIZE - beachY);
    const [, seaY] = toMap(0, BEACH_Z + 46);
    g.fillStyle = '#1d7fa8';
    g.fillRect(0, seaY, SIZE, SIZE - seaY);
    // Roads.
    g.strokeStyle = '#4a5560';
    g.lineWidth = 5;
    for (const x of AVENUES) {
      const [mx] = toMap(x, 0);
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, SIZE); g.stroke();
    }
    for (const z of ALL_STREETS) {
      const [, mz] = toMap(0, z);
      g.beginPath(); g.moveTo(0, mz); g.lineTo(SIZE, mz); g.stroke();
    }
    void SHORE_Z;
    // Traffic dots.
    g.fillStyle = '#9aa4ae';
    for (const c of cars) {
      const [mx, mz] = toMap(c.x, c.z);
      if (mx < -4 || mz < -4 || mx > SIZE + 4 || mz > SIZE + 4) continue;
      g.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
    // Police blips, flashing.
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const c of cops) {
      const [mx, mz] = toMap(c.x, c.z);
      g.fillStyle = flash ? '#ff4444' : '#4488ff';
      g.beginPath(); g.arc(mx, mz, 3.4, 0, Math.PI * 2); g.fill();
    }
    // Mission target: a gold diamond, clamped to the rim when off-map.
    if (target) {
      let [mx, mz] = toMap(target.x, target.z);
      mx = Math.max(10, Math.min(SIZE - 10, mx));
      mz = Math.max(10, Math.min(SIZE - 10, mz));
      g.fillStyle = '#ffd94d';
      g.beginPath();
      g.moveTo(mx, mz - 6); g.lineTo(mx + 6, mz); g.lineTo(mx, mz + 6); g.lineTo(mx - 6, mz);
      g.closePath(); g.fill();
    }
    // Player arrow, rotated to facing (or the car's heading).
    const heading = state.heading;
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(Math.PI - heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6);
    g.closePath(); g.fill();
    g.restore();
    // Rim.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }

  return { draw };
}
