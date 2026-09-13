// Turns a design (choices from the hangar) into geometry, masses, aerodynamics and summary stats.
import { G0, ROCKET, NOSES, BODIES, ENGINES, FINS, TUNING } from './config.js';

export const PRESETS = {
  pathfinder: {
    label: 'Pathfinder (2-stage orbiter)',
    design: { nose: 'ogive', body: 'cylinder', fins: 'swept', guidance: 'standard',
      stages: [{ engine: 'bell', tank: 10 }, { engine: 'vacuum', tank: 4 }] },
  },
  heavy: {
    label: 'Heavy Lifter (3-stage)',
    design: { nose: 'cone', body: 'cylinder', fins: 'delta', guidance: 'standard',
      stages: [{ engine: 'cluster', tank: 24 }, { engine: 'bell', tank: 10 }, { engine: 'vacuum', tank: 3 }] },
  },
  brick: {
    label: 'The Brick',
    design: { nose: 'flat', body: 'box', fins: 'rect', guidance: 'standard',
      stages: [{ engine: 'cone', tank: 18 }] },
  },
  pencil: {
    label: 'Finless Pencil',
    design: { nose: 'ogive', body: 'cylinder', fins: 'none', guidance: 'standard',
      stages: [{ engine: 'aerospike', tank: 12 }, { engine: 'vacuum', tank: 4 }] },
  },
  anchor: {
    label: 'Pad Anchor',
    design: { nose: 'rounded', body: 'cylinder', fins: 'swept', guidance: 'standard',
      stages: [{ engine: 'vacuum', tank: 16 }, { engine: 'bell', tank: 10 }] },
  },
  dart: {
    label: 'Lawn Dart',
    design: { nose: 'cone', body: 'box', fins: 'delta', guidance: 'aggressive',
      stages: [{ engine: 'cluster', tank: 10 }, { engine: 'vacuum', tank: 4 }] },
  },
};

export const TANK_LIMITS = { min: 2, max: 24, step: 0.5 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function cloneDesign(d) {
  return JSON.parse(JSON.stringify(d));
}

export function computeLayout(design) {
  const D = ROCKET.diameter;
  const r = D / 2;
  const body = BODIES[design.body];
  const nose = NOSES[design.nose];
  const fins = FINS[design.fins];
  const n = design.stages.length;
  const rs = r * (body.sphereRadius || 1);

  // --- vertical layout, bottom (y = 0) to top ---
  const stages = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const cfg = design.stages[i];
    const engine = ENGINES[cfg.engine];
    const s = { index: i, engineKey: cfg.engine, engine };
    s.engineY0 = y;
    s.engineY1 = y + engine.height;
    y = s.engineY1;
    let len = cfg.tank;
    s.spheres = 0;
    if (design.body === 'spheres') {
      s.spheres = Math.max(1, Math.round(len / (2 * rs)));
      len = s.spheres * 2 * rs;
    }
    s.tankY0 = y;
    s.tankY1 = y + len;
    s.tankLen = len;
    y = s.tankY1;
    if (i < n - 1) {
      s.interY0 = y;
      y += ROCKET.decouplerHeight;
      s.interY1 = y + ENGINES[design.stages[i + 1].engine].height;
    }
    stages.push(s);
  }

  const tankBase = stages[0].tankY0;
  const tankTop = stages[n - 1].tankY1;
  const radiusAt = (yy) => {
    if (!body.taper) return r;
    const f = clamp((yy - tankBase) / Math.max(tankTop - tankBase, 1e-6), 0, 1);
    return r * (1 - body.taper * f);
  };

  const noseR = design.body === 'spheres' ? r : radiusAt(tankTop);
  const noseLen = nose.lengthD * 2 * noseR;
  const noseY0 = tankTop;
  const noseY1 = tankTop + noseLen;
  const noseMass = nose.mass + ROCKET.payloadMass;

  // --- masses ---
  for (const s of stages) {
    let volume;
    const L = s.tankLen;
    switch (design.body) {
      case 'box': volume = (2 * r) ** 2 * L; break;
      case 'spheres': volume = s.spheres * (4 / 3) * Math.PI * rs ** 3; break;
      case 'tapered': {
        const r1 = radiusAt(s.tankY0), r2 = radiusAt(s.tankY1);
        volume = Math.PI * L / 3 * (r1 * r1 + r1 * r2 + r2 * r2);
        break;
      }
      default: volume = Math.PI * r * r * L;
    }
    s.propMass = volume * ROCKET.propDensity;
    s.tankDry = s.propMass * body.dryFrac;
    s.interMass = s.interY0 !== undefined ? ROCKET.interstageMass : 0;
    s.finMass = s.index === 0 ? fins.mass : 0;
    s.dryMass = s.tankDry + s.engine.mass + s.interMass + s.finMass;
    s.mdot = s.engine.thrustVac / (s.engine.ispVac * G0);
    s.burnTime = s.propMass / s.mdot;
  }

  // Fin centre of pressure (Barrowman), measured from the root leading edge
  const cr = fins.root * D, ct = fins.tip * D, sweep = fins.sweep * D;
  const finXcp = cr > 0
    ? (sweep * (cr + 2 * ct)) / (3 * (cr + ct)) + (1 / 6) * (cr + ct - (cr * ct) / (cr + ct))
    : 0;
  const finYcp = stages[0].tankY0 + cr - finXcp;

  // --- stacks: what is left of the rocket after k stagings ---
  const stacks = [];
  for (let k = 0; k < n; k++) {
    const sk = stages[k];
    const yBottom = sk.engineY0;
    const height = noseY1 - yBottom;
    const baseR = radiusAt(sk.tankY0);
    let area;
    if (design.body === 'box') area = 4 * baseR * baseR;
    else if (design.body === 'spheres') area = Math.PI * rs * rs;
    else area = Math.PI * baseR * baseR;
    const refR2 = area / Math.PI;

    // mass elements, in absolute y
    const elements = [];
    for (let i = k; i < n; i++) {
      const s = stages[i];
      elements.push({ m: s.engine.mass, y: (s.engineY0 + s.engineY1) / 2, len: s.engine.height });
      elements.push({ m: s.tankDry, y: (s.tankY0 + s.tankY1) / 2, len: s.tankLen });
      elements.push({ propStage: i, full: s.propMass, y0: s.tankY0, len: s.tankLen });
      if (s.interMass) elements.push({ m: s.interMass, y: (s.interY0 + s.interY1) / 2, len: s.interY1 - s.interY0 });
      if (s.finMass) elements.push({ m: s.finMass, y: s.tankY0 + cr / 2, len: cr });
    }
    elements.push({ m: noseMass, y: noseY0 + noseLen * 0.3, len: noseLen });

    // normal-force contributions
    const cn = [];
    cn.push({ cna: 2 * (noseR * noseR) / refR2, y: noseY1 - nose.cpFrac * noseLen, label: 'nose' });
    if (body.taper) {
      const d1 = noseR, d2 = baseR, L = tankTop - sk.tankY0;
      const ratio = d1 / d2;
      const cna = 2 * (d2 * d2 - d1 * d1) / refR2;
      const xcp = L / 3 * (1 + (1 - ratio) / (1 - ratio * ratio));
      cn.push({ cna, y: tankTop - xcp, label: 'taper' });
    }
    if (k === 0 && fins.cna > 0) cn.push({ cna: fins.cna, y: finYcp, label: 'fins' });
    const cnaTotal = cn.reduce((a, c) => a + c.cna, 0);
    const ycp = cn.reduce((a, c) => a + c.cna * c.y, 0) / cnaTotal;

    const lOverD = height / D;
    let strength = body.strength;
    if (lOverD > 20) strength *= 20 / lOverD;

    stacks.push({
      k, yBottom, height, area, baseR,
      cd0: nose.cd + body.cd + (k === 0 ? fins.cd : 0) + sk.engine.cd + TUNING.skinCd * lOverD,
      transonic: nose.transonic * body.transonic,
      sideArea: height * D,
      elements, cn, cnaTotal, ycp,
      engineY: sk.engineY0 + 0.3,
      strength,
      lOverD,
    });
  }

  return {
    design: JSON.parse(JSON.stringify(design)),
    D, r, rs, body, nose, fins, stages, stacks,
    tankBase, tankTop, noseR, noseLen, noseY0, noseY1, noseMass,
    finGeom: { cr, ct, sweep, span: fins.span * D },
    height: noseY1,
    radiusAt,
  };
}

// Mass properties of a stack for a given propellant state
export function massProps(stack, prop) {
  let m = 0, my = 0;
  const pts = [];
  for (const el of stack.elements) {
    let mass, yy;
    if (el.propStage !== undefined) {
      mass = prop[el.propStage];
      const frac = el.full > 0 ? mass / el.full : 0;
      yy = el.y0 + el.len * 0.5 * Math.max(frac, 0.02);
      pts.push([mass, yy, el.len * Math.max(frac, 0.02)]);
    } else {
      mass = el.m;
      yy = el.y;
      pts.push([mass, yy, el.len]);
    }
    m += mass;
    my += mass * yy;
  }
  const ycm = my / m;
  let I = 0;
  for (const [mass, yy, len] of pts) I += mass * ((yy - ycm) ** 2 + (len * len) / 12);
  return { m, ycm, I };
}

export function computeStats(layout) {
  const { stages, stacks, D } = layout;
  const n = stages.length;
  const full = stages.map((s) => s.propMass);
  const perStage = [];
  let totalDv = 0;
  for (let k = 0; k < n; k++) {
    const s = stages[k];
    const prop = full.map((p, i) => (i >= k ? p : 0));
    const m0 = massProps(stacks[k], prop).m;
    const mf = m0 - s.propMass;
    const isp = k === 0 ? s.engine.ispSL * 0.35 + s.engine.ispVac * 0.65 : s.engine.ispVac;
    const dv = isp * G0 * Math.log(m0 / mf);
    const thrust = k === 0 ? s.engine.thrustVac * s.engine.ispSL / s.engine.ispVac : s.engine.thrustVac;
    const twr = thrust / (m0 * G0);
    totalDv += dv;
    perStage.push({ k, m0, mf, dv, twr, burnTime: s.burnTime, engine: s.engine.name, prop: s.propMass });
  }

  const st0 = stacks[0];
  const launch = massProps(st0, full);
  const burnout = massProps(st0, full.map((p, i) => (i === 0 ? 0 : p)));
  const marginLaunch = (launch.ycm - st0.ycp) / D;
  const marginBurnout = (burnout.ycm - st0.ycp) / D;

  // Upper stage margin (no fins) matters if staging happens while still in the air
  let marginUpper = null;
  if (n > 1) {
    const s1 = stacks[1];
    const mp = massProps(s1, full.map((p, i) => (i >= 1 ? p : 0)));
    marginUpper = (mp.ycm - s1.ycp) / D;
  }

  // Control authority vs aerodynamic upset at a typical max-Q (20 kPa) and 5° angle of attack
  const e0 = stages[0].engine;
  const thrustSL = e0.thrustVac * e0.ispSL / e0.ispVac;
  const worstMargin = Math.min(marginLaunch, marginBurnout);
  const gimbalTorque = thrustSL * Math.sin(e0.gimbal * Math.PI / 180) * Math.max(launch.ycm - st0.engineY, 1) + TUNING.wheelTorque;
  const upset = worstMargin < 0
    ? TUNING.aeroTorqueScale * 20_000 * st0.area * st0.cnaTotal * Math.sin(5 * Math.PI / 180) * (-worstMargin * D)
    : 0;
  const control = upset > 0 ? gimbalTorque / upset : Infinity;

  return {
    totalMass: launch.m,
    height: layout.height,
    liftoffTWR: perStage[0].twr,
    totalDv,
    perStage,
    cd: st0.cd0,
    marginLaunch, marginBurnout, marginUpper,
    control,
    maxQ: st0.strength,
    lOverD: st0.lOverD,
  };
}

export const DV_TO_ORBIT = 3400;

export function designChecks(stats, design) {
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  if (stats.liftoffTWR < 1) add('bad', `Liftoff thrust-to-weight is ${stats.liftoffTWR.toFixed(2)}. It will not leave the pad.`);
  else if (stats.liftoffTWR < 1.25) add('warn', 'Liftoff TWR is low. Expect heavy gravity losses.');
  else if (stats.liftoffTWR > 3) add('warn', 'Very high TWR. Dynamic pressure will spike low in the atmosphere.');
  else add('good', 'Healthy liftoff thrust-to-weight.');

  if (stats.totalDv < 2800) add('bad', `Only ${Math.round(stats.totalDv)} m/s of Δv. Orbit needs about ${DV_TO_ORBIT}.`);
  else if (stats.totalDv < 3700) add('warn', 'Δv is marginal for orbit. Drag and steering losses may eat it.');
  else add('good', 'Enough Δv for orbit, on paper.');

  const m = Math.min(stats.marginLaunch, stats.marginBurnout);
  if (m < 0 && stats.control < 1.3) add('bad', 'Aerodynamically unstable and the engine can’t correct it. Likely to tumble.');
  else if (m < 0) add('warn', 'Aerodynamically unstable. The gimbal has to fight to keep it straight.');
  else if (m > 5) add('warn', 'Over-stable. It will weathervane and resist turning.');
  else add('good', 'Aerodynamically stable.');

  if (stats.maxQ < 35) add('warn', `Weak structure: breaks above ~${Math.round(stats.maxQ)} kPa dynamic pressure.`);
  if (stats.cd > 0.6) add('warn', 'High drag. A lot of thrust will be wasted pushing air.');
  if (design.guidance === 'straight') add('warn', 'Straight up never builds sideways speed. That can’t make orbit.');
  if (stats.perStage.length > 1 && stats.perStage[stats.perStage.length - 1].twr < 0.35) add('warn', 'Upper stage is very weak. Circularization will take a long time.');
  return checks;
}
