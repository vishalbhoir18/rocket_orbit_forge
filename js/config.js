// Shared constants and the parts catalog. No three.js here so the physics can run headless.

export const G0 = 9.80665;

// A compact, Kerbin-sized planet: ~3.4 km/s of delta-v gets you to orbit.
export const PLANET = {
  radius: 600_000,          // m
  mu: 9.81 * 600_000 ** 2,  // m^3/s^2
  atmosphereHeight: 70_000, // m, density is treated as zero above this
  scaleHeight: 5_600,       // m
  rho0: 1.225,              // kg/m^3 at sea level
};

export const ROCKET = {
  diameter: 2.2,        // m, reference diameter for every stage
  propDensity: 600,     // kg of propellant per m^3 of tank volume
  payloadMass: 4_000,   // kg, satellite under the nose cone
  interstageMass: 350,  // kg
  decouplerHeight: 0.35,
  padHeight: 3.0,       // rocket base sits this high above the ground
};

export const ORBIT_TARGET = {
  apoapsis: 80_000,     // autopilot target apoapsis
  safePeriapsis: 70_000 // periapsis above this = stable orbit
};

export const NOSES = {
  ogive:   { name: 'Ogive',       desc: 'Smooth tangent ogive. Lowest drag, stays sleek through Mach 1.', lengthD: 2.0, mass: 450, cd: 0.10, transonic: 1.0, cpFrac: 0.466 },
  cone:    { name: 'Conical',     desc: 'Simple straight cone. Low drag, slightly worse transonic.',     lengthD: 1.7, mass: 400, cd: 0.14, transonic: 1.15, cpFrac: 0.666 },
  rounded: { name: 'Elliptical',  desc: 'Short rounded dome. Compact but noticeably draggier.',           lengthD: 0.8, mass: 350, cd: 0.26, transonic: 1.35, cpFrac: 0.42 },
  flat:    { name: 'Flat Cap',    desc: 'A blunt lid. Massive drag and a brutal sound barrier.',          lengthD: 0.22, mass: 300, cd: 0.85, transonic: 1.9, cpFrac: 0.2 },
};

export const BODIES = {
  cylinder: { name: 'Cylinder',        desc: 'Efficient, strong, and aerodynamic. The classic.',                      cd: 0.10, dryFrac: 0.125, strength: 55, transonic: 1.0 },
  tapered:  { name: 'Tapered',         desc: 'Narrows toward the top. Very stable, but holds less fuel.',             cd: 0.09, dryFrac: 0.12,  strength: 60, transonic: 0.95, taper: 0.45 },
  box:      { name: 'Square Box',      desc: 'More volume, but draggy, heavy, and weak at the corners.',              cd: 0.34, dryFrac: 0.17,  strength: 30, transonic: 1.25 },
  spheres:  { name: 'Spherical Tanks', desc: 'Light pressure spheres. Wide, lumpy, and draggy in the air.',            cd: 0.42, dryFrac: 0.10,  strength: 42, transonic: 1.2, sphereRadius: 1.15 },
};

// thrust in N (vacuum), Isp in s, mass in kg, gimbal in degrees, height in m
export const ENGINES = {
  bell:      { name: 'Bell Nozzle',    desc: 'Balanced sea-level engine with a 5° gimbal.',                     thrustVac: 900e3,  ispSL: 285, ispVac: 315, mass: 1800, gimbal: 5.0, height: 2.1, cd: 0.02, exit: 0.62 },
  cone:      { name: 'Conical Nozzle', desc: 'Cheap and light. Lower efficiency, barely steers (1.5°).',         thrustVac: 820e3,  ispSL: 262, ispVac: 290, mass: 1400, gimbal: 1.5, height: 1.8, cd: 0.02, exit: 0.55 },
  aerospike: { name: 'Aerospike',      desc: 'Efficient at every altitude, but fixed: almost no steering.',     thrustVac: 650e3,  ispSL: 300, ispVac: 322, mass: 2000, gimbal: 0.6, height: 1.3, cd: 0.03, exit: 0.8 },
  vacuum:    { name: 'Vacuum Bell',    desc: 'Huge nozzle. Superb in space, pathetic at sea level.',            thrustVac: 220e3,  ispSL: 120, ispVac: 345, mass: 900,  gimbal: 4.0, height: 2.6, cd: 0.04, exit: 0.85 },
  cluster:   { name: 'Triple Cluster', desc: 'Three chambers, enormous thrust, heavy and thirsty.',             thrustVac: 2100e3, ispSL: 270, ispVac: 298, mass: 4800, gimbal: 4.0, height: 2.3, cd: 0.05, exit: 0.3 },
};

// Fin sizes are in units of rocket diameter. cna is the normal-force slope for the fin set.
export const FINS = {
  none:  { name: 'No Fins',    desc: 'Clean and light, but aerodynamically unstable. Relies on engine gimbal.', cna: 0,   cd: 0,    mass: 0,   root: 0,   tip: 0,    span: 0,   sweep: 0 },
  delta: { name: 'Delta',      desc: 'Small triangular fins. A little stability for little drag.',              cna: 4.5, cd: 0.03, mass: 200, root: 1.1, tip: 0.08, span: 0.7, sweep: 1.02 },
  swept: { name: 'Swept',      desc: 'Swept-back fins. Strong stability at modest drag.',                       cna: 6.5, cd: 0.045, mass: 280, root: 1.2, tip: 0.5,  span: 0.8, sweep: 0.8 },
  rect:  { name: 'Big Square', desc: 'Huge slabs. Rock-solid stability, lots of drag, hard to steer.',          cna: 11,  cd: 0.13, mass: 520, root: 1.3, tip: 1.3,  span: 1.05, sweep: 0 },
};

export const GUIDANCE = {
  standard:   { name: 'Gravity Turn',    desc: 'Pitches over smoothly, coasts to apoapsis, circularizes.', kind: 'program', h0: 800,  h1: 50_000, exp: 0.5,  aoaLimit: 5 },
  gentle:     { name: 'Lofted Turn',     desc: 'Climbs steeply and turns late. Safe but less efficient.',  kind: 'program', h0: 2000, h1: 70_000, exp: 0.55, aoaLimit: 3 },
  aggressive: { name: 'Aggressive Turn', desc: 'Turns hard and early, ignoring the angle of attack.',      kind: 'program', h0: 150,  h1: 16_000, exp: 0.4,  aoaLimit: null },
  straight:   { name: 'Straight Up',     desc: 'No guidance: burn everything vertically.',                  kind: 'straight' },
  manual:     { name: 'Manual',          desc: 'You fly. A/D pitch, W/S throttle, Space to stage.',          kind: 'manual' },
};

// Gameplay tuning for the flight model
export const TUNING = {
  aeroTorqueScale: 1.5,  // exaggerates aerodynamic moments so stability choices matter
  pitchDamping: 0.4,
  sideCd: 1.1,           // drag coefficient when broadside to the flow
  bendFactor: 0.8,       // bending limit = strength * bendFactor (kPa)
  maxG: 15,
  wheelTorque: 25_000,   // N·m reaction wheel in the payload
  spoolTime: 1.2,        // s to reach full thrust
  stageDelay: 1.0,       // s between separation and ignition
  skinCd: 0.004,         // per caliber of length
};
