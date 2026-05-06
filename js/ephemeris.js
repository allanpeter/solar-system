/**
 * ephemeris.js — Keplerian orbital mechanics
 *
 * Converts simplified orbital elements (J2000 epoch) into 3D positions.
 * No Three.js dependency. Pure math.
 *
 * Coordinate mapping:
 *   Ecliptic X → Three.js X
 *   Ecliptic Y → Three.js -Z  (flip for right-hand → left-hand visual)
 *   Ecliptic Z → Three.js Y   (ecliptic north = "up")
 */

export const DEG2RAD = Math.PI / 180;
export const AU_SCALE = 30; // 1 AU = 30 scene units (compressed for visibility)

// Orbital elements at J2000.0 epoch. Sources: NASA planetary fact sheets / JPL.
// L0    = mean longitude at epoch (deg)
// Lrate = mean longitude rate (deg / Julian century)
// omega = longitude of perihelion = Ω + ω (deg)
// Omega = longitude of ascending node Ω (deg)
export const PLANET_DATA = {
  Mercury: {
    a: 0.38710, e: 0.20563, i: 7.00497,
    L0: 252.25032, Lrate: 149472.67411,
    omega: 77.45779,  Omega: 48.33076,
    radius: 0.55, color: 0xB0AEAE,
    emissive: 0x000000,
    description: 'Smallest planet, closest to the Sun.',
    type: 'Terrestrial', T: 87.97,
  },
  Venus: {
    a: 0.72333, e: 0.00677, i: 3.39468,
    L0: 181.97973, Lrate: 58517.81539,
    omega: 131.60246, Omega: 76.67984,
    radius: 0.95, color: 0xD4A96A,
    emissive: 0x200800,
    description: 'Hottest planet, thick CO₂ atmosphere.',
    type: 'Terrestrial', T: 224.70,
  },
  Earth: {
    a: 1.00000, e: 0.01671, i: 0.00005,
    L0: 100.46457, Lrate: 35999.37244,
    omega: 102.93768, Omega: -11.26064,
    radius: 1.0, color: 0x2E86AB,
    emissive: 0x001122,
    description: 'Our home world — the blue marble.',
    type: 'Terrestrial', T: 365.25,
  },
  Mars: {
    a: 1.52366, e: 0.09340, i: 1.84972,
    L0: 355.45332, Lrate: 19140.30268,
    omega: 336.04084, Omega: 49.55953,
    radius: 0.75, color: 0xC1440E,
    emissive: 0x180300,
    description: 'The red planet — target for human exploration.',
    type: 'Terrestrial', T: 686.97,
  },
  Jupiter: {
    a: 5.20336, e: 0.04839, i: 1.30327,
    L0: 34.33479,  Lrate: 3034.74612,
    omega: 14.72847, Omega: 100.55615,
    radius: 2.5, color: 0xC88B3A,
    emissive: 0x100800,
    description: 'Largest planet — a massive gas giant.',
    type: 'Gas Giant', T: 4332.59,
  },
  Saturn: {
    a: 9.53707, e: 0.05415, i: 2.48446,
    L0: 50.07747,  Lrate: 1222.49309,
    omega: 92.43194, Omega: 113.71504,
    radius: 2.1, color: 0xE8D5A3,
    emissive: 0x100800,
    description: 'The ringed gas giant.',
    type: 'Gas Giant', rings: true, T: 10759.22,
  },
};

const J2000_JD = 2451545.0; // Julian Date of J2000 epoch

// Calendar date → Julian Date Number (valid for dates after 1582)
export function dateToJD(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const A = Math.floor((14 - m) / 12);
  const Y = y + 4800 - A;
  const M = m + 12 * A - 3;
  return (
    d +
    Math.floor((153 * M + 2) / 5) +
    365 * Y +
    Math.floor(Y / 4) -
    Math.floor(Y / 100) +
    Math.floor(Y / 400) -
    32045 -
    0.5
  );
}

export function dateToDays(date) {
  return dateToJD(date) - J2000_JD;
}

// Newton-Raphson solver for Kepler's equation: M = E - e·sin(E)
function solveKepler(M_rad, e) {
  let E = M_rad;
  for (let k = 0; k < 20; k++) {
    const dE = (M_rad - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

// Rotate from orbital plane to ecliptic coordinates.
// omega_deg = longitude of perihelion, Omega_deg = longitude of ascending node.
// ω_arg (argument of periapsis) = omega_deg - Omega_deg
function toEcliptic(xOrb, yOrb, i_deg, omega_deg, Omega_deg) {
  const i  = i_deg * DEG2RAD;
  const argPeri = (omega_deg - Omega_deg) * DEG2RAD;
  const node    = Omega_deg * DEG2RAD;

  const cN = Math.cos(node),    sN = Math.sin(node);
  const cP = Math.cos(argPeri), sP = Math.sin(argPeri);
  const cI = Math.cos(i),       sI = Math.sin(i);

  return {
    x:  (cN * cP - sN * sP * cI) * xOrb + (-cN * sP - sN * cP * cI) * yOrb,
    y:  (sN * cP + cN * sP * cI) * xOrb + (-sN * sP + cN * cP * cI) * yOrb,
    z:  (sP * sI)                * xOrb + ( cP * sI)                * yOrb,
  };
}

/**
 * Return the 3-D position of a planet in Three.js scene units.
 * T_days = days elapsed since J2000 (negative = before J2000).
 */
export function getPlanetPosition(name, T_days) {
  const p = PLANET_DATA[name];
  if (!p) return { x: 0, y: 0, z: 0 };

  const T_cent = T_days / 36525; // Julian centuries since J2000

  // Mean longitude → mean anomaly
  const L     = (p.L0 + p.Lrate * T_cent) % 360;
  const M_deg = ((L - p.omega) % 360 + 360) % 360;
  const M_rad = M_deg * DEG2RAD;

  // Eccentric & true anomaly
  const E  = solveKepler(M_rad, p.e);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + p.e) * Math.sin(E / 2),
    Math.sqrt(1 - p.e) * Math.cos(E / 2),
  );
  const r  = p.a * (1 - p.e * Math.cos(E));

  const ecl = toEcliptic(r * Math.cos(nu), r * Math.sin(nu), p.i, p.omega, p.Omega);

  // Ecliptic → Three.js: X→X, Y→-Z, Z→Y
  return {
    x:  ecl.x * AU_SCALE,
    y:  ecl.z * AU_SCALE,
    z: -ecl.y * AU_SCALE,
  };
}

/**
 * Sample the orbit ellipse uniformly in true anomaly (for drawing orbit paths).
 */
export function getOrbitPoints(name, numPts = 256) {
  const p = PLANET_DATA[name];
  if (!p) return [];

  const pts = [];
  for (let k = 0; k <= numPts; k++) {
    const nu  = (k / numPts) * 2 * Math.PI;
    const r   = (p.a * (1 - p.e * p.e)) / (1 + p.e * Math.cos(nu));
    const ecl = toEcliptic(r * Math.cos(nu), r * Math.sin(nu), p.i, p.omega, p.Omega);
    pts.push({ x: ecl.x * AU_SCALE, y: ecl.z * AU_SCALE, z: -ecl.y * AU_SCALE });
  }
  return pts;
}
