// DOM: hangar builder, design analysis, flight HUD, and result screens.
import { NOSES, BODIES, FINS, ENGINES, GUIDANCE, PLANET } from './config.js';
import { PRESETS, TANK_LIMITS, DV_TO_ORBIT, massProps } from './design.js';
import { ICONS, OUTCOME_ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const WARP_LEVELS = [1, 2, 5, 10, 50, 100, 500];

export const fmt = {
  dist(m) {
    if (!Number.isFinite(m)) return '∞';
    const a = Math.abs(m);
    if (a >= 1e6) return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
    if (a >= 10_000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m).toLocaleString('en-US')} m`;
  },
  speed: (v) => `${Math.round(v).toLocaleString('en-US')} m/s`,
  time(s) {
    if (!Number.isFinite(s)) return '–';
    s = Math.max(0, s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  },
  mass: (kg) => `${(kg / 1000).toFixed(1)} t`,
};

export class UI {
  constructor(cb) {
    this.cb = cb;
    this.hangarEl = $('hangar');
    this.statsEl = $('design-stats');
    this.logEl = $('hud-log');
    this.labelsEl = $('map-labels');
    this.labelEls = new Map();

    $('btn-help').onclick = () => this.showHelp(true);
    $('btn-help-close').onclick = () => this.showHelp(false);
    $('help').addEventListener('click', (e) => { if (e.target.id === 'help') this.showHelp(false); });
    $('btn-view-chase').onclick = () => cb.onView('chase');
    $('btn-view-map').onclick = () => cb.onView('map');
    $('btn-stage').onclick = () => cb.onStage();
    $('btn-abort').onclick = () => cb.onHangar();
    $('btn-result-hangar').onclick = () => cb.onHangar();
    $('btn-result-retry').onclick = () => cb.onRetry();
    $('btn-result-watch').onclick = () => this.hideResult();

    this.countdownEl = document.createElement('div');
    this.countdownEl.id = 'countdown';
    this.countdownEl.hidden = true;
    document.body.appendChild(this.countdownEl);

    const warp = $('warp-buttons');
    warp.innerHTML = WARP_LEVELS.map((w) => `<button data-w="${w}">${w}×</button>`).join('');
    warp.querySelectorAll('button').forEach((b) => { b.onclick = () => cb.onWarp(Number(b.dataset.w)); });
  }

  setMode(mode) {
    document.body.classList.toggle('mode-build', mode === 'build');
    document.body.classList.toggle('mode-flight', mode === 'flight');
    $('mode-label').textContent = mode === 'build' ? 'Hangar: design your rocket' : 'Flight';
    if (mode === 'build') this.clearMapLabels();
  }

  showHelp(show) {
    $('help').hidden = !show;
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'log-item';
    t.textContent = text;
    Object.assign(t.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 60 });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------------- hangar ----------------
  optButton(group, key, item, selected, icon, stage) {
    return `<button class="opt ${selected ? 'selected' : ''}" data-group="${group}" data-key="${key}"${stage !== undefined ? ` data-stage="${stage}"` : ''} title="${item.desc}">
      ${icon}<span>${item.name}</span></button>`;
  }

  optionSection(title, group, catalog, selectedKey, icons) {
    const buttons = Object.entries(catalog)
      .map(([k, item]) => this.optButton(group, k, item, k === selectedKey, icons[k]))
      .join('');
    const cols = Object.keys(catalog).length === 5 ? 'five' : '';
    return `<section class="section" data-tour="${group}">
      <div class="section-title"><span>${title}</span></div>
      <div class="opt-grid ${cols}">${buttons}</div>
      <p class="opt-desc">${catalog[selectedKey].desc}</p>
    </section>`;
  }

  renderHangar(design) {
    const d = design;
    const presetOptions = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
    let h = `<div class="panel-head"><h2>Hangar</h2>
      <select id="preset-select" aria-label="Load preset"><option value="">Load a preset…</option>${presetOptions}</select></div>`;
    h += this.optionSection('Nose cone', 'nose', NOSES, d.nose, ICONS.nose);
    h += this.optionSection('Body shape', 'body', BODIES, d.body, ICONS.body);
    h += this.optionSection('Fins', 'fins', FINS, d.fins, ICONS.fins);

    h += `<section class="section" data-tour="stages-section"><div class="section-title" data-tour="stages"><span>Stages</span>
      <div class="seg small" id="stage-count">${[1, 2, 3].map((n) => `<button data-n="${n}" class="${d.stages.length === n ? 'active' : ''}">${n}</button>`).join('')}</div></div>`;
    d.stages.forEach((s, i) => {
      const role = i === 0 ? 'booster · lights on the pad' : i === d.stages.length - 1 ? 'upper stage' : 'middle stage';
      const e = ENGINES[s.engine];
      h += `<div class="stage-card">
        <div class="stage-title"><b>Stage ${i + 1}</b><span>${role}</span></div>
        <div class="opt-grid five" data-tour="engine-${i}">${Object.entries(ENGINES).map(([k, item]) => this.optButton('engine', k, item, s.engine === k, ICONS.engine[k], i)).join('')}</div>
        <p class="opt-desc">${e.desc}<span class="spec">${Math.round(e.thrustVac / 1000)} kN · Isp ${e.ispSL}/${e.ispVac} s · ${fmt.mass(e.mass)} · gimbal ${e.gimbal}°</span></p>
        <div class="slider-row" data-tour="tank-${i}"><span class="label">Fuel tank</span>
          <input type="range" min="${TANK_LIMITS.min}" max="${TANK_LIMITS.max}" step="${TANK_LIMITS.step}" value="${s.tank}" data-stage="${i}" aria-label="Stage ${i + 1} tank length">
          <span class="tank-val" id="tank-val-${i}">${s.tank.toFixed(1)} m</span></div>
      </div>`;
    });
    h += '</section>';
    h += this.optionSection('Flight plan', 'guidance', GUIDANCE, d.guidance, ICONS.guidance);
    this.hangarEl.innerHTML = h;

    const change = (mutate, rerender = true) => {
      const next = JSON.parse(JSON.stringify(d));
      mutate(next);
      this.cb.onDesignChange(next, { rerenderHangar: rerender });
    };

    this.hangarEl.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { group, key, stage } = btn.dataset;
        change((n) => {
          if (group === 'engine') n.stages[Number(stage)].engine = key;
          else n[group] = key;
        });
      });
    });
    this.hangarEl.querySelectorAll('#stage-count button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = Number(btn.dataset.n);
        change((n) => {
          while (n.stages.length < count) n.stages.push({ engine: 'vacuum', tank: 4 });
          n.stages.length = count;
        });
      });
    });
    this.hangarEl.querySelectorAll('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.stage);
        d.stages[i].tank = Number(input.value);
        change(() => {}, false);
      });
    });
    $('preset-select').addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (p) this.cb.onDesignChange(JSON.parse(JSON.stringify(p.design)), { rerenderHangar: true });
    });
  }

  updateTankLabels(layout) {
    layout.stages.forEach((s, i) => {
      const el = $(`tank-val-${i}`);
      if (!el) return;
      const size = s.spheres ? `${s.spheres}× sphere` : `${s.tankLen.toFixed(1)} m`;
      el.textContent = `${size} · ${fmt.mass(s.propMass)}`;
    });
  }

  renderStats(stats, checks, layout) {
    const twr = stats.liftoffTWR;
    const twrCls = twr < 1 ? 'bad-t' : twr < 1.25 || twr > 3 ? 'warn-t' : 'good-t';
    const m = Math.min(stats.marginLaunch, stats.marginBurnout);
    const mCls = m < 0 ? (stats.control < 1.3 ? 'bad-t' : 'warn-t') : m < 0.5 || m > 5 ? 'warn-t' : 'good-t';
    const dvScale = 7000;
    const dvPct = clamp(stats.totalDv / dvScale, 0, 1) * 100;
    const needPct = (DV_TO_ORBIT / dvScale) * 100;
    const dvColor = stats.totalDv < 2800 ? 'var(--bad)' : stats.totalDv < 3700 ? 'var(--warn)' : 'var(--good)';

    const st0 = layout.stacks[0];
    const full = layout.stages.map((s) => s.propMass);
    const { ycm } = massProps(st0, full);
    const H = layout.height;
    const cmPct = clamp((ycm / H) * 100, 3, 97);
    const cpPct = clamp((st0.ycp / H) * 100, 3, 97);

    const rows = stats.perStage.map((s) => `<tr>
      <td>S${s.k + 1}</td><td>${Math.round(s.dv).toLocaleString('en-US')}</td>
      <td class="${s.twr < (s.k === 0 ? 1 : 0.3) ? 'bad-t' : ''}">${s.twr.toFixed(2)}</td><td>${fmt.time(s.burnTime)}</td></tr>`).join('');

    this.statsEl.innerHTML = `
      <div class="panel-head"><h2>Analysis</h2></div>
      <div data-tour="analysis">
      <div class="stat-grid">
        <div class="stat"><span class="label">Launch mass</span><span class="v">${fmt.mass(stats.totalMass)}</span></div>
        <div class="stat"><span class="label">Height</span><span class="v">${stats.height.toFixed(1)} m</span></div>
        <div class="stat"><span class="label">Liftoff TWR</span><span class="v ${twrCls}">${twr.toFixed(2)}</span></div>
        <div class="stat"><span class="label">Drag coeff.</span><span class="v ${stats.cd > 0.6 ? 'warn-t' : ''}">${stats.cd.toFixed(2)}</span></div>
      </div>
      <div class="dv-meter">
        <div class="meter-head"><span class="label">Total Δv</span><span>${Math.round(stats.totalDv).toLocaleString('en-US')} m/s</span></div>
        <div class="bar"><div class="fill" style="width:${dvPct}%;background:${dvColor}"></div><div class="marker" style="left:${needPct}%" data-label="orbit ≈ ${DV_TO_ORBIT.toLocaleString('en-US')}"></div></div>
      </div>
      </div>
      <table class="stage-table">
        <thead><tr><th>Stage</th><th>Δv m/s</th><th>TWR</th><th>Burn</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="stab">
        <div class="meter-head"><span class="label">Stability margin</span><span class="${mCls}">${m.toFixed(2)} cal</span></div>
        <div class="stab-track">
          <div class="stab-body"></div>
          <div class="stab-mk cm" style="left:${cmPct}%">CM<i></i></div>
          <div class="stab-mk cp" style="left:${cpPct}%">CP<i></i></div>
        </div>
        <div class="stab-legend"><span>engine</span><span>${m >= 0 ? 'CP behind CM: stable' : 'CP ahead of CM: unstable'}</span><span>nose</span></div>
      </div>
      <ul class="checks">${checks.map((c) => `<li class="${c.level}">${c.text}</li>`).join('')}</ul>
      <div class="launch-wrap" data-tour="launch">
        <button class="launch" id="btn-launch">LAUNCH</button>
        <button class="ghost small" id="btn-share">Copy link to this design</button>
      </div>`;
    $('btn-launch').onclick = () => this.cb.onLaunch();
    $('btn-share').onclick = () => this.cb.onShare();
  }

  // ---------------- flight HUD ----------------
  initHud(sim, layout) {
    this.layout = layout;
    $('hud-stages').innerHTML = layout.stages.map((s, i) => `
      <div class="stage-bar" id="sb-${i}">
        <div class="meter-head"><span>S${i + 1} · ${s.engine.name}</span><span id="sbv-${i}">100%</span></div>
        <div class="bar"><div class="fill fuel" id="sbf-${i}" style="width:100%"></div></div>
      </div>`).join('');
    this.logEl.innerHTML = '';
    $('manual-hint').hidden = sim.guidance.kind !== 'manual';
    this.setView('chase');
    this.lastPhase = '';
  }

  countdown(n) {
    if (n === null) {
      this.countdownEl.hidden = true;
      return;
    }
    this.countdownEl.hidden = false;
    this.countdownEl.innerHTML = `<span>${n}</span>`;
  }

  setView(v) {
    $('btn-view-chase').classList.toggle('active', v === 'chase');
    $('btn-view-map').classList.toggle('active', v === 'map');
    if (v !== 'map') this.clearMapLabels();
  }

  updateWarp(warp, max) {
    $('warp-buttons').querySelectorAll('button').forEach((b) => {
      const w = Number(b.dataset.w);
      b.classList.toggle('active', w === warp);
      b.disabled = w > max;
    });
  }

  phaseText(sim, countdown) {
    if (countdown > 0) return 'Countdown';
    if (sim.outcome && sim.outcome.final) return sim.outcome.title;
    if (!sim.liftedOff) return 'Ignition';
    if (sim.announced.orbit) return sim.outcome && sim.outcome.type === 'escape' ? 'Escape trajectory' : 'In orbit';
    if (sim.announced.suborbital) return 'Out of fuel · falling';
    if (sim.t < sim.ignitionT) return 'Stage separation';
    const kind = sim.guidance.kind;
    if (kind === 'straight') return 'Vertical ascent';
    if (kind === 'manual') return 'Manual control';
    return { ascent: 'Gravity turn', coast: 'Coasting to apoapsis', circularize: 'Circularization burn', orbit: 'Engine cutoff' }[sim.phase] || '';
  }

  updateHud(sim, countdown) {
    const t = sim.tel;
    const L = this.layout;
    $('hud-clock').textContent = countdown > 0 ? `T− ${Math.ceil(countdown)}` : `T+ ${fmt.time(sim.t)}`;
    $('hud-phase').textContent = this.phaseText(sim, countdown);
    $('hud-alt').textContent = fmt.dist(Math.max(t.alt, 0));
    $('hud-speed').textContent = fmt.speed(t.speed);
    $('hud-vr').textContent = `${t.vr >= 0 ? '↑' : '↓'} ${fmt.speed(Math.abs(t.vr))}`;
    $('hud-vh').textContent = fmt.speed(t.vh);
    $('hud-mach').textContent = t.alt < PLANET.atmosphereHeight ? t.mach.toFixed(2) : '–';
    $('hud-g').textContent = `${t.g.toFixed(1)} g`;
    $('hud-aoa').textContent = t.speed > 5 && t.alt < PLANET.atmosphereHeight ? `${Math.abs(t.aoa).toFixed(1)}°` : '–';

    const strength = L.stacks[sim.stage].strength;
    const qFrac = clamp(t.q / 1000 / strength, 0, 1);
    $('hud-q').textContent = `${(t.q / 1000).toFixed(1)} / ${Math.round(strength)} kPa`;
    const qBar = $('hud-q-bar');
    qBar.style.width = `${qFrac * 100}%`;
    qBar.style.background = qFrac > 0.8 ? 'var(--bad)' : qFrac > 0.55 ? 'var(--warn)' : 'var(--good)';
    $('hud-q-limit').style.left = 'calc(100% - 2px)';

    const vcirc = Math.sqrt(PLANET.mu / (PLANET.radius + Math.max(t.alt, 0)));
    const orbFrac = t.vh / vcirc;
    $('hud-orbv').textContent = `${Math.round(orbFrac * 100)}%`;
    $('hud-orbv-bar').style.width = `${clamp(orbFrac, 0, 1) * 100}%`;

    const flying = sim.liftedOff;
    $('hud-apo').textContent = !flying ? '–' : t.e >= 1 ? 'escape' : fmt.dist(t.apo);
    const peri = $('hud-peri');
    peri.textContent = !flying || t.peri < -PLANET.radius * 0.9 ? '–' : fmt.dist(t.peri);
    peri.className = flying && t.peri > PLANET.atmosphereHeight ? 'good-t' : '';
    $('hud-tapo').textContent = flying && t.vr > 0 && t.e < 1 ? fmt.time(t.tApo) : '–';
    const margin = $('hud-margin');
    const inAir = t.alt < PLANET.atmosphereHeight;
    margin.textContent = inAir ? `${t.margin.toFixed(2)} cal` : '–';
    margin.className = inAir ? (t.margin < 0 ? 'bad-t' : 'good-t') : '';

    const thr = sim.thrust > 0 ? sim.throttle : 0;
    $('hud-throttle').textContent = `${Math.round(thr * 100)}%`;
    $('hud-throttle-bar').style.width = `${thr * 100}%`;

    L.stages.forEach((s, i) => {
      const frac = s.propMass > 0 ? sim.prop[i] / s.propMass : 0;
      const spent = i < sim.stage;
      $(`sbf-${i}`).style.width = `${(spent ? 0 : frac) * 100}%`;
      $(`sbv-${i}`).textContent = spent ? 'dropped' : `${Math.round(frac * 100)}%`;
      const bar = $(`sb-${i}`);
      bar.classList.toggle('spent', spent);
      bar.classList.toggle('active', i === sim.stage);
    });
    $('btn-stage').disabled = !sim.canStage() || !sim.liftedOff || sim.finished;
  }

  log(e, level = '') {
    const cls = level || (e.type === 'warn' ? 'warn' : '');
    const div = document.createElement('div');
    div.className = `log-item ${cls}`;
    div.innerHTML = `<time>T+${fmt.time(e.t)}</time>`;
    div.appendChild(document.createTextNode(e.msg));
    this.logEl.prepend(div);
    while (this.logEl.children.length > 7) this.logEl.lastChild.remove();
  }

  setMapLabels(items) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.key);
      let el = this.labelEls.get(it.key);
      if (!el) {
        el = document.createElement('div');
        el.className = `map-label ${it.cls || ''}`;
        this.labelsEl.appendChild(el);
        this.labelEls.set(it.key, el);
      }
      el.textContent = it.text;
      el.style.left = `${it.x}px`;
      el.style.top = `${it.y}px`;
    }
    for (const [k, el] of this.labelEls) {
      if (!seen.has(k)) {
        el.remove();
        this.labelEls.delete(k);
      }
    }
  }

  clearMapLabels() {
    this.setMapLabels([]);
  }

  // ---------------- results ----------------
  showResult(outcome, sim, stats, design) {
    const card = document.querySelector('.result-card');
    card.classList.remove('success', 'fail', 'partial');
    card.classList.add(outcome.success ? 'success' : outcome.partial ? 'partial' : 'fail');
    $('result-badge').textContent = OUTCOME_ICONS[outcome.type] || '🚀';
    $('result-title').textContent = outcome.title;
    $('result-detail').textContent = outcome.detail;

    const rec = outcome.record;
    const cells = [
      ['Flight time', fmt.time(outcome.t)],
      ['Max altitude', fmt.dist(rec.maxAlt)],
      ['Max speed', fmt.speed(rec.maxSpeed)],
      ['Max Q', `${(rec.maxQ / 1000).toFixed(1)} kPa`],
      ['Max G', `${rec.maxG.toFixed(1)} g`],
      ['Drag loss', fmt.speed(rec.dragLoss)],
    ];
    if (outcome.type === 'orbit') {
      cells.push(['Apoapsis', fmt.dist(sim.tel.apo)], ['Periapsis', fmt.dist(sim.tel.peri)]);
    }
    cells.push(['Fuel left', fmt.mass(sim.totalProp())]);
    $('result-grid').innerHTML = cells.map(([k, v]) => `<div class="stat"><span class="label">${k}</span><span class="v">${v}</span></div>`).join('');
    $('result-tips').innerHTML = analyze(outcome, sim, stats, design).map((t) => `<li>${t}</li>`).join('');
    $('btn-result-watch').textContent = outcome.final ? 'View wreckage' : 'Keep watching';
    $('result').hidden = false;
  }

  hideResult() {
    $('result').hidden = true;
  }
}

function analyze(outcome, sim, stats, design) {
  const tips = [];
  const rec = outcome.record;
  const g = design.guidance;
  const e0 = ENGINES[design.stages[0].engine];
  const minMargin = Math.min(stats.marginLaunch, stats.marginBurnout);
  const dv = Math.round(stats.totalDv).toLocaleString('en-US');

  switch (outcome.type) {
    case 'pad':
      tips.push(`Liftoff thrust-to-weight was <b>${stats.liftoffTWR.toFixed(2)}</b>. It must be above 1.0, and 1.3–2.0 works best.`);
      if (design.stages[0].engine === 'vacuum') {
        tips.push('The Vacuum Bell only manages 120 s of Isp at sea level, where air pressure chokes its huge nozzle. Put it on an upper stage and use a Bell Nozzle or Triple Cluster on the booster.');
      } else {
        tips.push('Shorten the tanks, drop a stage, or give the booster a stronger engine such as the Triple Cluster.');
      }
      break;
    case 'aero':
      if (minMargin < 0) tips.push(`The rocket was <b>aerodynamically unstable</b>: its centre of pressure sat ahead of its centre of mass (${minMargin.toFixed(1)} calibers), so the airflow kept shoving the nose sideways. Fins or a tapered body fix that.`);
      if (e0.gimbal < 2) tips.push(`The ${e0.name} can only steer ${e0.gimbal}°, far too little to fight the air. A Bell Nozzle gimbals 5°.`);
      if (g === 'aggressive') tips.push('The Aggressive Turn tilted the nose away from the airflow while the air was still thick. The Gravity Turn keeps the angle of attack small.');
      if (stats.liftoffTWR > 2.5) tips.push(`A liftoff TWR of ${stats.liftoffTWR.toFixed(2)} meant it was already fast in dense air, so any sideways tilt created huge loads.`);
      if (design.body === 'box' || design.body === 'spheres') tips.push(`The ${BODIES[design.body].name} body is weak and breaks under smaller side loads than a Cylinder.`);
      if (stats.lOverD > 16) tips.push(`It is very long and thin (${stats.lOverD.toFixed(0)}:1), so side loads bend it hard.`);
      break;
    case 'maxq':
      if (stats.liftoffTWR > 2.4) tips.push(`A liftoff TWR of <b>${stats.liftoffTWR.toFixed(2)}</b> built too much speed in the thick lower atmosphere. Bigger tanks or a smaller engine would climb out of the dense air before speeding up.`);
      if (design.body === 'box' || design.body === 'spheres') tips.push(`The ${BODIES[design.body].name} body only tolerates about ${Math.round(stats.maxQ)} kPa. A Cylinder handles 55 kPa.`);
      if (g === 'aggressive') tips.push('The Aggressive Turn flattened out early, so the rocket raced sideways through dense air instead of climbing first.');
      break;
    case 'g':
      tips.push('A nearly empty stage with a powerful engine accelerates harder and harder as fuel drains. Use a gentler engine up top, like the Vacuum Bell.');
      break;
    case 'crash':
    case 'reentry':
      if (g === 'straight') tips.push('Going straight up builds no sideways speed. Orbit means moving sideways fast enough (about 2,300 m/s here) that you keep falling around the planet instead of into it.');
      if (stats.totalDv < DV_TO_ORBIT) tips.push(`The design had only <b>${dv} m/s</b> of Δv. Orbit needs about ${DV_TO_ORBIT.toLocaleString('en-US')} m/s plus losses. Add fuel or another stage.`);
      if (rec.dragLoss > 350) tips.push(`Drag cost about <b>${fmt.speed(rec.dragLoss)}</b>. A pointed nose, a cylinder body and smaller fins cut drag.`);
      if (stats.liftoffTWR < 1.3) tips.push(`A low liftoff TWR (${stats.liftoffTWR.toFixed(2)}) wastes fuel just hovering against gravity.`);
      if (rec.maxAlt < PLANET.atmosphereHeight) tips.push(`It peaked at ${fmt.dist(rec.maxAlt)}, still inside the 70 km atmosphere.`);
      else tips.push(`It reached space (${fmt.dist(rec.maxAlt)}) but never built orbital speed.`);
      if (g === 'manual') tips.push('Manual flying tip: start pitching over around 1 km, cut the engine when apoapsis passes 75 km, then burn sideways at apoapsis.');
      break;
    case 'orbit':
      tips.push(`Orbit achieved with <b>${fmt.mass(sim.totalProp())}</b> of propellant to spare.`);
      if (stats.totalDv > 4800) tips.push('There is a lot of margin. Try trimming the tanks for a lighter rocket.');
      tips.push('Open the Map view (M) to see your orbit, crank up time warp, or try a single-stage-to-orbit design.');
      break;
    case 'escape':
      tips.push('The rocket passed escape velocity (about 3,400 m/s at the surface) and will never come back. Fine for a deep-space probe, but it is not an orbit.');
      if (g === 'straight') tips.push('With a Gravity Turn, this much Δv would make orbit easily.');
      break;
  }
  if (!tips.length) tips.push('Check the analysis panel: thrust-to-weight, Δv and stability all matter.');
  return tips;
}
