// The Coral Bay road network: a grid of avenues (north-south) and streets (east-west) plus
// the Shore Drive along the beach. Traffic and police both drive on this graph: nodes are
// intersections, and a car follows the right-hand lane from one node to the next.

import { clamp } from './util.js';

/** Avenues run along z at these x positions; streets run along x at these z positions. */
export const AVENUES = [-210, -140, -70, 0, 70, 140, 210];
export const STREETS = [-210, -140, -70, 0, 70, 140];
/** The coastal road: an east-west street at this z, with the beach and ocean beyond it. */
export const SHORE_Z = 212;

/** Every east-west road line, including Shore Drive. */
export const ALL_STREETS = [...STREETS, SHORE_Z];
/** Half the road width: asphalt spans this far either side of a road's centre line. */
export const ROAD_HALF = 8;
/** Lane offset from the centre line: right-hand traffic keeps this far to its right. */
export const LANE = 4;

/** The city bounds cars and people stay inside (the ocean starts past BEACH_Z). */
export const CITY = { minX: -252, maxX: 252, minZ: -252, maxZ: 252 };
export const BEACH_Z = 236;

/** All intersections as {x, z} nodes. */
export const NODES = [];
for (const x of AVENUES) for (const z of ALL_STREETS) NODES.push({ x, z });

/** The intersection nearest a point. */
export function nearestNode(x, z) {
  let best = NODES[0];
  let bd = Infinity;
  for (const n of NODES) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** The intersections joined to a node by one straight road segment. */
export function neighbours(node) {
  const out = [];
  for (const n of NODES) {
    if (n === node) continue;
    if (n.x === node.x || n.z === node.z) {
      // Only the closest node along each shared road counts as a direct neighbour.
      const between = NODES.some((m) => m !== node && m !== n &&
        ((m.x === node.x && m.x === n.x && (m.z - node.z) * (m.z - n.z) < 0) ||
         (m.z === node.z && m.z === n.z && (m.x - node.x) * (m.x - n.x) < 0)));
      if (!between) out.push(n);
    }
  }
  return out;
}

/**
 * The lane point a driver aims at: travelling from node a to node b, the driving line is
 * offset LANE to the right of the centre line. Returns [x, z] at distance `along` from a.
 */
export function lanePoint(a, b, along) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Right of travel direction (ux, uz) is (uz, -ux) in screen space where +z is south.
  const rx = -uz;
  const rz = ux;
  const t = clamp(along, 0, len);
  return [a.x + ux * t + rx * LANE, a.z + uz * t + rz * LANE];
}

/** True when a point sits on asphalt (used to keep parked cars and spawns sensible). */
export function onRoad(x, z) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sz of ALL_STREETS) if (Math.abs(z - sz) <= ROAD_HALF) return true;
  return false;
}

/** The heading (radians, 0 = -z/north... here 0 faces +z) of travel from a to b. */
export function headingOf(a, b) {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
