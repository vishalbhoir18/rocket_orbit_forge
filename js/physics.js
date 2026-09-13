// 2-D flight simulation in the planet's equatorial plane. Pure JS, no rendering.
import { G0, PLANET, ROCKET, ORBIT_TARGET, GUIDANCE, TUNING } from './config.js';
import { massProps } from './design.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

export function soundSpeed(alt) {
  return 340 - 45 * clamp(alt / 12_000, 0, 1);
}

export function airDensity(alt) {
  if (alt >= PLANET.atmosphereHeight) return 0;
  return PLANET.rho0 * Math.exp(-Math.max(alt, 0) / PLANET.scaleHeight);
}

function machFactor(M, trans) {
  if (M < 0.75) return 1;
  if (M < 1.05) {
    const t = (M - 0.75) / 0.3;
    return 1 + 1.6 * trans * t * t * (3 - 2 * t);
  }
  if (M < 3) {
    const t = (M - 1.05) / 1.95;
    return 1 + trans * (1.6 + (0.4 - 1.6) * t);
  }
  return 1 + trans * Math.max(0.25, 0.4 - (M - 3) * 0.03);
}

export function orbitalElements(x, y, vx, vy) {
  const mu = PLANET.mu, R = PLANET.radius;
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const rv = x * vx + y * vy;
  const h = x * vy - y * vx;
  const energy = v2 / 2 - mu / r;
  const ex = ((v2 - mu / r) * x - rv * vx) / mu;
  const ey = ((v2 - mu / r) * y - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;
  const rp = p / (1 + e);
  const a = Math.abs(energy) > 1e-9 ? -mu / (2 * energy) : Infinity;
  // For bound orbits use rp + ra = 2a, which also works for (near-)radial trajectories where e ≈ 1
  const ra = energy < 0 ? Math.max(2 * a - rp, rp) : Infinity;

  // time to apoapsis
  let tApo = Infinity;
  if (e < 1 && e > 1e-6) {
    const cosNu = clamp((ex * x + ey * y) / (e * r), -1, 1);
    let nu = Math.acos(cosNu);
    if (rv < 0) nu = TAU - nu;
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    let M = E - e * Math.sin(E);
    if (M < 0) M += TAU;
    const nMean = Math.sqrt(mu / (a * a * a));
    tApo = M <= Math.PI ? (Math.PI - M) / nMean : (3 * Math.PI - M) / nMean;
  }
  return { r, h, e, ex, ey, p, a, energy, peri: rp - R, apo: ra - R, rp, ra, tApo, argPeri: Math.atan2(ey, ex) };
}

export class FlightSim {
  constructor(layout, guidanceKey) {
    this.layout = layout;
    this.guidanceKey = guidanceKey;
    this.guidance = GUIDANCE[guidanceKey];
    const R = PLANET.radius;

    this.x = 0;
    this.y = R + ROCKET.padHeight;
    this.vx = 0;
    this.vy = 0;
    this.theta = Math.PI / 2;
    this.omega = 0;
    this.t = 0;

    this.stage = 0;
    this.prop = layout.stages.map((s) => s.propMass);
    this.throttle = 1;
    this.ignitionT = 0;
    this.liftedOff = false;
    this.phase = 'ascent';
    this.targetTheta = this.theta;
    this.gimbal = 0;
    this.thrust = 0;

    this.manualThrottle = 1;
    this.manualPitchInput = 0;
    this.manualTarget = this.theta;
    this.stageRequest = false;

    this.dropped = [];
    this.events = [];
    this.outcome = null;     // { type, final, success, ... }
    this.announced = {};
    this.gustSeed = Math.random() * 100;

    this.record = {
      maxAlt: 0, maxSpeed: 0, maxQ: 0, maxQAlt: 0, maxG: 0, maxAoA: 0,
      minMargin: Infinity, liftoffT: null, fuelOutT: null, dragLoss: 0, gravityLoss: 0,
    };
    this.maxQPassed = false;
    this.supersonic = false;
    this.tel = {};
    this.updateTelemetry(0, 0, 0, 0, 0, 0, 0);
  }

  emit(type, msg, extra = {}) {
    this.events.push({ type, msg, t: this.t, ...extra });
  }

  get finished() {
    return !!(this.outcome && this.outcome.final);
  }

  totalProp() {
    let p = 0;
    for (let i = this.stage; i < this.prop.length; i++) p += this.prop[i];
    return p;
  }

  canStage() {
    return this.stage < this.layout.stages.length - 1;
  }

  doStage() {
    if (!this.canStage()) return;
    const L = this.layout;
    const k = this.stage;
    const dy = L.stacks[k + 1].yBottom - L.stacks[k].yBottom;
    const ax = Math.cos(this.theta), ay = Math.sin(this.theta);
    const st = L.stacks[k];
    const drop = {
      stage: k,
      x: this.x, y: this.y,
      vx: this.vx - ax * 1.5, vy: this.vy - ay * 1.5,
      theta: this.theta, omega: this.omega + (Math.random() - 0.5) * 0.3,
      mass: L.stages[k].dryMass + this.prop[k],
      area: (st.area + (L.stages[k].tankLen + 2) * L.D) / 2,
      dead: false, age: 0,
    };
    this.dropped.push(drop);
    this.prop[k] = 0;
    this.x += ax * dy;
    this.y += ay * dy;
    this.vx += ax * 0.8;
    this.vy += ay * 0.8;
    this.stage = k + 1;
    this.ignitionT = this.t + TUNING.stageDelay;
    this.emit('stage', `Stage ${k + 1} separation`, { drop });
  }

  availableAccel(mass) {
    const s = this.layout.stages[this.stage];
    if (this.prop[this.stage] > 0) return s.engine.thrustVac / mass;
    if (this.canStage()) {
      const next = this.layout.stages[this.stage + 1];
      const nm = massProps(this.layout.stacks[this.stage + 1], this.prop).m;
      return next.engine.thrustVac / nm;
    }
    return 0;
  }

  computeGuidance(ctx) {
    const { alt, phi, prograde, speed, q, orb, m, vr } = ctx;
    const g = this.guidance;
    const horizon = phi - Math.PI / 2;
    const atmo = PLANET.atmosphereHeight;

    if (g.kind === 'straight') {
      this.throttle = 1;
      return phi;
    }
    if (g.kind === 'manual') {
      this.manualTarget += this.manualPitchInput * 0.7 * ctx.dt;
      this.throttle = this.manualThrottle;
      return this.manualTarget;
    }

    // Programmed gravity turn
    if (this.phase === 'ascent') {
      const f = clamp((alt - g.h0) / (g.h1 - g.h0), 0, 1);
      const pitch = (Math.PI / 2) * Math.pow(f, g.exp);
      let tgt = phi - pitch;
      if (g.aoaLimit && speed > 40) {
        const lim = g.aoaLimit * DEG * clamp(10_000 / Math.max(q, 1), 0.25, 3);
        tgt = prograde + clamp(wrap(tgt - prograde), -lim, lim);
      }
      this.throttle = 1;
      if (orb.apo >= ORBIT_TARGET.apoapsis) {
        this.phase = 'coast';
        this.emit('meco', `Apoapsis ${(orb.apo / 1000).toFixed(0)} km reached. Engines off, coasting.`);
      }
      return tgt;
    }

    if (this.phase === 'coast') {
      this.throttle = 0;
      if (alt < atmo && orb.apo < ORBIT_TARGET.apoapsis - 2000 && vr > 0) {
        this.phase = 'ascent';
      }
      const accel = this.availableAccel(m);
      if (accel > 0 && orb.e < 1) {
        const ra = orb.ra;
        const va = Math.sqrt(Math.max(PLANET.mu * (2 / ra - 1 / orb.a), 0));
        const dv = Math.sqrt(PLANET.mu / ra) - va;
        const burn = dv / accel;
        if (orb.tApo <= burn / 2 + 3 || (vr < 0 && alt > atmo * 0.9)) {
          this.phase = 'circularize';
          this.emit('circ', `Circularization burn: ${Math.round(dv)} m/s needed`);
        }
      }
      return prograde;
    }

    if (this.phase === 'circularize') {
      const pitchUp = clamp(-vr * 0.004 + (ORBIT_TARGET.apoapsis - alt) * 0.000004, -0.2, 0.6);
      this.throttle = 1;
      if (orb.peri >= ORBIT_TARGET.safePeriapsis + 3000 || orb.e >= 1) {
        this.throttle = 0;
        this.phase = 'orbit';
        this.emit('seco', 'Engine cutoff. Periapsis is above the atmosphere.');
      } else if (orb.peri > ORBIT_TARGET.safePeriapsis - 4000) {
        this.throttle = 0.3;
      }
      return horizon + pitchUp;
    }

    this.throttle = 0;
    return prograde;
  }

  step(dt) {
    if (this.finished) return;
    const L = this.layout;
    const P = PLANET;
    const D = L.D;

    const r = Math.hypot(this.x, this.y);
    const alt = r - P.radius;
    const ux = this.x / r, uy = this.y / r;
    const gmag = P.mu / (r * r);
    const speed = Math.hypot(this.vx, this.vy);
    const vr = this.vx * ux + this.vy * uy;
    const rho = airDensity(alt);
    const pRatio = rho / P.rho0;
    const phi = Math.atan2(this.y, this.x);

    const stack = L.stacks[this.stage];
    const stageDef = L.stages[this.stage];
    const eng = stageDef.engine;
    const mp = massProps(stack, this.prop);
    const m = mp.m;

    const gamma = speed > 0.5 ? Math.atan2(this.vy, this.vx) : this.theta;
    const prograde = speed > 5 ? gamma : phi;
    const q = 0.5 * rho * speed * speed;
    const orb = orbitalElements(this.x, this.y, this.vx, this.vy);

    // guidance
    this.targetTheta = this.computeGuidance({ alt, phi, prograde, speed, q, orb, m, vr, dt });

    if (this.stageRequest) {
      this.stageRequest = false;
      if (this.liftedOff) this.doStage();
    }

    // thrust
    let thrust = 0;
    let mdot = 0;
    if (this.t >= this.ignitionT && this.prop[this.stage] > 0 && this.throttle > 0) {
      const spool = clamp((this.t - this.ignitionT) / TUNING.spoolTime, 0.05, 1);
      const isp = eng.ispVac + (eng.ispSL - eng.ispVac) * pRatio;
      mdot = stageDef.mdot * this.throttle * spool;
      const used = mdot * dt;
      let frac = 1;
      if (used > this.prop[this.stage]) frac = this.prop[this.stage] / used;
      thrust = mdot * isp * G0 * frac;
      this.prop[this.stage] = Math.max(0, this.prop[this.stage] - used);
      if (this.prop[this.stage] <= 0) {
        this.emit('burnout', `Stage ${this.stage + 1} burnout`);
      }
    }
    this.thrust = thrust;

    // aerodynamics
    const alpha = speed > 5 ? wrap(this.theta - gamma) : 0;
    const sinA = Math.sin(alpha), cosA = Math.cos(alpha);
    const mach = speed / soundSpeed(alt);
    const cd = stack.cd0 * machFactor(mach, stack.transonic);
    const cdEff = cd * cosA * cosA + TUNING.sideCd * (stack.sideArea / stack.area) * sinA * sinA;
    const drag = q * cdEff * stack.area;
    const lift = q * stack.area * stack.cnaTotal * sinA * cosA;

    const hx = Math.cos(this.theta), hy = Math.sin(this.theta);
    let fx = thrust * hx, fy = thrust * hy;
    if (speed > 0.01) {
      const vxh = this.vx / speed, vyh = this.vy / speed;
      fx += -drag * vxh + lift * -vyh;
      fy += -drag * vyh + lift * vxh;
    }
    const nonGravAccel = Math.hypot(fx, fy) / m;

    if (!this.liftedOff) {
      if (thrust > m * gmag * 1.001) {
        this.liftedOff = true;
        this.record.liftoffT = this.t;
        this.emit('liftoff', 'Liftoff!');
      } else {
        this.t += dt;
        if ((this.prop[0] <= 0 && this.t > 3) || this.t > 10) {
          this.finish('pad', false, 'Never left the pad', `Thrust (${Math.round(thrust / 1000)} kN) never exceeded the rocket's weight (${Math.round(m * gmag / 1000)} kN).`);
        } else if (this.t > 4 && thrust < m * gmag && !this.announced.heavy) {
          this.announced.heavy = true;
          this.emit('warn', 'Thrust is lower than weight. The rocket is stuck on the pad.');
        }
        this.updateTelemetry(alt, speed, vr, q, mach, 0, alpha, orb, m, mp);
        return;
      }
    }

    // translation (semi-implicit Euler)
    const ax = fx / m - gmag * ux;
    const ay = fy / m - gmag * uy;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.record.dragLoss += (drag / m) * dt;

    // rotation
    const marginM = mp.ycm - stack.ycp;
    const gust = speed > 20 && alt < 25_000
      ? DEG * 1.5 * Math.exp(-alt / 9000) * (Math.sin(this.t * 1.3 + this.gustSeed) * 0.6 + Math.sin(this.t * 2.9 + this.gustSeed * 2) * 0.4)
      : 0;
    const aeroT = -TUNING.aeroTorqueScale * q * stack.area * stack.cnaTotal * Math.sin(alpha + gust) * marginM;
    const dampT = -TUNING.pitchDamping * q * stack.area * Math.max(stack.cnaTotal, 2) * stack.height * stack.height / Math.max(speed, 30) * this.omega;
    const err = wrap(this.targetTheta - this.theta);
    const desired = mp.I * (4.0 * err - 4.0 * this.omega);
    const armL = Math.max(mp.ycm - stack.engineY, 1);
    const maxCtrl = thrust * Math.sin(eng.gimbal * DEG) * armL + TUNING.wheelTorque;
    const ctrl = clamp(desired, -maxCtrl, maxCtrl);
    this.gimbal = maxCtrl > 0 ? clamp(ctrl / maxCtrl, -1, 1) * (thrust > 0 ? 1 : 0) : 0;
    this.omega += ((aeroT + dampT + ctrl) / mp.I) * dt;
    this.omega = clamp(this.omega, -6, 6);
    this.theta += this.omega * dt;

    // staging
    if (this.prop[this.stage] <= 0 && this.canStage()) this.doStage();

    // spent stages
    for (const d of this.dropped) {
      if (d.dead) continue;
      d.age += dt;
      const dr = Math.hypot(d.x, d.y);
      const dAlt = dr - P.radius;
      const dsp = Math.hypot(d.vx, d.vy);
      const dq = 0.5 * airDensity(dAlt) * dsp * dsp;
      const dDrag = dq * 0.9 * d.area / d.mass;
      const dg = P.mu / (dr * dr);
      let dax = -dg * d.x / dr, day = -dg * d.y / dr;
      if (dsp > 0.01) {
        dax -= dDrag * d.vx / dsp;
        day -= dDrag * d.vy / dsp;
      }
      d.vx += dax * dt;
      d.vy += day * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.theta += d.omega * dt;
      if (dAlt <= 0) {
        d.dead = true;
        this.emit('debris', `Stage ${d.stage + 1} hit the ground`, { drop: d });
      }
    }

    this.t += dt;

    // flight record
    const newR = Math.hypot(this.x, this.y);
    const newAlt = newR - P.radius;
    const newVr = (this.vx * this.x + this.vy * this.y) / newR;
    const rec = this.record;
    rec.maxAlt = Math.max(rec.maxAlt, newAlt);
    rec.maxSpeed = Math.max(rec.maxSpeed, speed);
    rec.maxG = Math.max(rec.maxG, nonGravAccel / G0);
    if (q > rec.maxQ) { rec.maxQ = q; rec.maxQAlt = alt; }
    if (q > 1000) rec.maxAoA = Math.max(rec.maxAoA, Math.abs(alpha));
    if (q > 500) rec.minMargin = Math.min(rec.minMargin, marginM / D);

    if (!this.maxQPassed && rec.maxQ > 2000 && q < rec.maxQ * 0.97) {
      this.maxQPassed = true;
      this.emit('maxq', `Max Q: ${(rec.maxQ / 1000).toFixed(1)} kPa`);
    }
    if (!this.supersonic && mach > 1) {
      this.supersonic = true;
      this.emit('supersonic', 'Supersonic');
    }
    if (!this.announced.space && newAlt > P.atmosphereHeight) {
      this.announced.space = true;
      this.emit('space', 'Left the atmosphere');
    }

    // --- failure and success checks ---
    if (newAlt <= 0 && newVr < 0) {
      const impact = Math.round(Math.hypot(this.vx, this.vy));
      const why = this.totalProp() <= 0 && rec.maxAlt > 1000
        ? 'It ran out of fuel before reaching orbital speed and fell back.'
        : 'It lost control and hit the ground.';
      this.finish('crash', false, 'Crashed', `${why} Impact at ${impact} m/s.`);
      return;
    }
    if (alt < P.atmosphereHeight) {
      if (q / 1000 > stack.strength && vr < 0 && this.record.maxAlt > 5000) {
        this.finish('reentry', false, 'Broke apart on reentry', `It fell back into the atmosphere at ${Math.round(speed)} m/s and the airframe gave way at ${(q / 1000).toFixed(1)} kPa.`);
        return;
      }
      if (q / 1000 > stack.strength) {
        this.finish('maxq', false, 'Structural failure', `Dynamic pressure hit ${(q / 1000).toFixed(1)} kPa, above the ${Math.round(stack.strength)} kPa the airframe can take.`);
        return;
      }
      const bend = (q * Math.abs(Math.sin(alpha)) * stack.lOverD) / 1000;
      if (bend > stack.strength * TUNING.bendFactor && q > 800) {
        this.finish('aero', false, 'Aerodynamic breakup', `The rocket turned ${Math.round(Math.abs(alpha) / DEG)}° sideways into a ${(q / 1000).toFixed(1)} kPa airstream and snapped.`);
        return;
      }
    }
    if (nonGravAccel / G0 > TUNING.maxG) {
      this.finish('g', false, 'Structural failure', `Acceleration reached ${(nonGravAccel / G0).toFixed(1)} g and crushed the payload.`);
      return;
    }

    const orbAfter = orbitalElements(this.x, this.y, this.vx, this.vy);
    const coasting = thrust === 0 && (this.throttle === 0 || this.totalProp() <= 0);
    if (!this.announced.orbit && newAlt > P.atmosphereHeight && coasting) {
      if (orbAfter.e >= 1) {
        this.announced.orbit = true;
        this.setOutcome({ type: 'escape', final: false, success: false, partial: true, title: 'Escape trajectory', detail: 'The rocket is moving faster than escape velocity and is leaving the planet behind.' });
      } else if (orbAfter.peri > ORBIT_TARGET.safePeriapsis) {
        this.announced.orbit = true;
        this.setOutcome({ type: 'orbit', final: false, success: true, title: 'Orbit achieved', detail: `Stable orbit of ${(orbAfter.peri / 1000).toFixed(1)} × ${(orbAfter.apo / 1000).toFixed(1)} km.` });
      }
    }
    if (!this.announced.fuel && this.totalProp() <= 0 && this.liftedOff) {
      this.announced.fuel = true;
      rec.fuelOutT = this.t;
      if (!(orbAfter.peri > ORBIT_TARGET.safePeriapsis || orbAfter.e >= 1)) {
        this.emit('warn', 'Out of fuel on a suborbital trajectory');
        this.announced.suborbital = true;
      }
    }

    this.updateTelemetry(newAlt, speed, newVr, q, mach, nonGravAccel / G0, alpha, orbAfter, m, mp);
  }

  setOutcome(o) {
    this.outcome = { ...o, t: this.t, record: { ...this.record } };
    this.emit('outcome', o.title, { outcome: this.outcome });
  }

  finish(type, success, title, detail) {
    this.setOutcome({ type, final: true, success, title, detail });
  }

  updateTelemetry(alt, speed, vr, q, mach, g, alpha, orb, m, mp) {
    const L = this.layout;
    const s = L.stages[this.stage];
    this.tel = {
      t: this.t,
      alt, speed, vr,
      vh: Math.sqrt(Math.max(speed * speed - vr * vr, 0)),
      q, mach, g, aoa: alpha / DEG,
      apo: orb ? orb.apo : 0,
      peri: orb ? orb.peri : -PLANET.radius,
      e: orb ? orb.e : 0,
      tApo: orb ? orb.tApo : Infinity,
      mass: m || 0,
      thrust: this.thrust,
      throttle: this.throttle,
      stage: this.stage,
      stages: L.stages.length,
      fuelFrac: s.propMass > 0 ? this.prop[this.stage] / s.propMass : 0,
      margin: mp ? (mp.ycm - L.stacks[this.stage].ycp) / L.D : 0,
      phase: this.phase,
    };
  }
}
