// Entry point: scene, game state, and the main loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANET, ROCKET, NOSES, BODIES, FINS, ENGINES, GUIDANCE } from './config.js';
import { PRESETS, TANK_LIMITS, computeLayout, computeStats, designChecks, cloneDesign } from './design.js';
import { FlightSim, orbitalElements, airDensity } from './physics.js';
import { buildRocketMesh, disposeRocket } from './rocketMesh.js';
import { createWorld } from './world.js';
import { Effects } from './effects.js';
import { UI, WARP_LEVELS, fmt } from './ui.js';
import { Academy } from './academy.js';
import { Guide, FlightFacts } from './tutorial.js';

const R = PLANET.radius;
const STORAGE_KEY = 'orbitforge.design';
// requestAnimationFrame, with a timer fallback for visible pages where rAF is paused (some embedded webviews)
function scheduleFrame(cb) {
  let done = false;
  const run = (t) => {
    if (done) return;
    done = true;
    cb(t);
  };
  requestAnimationFrame(run);
  setTimeout(() => {
    if (!done && document.visibilityState === 'visible') run(performance.now());
  }, 100);
}
const nextFrame = () => new Promise((res) => scheduleFrame(() => setTimeout(res, 0)));

function fatal(html) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.innerHTML = html;
  document.body.appendChild(d);
  document.getElementById('loading')?.remove();
}

// ---------- design persistence ----------
function isValidDesign(d) {
  return d && NOSES[d.nose] && BODIES[d.body] && FINS[d.fins] && GUIDANCE[d.guidance]
    && Array.isArray(d.stages) && d.stages.length >= 1 && d.stages.length <= 3
    && d.stages.every((s) => ENGINES[s.engine] && Number.isFinite(s.tank) && s.tank >= TANK_LIMITS.min && s.tank <= TANK_LIMITS.max);
}

function loadInitialDesign() {
  try {
    const m = location.hash.match(/^#d=(.+)$/);
    if (m) {
      const d = JSON.parse(atob(decodeURIComponent(m[1])));
      if (isValidDesign(d)) return d;
    }
  } catch { /* ignore bad links */ }
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidDesign(d)) return d;
  } catch { /* storage unavailable */ }
  return cloneDesign(PRESETS.pathfinder.design);
}

function saveDesign(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}

async function main() {
  const loadingText = document.getElementById('loading-text');
  const canvas = document.getElementById('scene');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  } catch (err) {
    fatal('<div><h2>WebGL is not available</h2><p>Orbit Forge needs a browser with WebGL enabled.</p></div>');
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 5e8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;

  loadingText.textContent = 'Generating planet…';
  await nextFrame();
  const W = createWorld(scene);
  const world = W.world;
  const effects = new Effects(scene, world);

  const rocketRoot = new THREE.Group();
  const stackHolder = new THREE.Group();
  rocketRoot.add(stackHolder);
  scene.add(rocketRoot);
  const engineLight = new THREE.PointLight(0xff9a40, 0, 0, 2);
  engineLight.position.y = -4;
  rocketRoot.add(engineLight);

  // ---------- trajectory lines ----------
  const TRAIL_MAX = 6000;
  const trailPos = new Float32Array(TRAIL_MAX * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  trail.frustumCulled = false;
  world.add(trail);
  let trailCount = 0;

  const ORBIT_N = 400;
  const orbitPos = new Float32Array(ORBIT_N * 3);
  const orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3));
  const orbitLine = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  orbitLine.frustumCulled = false;
  orbitLine.visible = false;
  world.add(orbitLine);

  const markerTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, sizeAttenuation: false, depthTest: false, fog: false }));
  marker.scale.setScalar(0.028);
  marker.renderOrder = 999;
  marker.visible = false;
  world.add(marker);

  // ---------- state ----------
  const state = {
    design: loadInitialDesign(),
    layout: null,
    stats: null,
    rocket: null,
    mode: 'build',
    sim: null,
    warp: 1,
    view: 'chase',
    countdown: 0,
    frozen: false,
    eventCursor: 0,
    drops: new Map(),
    chaseOffset: new THREE.Vector3(30, 8, 45),
    hudTimer: 0,
    orbitTimer: 0,
    keys: {},
    lastTrail: new THREE.Vector2(),
    resultTimer: null,
  };

  const ui = new UI({
    onDesignChange(d, { rerenderHangar }) {
      state.design = d;
      if (rerenderHangar) ui.renderHangar(d);
      rebuildRocket();
      guide.onDesignChange();
    },
    onLaunch: launch,
    onRetry: launch,
    onHangar: goHangar,
    onWarp: setWarp,
    onView: setView,
    onStage: stageNow,
    onShare() {
      const url = `${location.href.split('#')[0]}#d=${encodeURIComponent(btoa(JSON.stringify(state.design)))}`;
      history.replaceState(null, '', url);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => ui.toast('Link copied to clipboard'), () => ui.toast('Link is in the address bar'));
      } else {
        ui.toast('Link is in the address bar');
      }
    },
  });

  // ---------- learning layer ----------
  const facts = new FlightFacts();
  const guide = new Guide({
    getDesign: () => state.design,
    getStats: () => state.stats,
    setDesign(d) {
      state.design = d;
      ui.renderHangar(d);
      rebuildRocket();
    },
  });
  const academy = new Academy({
    onGuide() {
      if (state.mode === 'flight') goHangar();
      ui.showHelp(false);
      guide.start();
    },
  });
  const tipsBtn = document.getElementById('btn-tips');
  const syncTips = () => { tipsBtn.innerHTML = `🔬 <span class="lbl">Tips ${facts.enabled ? 'on' : 'off'}</span>`; };
  syncTips();
  tipsBtn.onclick = () => { facts.setEnabled(!facts.enabled); syncTips(); };
  document.getElementById('btn-learn').onclick = () => academy.open(state.mode === 'flight' ? 1 : 0);
  document.getElementById('btn-guide').onclick = () => { ui.showHelp(false); guide.start(); };

  function rebuildRocket() {
    state.layout = computeLayout(state.design);
    state.stats = computeStats(state.layout);
    if (state.rocket) {
      stackHolder.remove(state.rocket.root);
      disposeRocket(state.rocket);
    }
    state.rocket = buildRocketMesh(state.layout);
    stackHolder.add(state.rocket.root);
    W.launch.setRocketHeight(state.layout.height);
    ui.renderStats(state.stats, designChecks(state.stats, state.design), state.layout);
    ui.updateTankLabels(state.layout);
    saveDesign(state.design);
  }

  function resetBuildCamera() {
    const h = state.layout.height;
    controls.target.set(0, h * 0.5, 0);
    camera.position.set(h * 0.8 + 14, h * 0.45 + 4, h * 1.2 + 22);
    controls.minDistance = 6;
    controls.maxDistance = 3000;
    controls.maxPolarAngle = Math.PI * 0.495;
  }

  function clearDrops() {
    for (const c of state.drops.values()) {
      world.remove(c);
      c.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    state.drops.clear();
  }

  function resetLines() {
    trailCount = 0;
    trailGeo.setDrawRange(0, 0);
    orbitLine.visible = false;
    marker.visible = false;
    ui.clearMapLabels();
  }

  function launch() {
    clearTimeout(state.resultTimer);
    ui.hideResult();
    effects.clear();
    clearDrops();
    resetLines();
    rebuildRocket();
    state.rocket.root.visible = true;
    state.sim = new FlightSim(state.layout, state.design.guidance);
    state.mode = 'flight';
    state.frozen = false;
    state.eventCursor = 0;
    state.warp = 1;
    state.countdown = 3;
    if (state.view !== 'chase') setView('chase');
    controls.maxPolarAngle = Math.PI;
    controls.maxDistance = 60_000;
    ui.setMode('flight');
    ui.initHud(state.sim, state.layout);
    ui.countdown(3);
    ui.updateWarp(state.warp, 1);
    guide.onLaunch();
    facts.reset();
    facts.show('countdown');
  }

  function goHangar() {
    clearTimeout(state.resultTimer);
    facts.hide();
    ui.hideResult();
    ui.countdown(null);
    effects.clear();
    clearDrops();
    resetLines();
    state.sim = null;
    state.mode = 'build';
    state.frozen = false;
    state.warp = 1;
    state.countdown = 0;
    if (state.view !== 'chase') {
      state.view = 'chase';
      ui.setView('chase');
    }
    rebuildRocket();
    state.rocket.root.visible = true;
    updateScene(0);
    resetBuildCamera();
    ui.setMode('build');
  }

  function stageNow() {
    const sim = state.sim;
    if (sim && sim.liftedOff && sim.canStage() && !sim.finished) sim.stageRequest = true;
  }

  function maxWarp() {
    const sim = state.sim;
    if (!sim || sim.finished || state.countdown > 0 || !sim.liftedOff) return 1;
    if (sim.tel.alt < PLANET.atmosphereHeight || sim.thrust > 0) return 10;
    if (sim.phase === 'coast' && sim.guidance.kind === 'program' && sim.tel.tApo < 60) return 10;
    return WARP_LEVELS[WARP_LEVELS.length - 1];
  }

  function setWarp(level) {
    const max = maxWarp();
    state.warp = WARP_LEVELS.filter((w) => w <= Math.min(level, max)).pop() || 1;
    ui.updateWarp(state.warp, max);
  }

  function stepWarp(dir) {
    const i = WARP_LEVELS.indexOf(state.warp);
    setWarp(WARP_LEVELS[Math.max(0, Math.min(WARP_LEVELS.length - 1, i + dir))]);
  }

  function rocketCenter(target) {
    const L = state.layout;
    const stage = state.sim ? state.sim.stage : 0;
    target.set(0, (L.height - L.stacks[stage].yBottom) * 0.45, 0);
    rocketRoot.updateMatrixWorld(true);
    return rocketRoot.localToWorld(target);
  }

  function setView(v) {
    if (state.view === v) return;
    if (v === 'map') {
      state.chaseOffset.copy(camera.position).sub(controls.target);
      state.view = 'map';
      updateScene(0);
      controls.target.set(0, 0, 0);
      camera.position.set(0, -R * 2.5, R * 2.6);
      controls.minDistance = R * 1.3;
      controls.maxDistance = R * 60;
    } else {
      state.view = 'chase';
      updateScene(0);
      const c = rocketCenter(new THREE.Vector3());
      controls.target.copy(c);
      camera.position.copy(c).add(state.chaseOffset);
      controls.minDistance = 6;
      controls.maxDistance = 60_000;
      ui.clearMapLabels();
    }
    ui.setView(v);
  }

  // ---------- events from the simulation ----------
  function detachStage(drop) {
    const g = state.rocket.stageGroups[drop.stage];
    const container = new THREE.Group();
    container.add(g);
    g.position.y = -state.layout.stacks[drop.stage].yBottom;
    state.rocket.flames[drop.stage].group.visible = false;
    state.rocket.nozzleMats[drop.stage].emissiveIntensity = 0;
    container.position.set(drop.x, drop.y, 0);
    container.rotation.set(0, 0, drop.theta - Math.PI / 2);
    world.add(container);
    state.drops.set(drop, container);

    const sim = state.sim;
    const pos = new THREE.Vector3(sim.x, sim.y, 0);
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
      effects.addParticle(world, pos, v, { life: 1.5 + Math.random(), size0: 1, size1: 7, opacity: 0.6, drag: 1.5, color: 0xffffff });
    }
  }

  function removeDrop(drop) {
    const c = state.drops.get(drop);
    if (!c) return;
    const sim = state.sim;
    if (sim && Math.hypot(sim.x - drop.x, sim.y - drop.y) < 12_000 && state.view === 'chase') {
      effects.explode(world, new THREE.Vector3(drop.x, drop.y, 0), 1.4);
    }
    world.remove(c);
    state.drops.delete(drop);
  }

  function onOutcome(o) {
    const sim = state.sim;
    ui.log({ t: o.t, msg: o.title }, o.success ? 'good' : o.partial ? 'warn' : 'bad');
    if (o.final) {
      setWarp(1);
      if (o.type !== 'pad') {
        if (state.view === 'map') setView('chase');
        updateScene(0);
        const alt = sim.tel.alt;
        const phi = Math.atan2(sim.y, sim.x);
        const rot = Math.PI / 2 - phi;
        const vView = new THREE.Vector3(
          sim.vx * Math.cos(rot) - sim.vy * Math.sin(rot),
          sim.vx * Math.sin(rot) + sim.vy * Math.cos(rot),
          0,
        ).clampLength(0, 400).multiplyScalar(0.08);
        const center = effects.shatter(state.rocket.root, { groundY: -Math.max(alt, 0) - 0.5, inheritVel: vView });
        effects.explode(scene, center, 1.1);
        state.rocket.root.visible = false;
        state.frozen = true;
      }
      state.resultTimer = setTimeout(() => ui.showResult(o, sim, state.stats, state.design), o.type === 'pad' ? 900 : 2800);
    } else {
      setWarp(1);
      state.resultTimer = setTimeout(() => ui.showResult(o, sim, state.stats, state.design), 1500);
    }
  }

  function processEvents() {
    const sim = state.sim;
    while (state.eventCursor < sim.events.length) {
      const e = sim.events[state.eventCursor++];
      facts.onEvent(e);
      switch (e.type) {
        case 'stage':
          detachStage(e.drop);
          ui.log(e);
          break;
        case 'debris':
          removeDrop(e.drop);
          break;
        case 'outcome':
          onOutcome(e.outcome);
          break;
        case 'circ':
          if (state.warp > 5) setWarp(5);
          ui.log(e);
          break;
        default:
          ui.log(e);
      }
    }
  }

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (academy.isOpen) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    state.keys[k] = true;
    if (k === 'escape' && !document.getElementById('help').hidden) {
      ui.showHelp(false);
      return;
    }
    if (state.mode !== 'flight') return;
    const sim = state.sim;
    if (k === 'm') setView(state.view === 'map' ? 'chase' : 'map');
    else if (k === 'c') setView('chase');
    else if (k === '.' || k === '>') stepWarp(1);
    else if (k === ',' || k === '<') stepWarp(-1);
    else if (k === ' ') { e.preventDefault(); stageNow(); }
    else if (k === 'escape') goHangar();
    else if (sim && sim.guidance.kind === 'manual') {
      if (k === 'z') sim.manualThrottle = 1;
      if (k === 'x') sim.manualThrottle = 0;
    }
  });
  window.addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { state.keys = {}; });

  function handleManualInput(dt) {
    const sim = state.sim;
    if (!sim || sim.guidance.kind !== 'manual') return;
    const k = state.keys;
    sim.manualPitchInput = ((k.a || k.arrowleft) ? 1 : 0) - ((k.d || k.arrowright) ? 1 : 0);
    const thr = ((k.w || k.arrowup || k.shift) ? 1 : 0) - ((k.s || k.arrowdown || k.control) ? 1 : 0);
    sim.manualThrottle = Math.max(0, Math.min(1, sim.manualThrottle + thr * dt * 0.8));
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- per-frame scene sync ----------
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  function updateOrbitLine(sim) {
    const o = orbitalElements(sim.x, sim.y, sim.vx, sim.vy);
    if (!sim.liftedOff || o.p < 20_000 || sim.tel.alt < 300) {
      orbitLine.visible = false;
      return o;
    }
    const e = o.e;
    const sign = o.h >= 0 ? 1 : -1;
    let nu0 = 0;
    let argP = Math.atan2(sim.y, sim.x);
    if (e > 1e-5) {
      argP = o.argPeri;
      nu0 = Math.acos(Math.max(-1, Math.min(1, (o.ex * sim.x + o.ey * sim.y) / (e * o.r))));
      if (sim.x * sim.vx + sim.y * sim.vy < 0) nu0 = -nu0;
    }
    const nuEnd = e < 1 ? nu0 + Math.PI * 2 : Math.acos(-1 / e) - 0.02;
    let n = 0;
    for (let i = 0; i < ORBIT_N; i++) {
      const nu = nu0 + ((nuEnd - nu0) * i) / (ORBIT_N - 1);
      const r = o.p / (1 + e * Math.cos(nu));
      if (r <= 0 || r > R * 40) break;
      if (r < R && i > 0) {
        const ang = argP + sign * nu;
        orbitPos[n * 3] = R * Math.cos(ang);
        orbitPos[n * 3 + 1] = R * Math.sin(ang);
        orbitPos[n * 3 + 2] = 0;
        n++;
        break;
      }
      const ang = argP + sign * nu;
      orbitPos[n * 3] = r * Math.cos(ang);
      orbitPos[n * 3 + 1] = r * Math.sin(ang);
      orbitPos[n * 3 + 2] = 0;
      n++;
    }
    orbitGeo.attributes.position.needsUpdate = true;
    orbitGeo.setDrawRange(0, n);
    orbitLine.visible = n > 1;
    return o;
  }

  function addTrailPoint(x, y) {
    if (trailCount >= TRAIL_MAX) {
      for (let i = 0; i < TRAIL_MAX / 2; i++) {
        trailPos[i * 3] = trailPos[i * 6];
        trailPos[i * 3 + 1] = trailPos[i * 6 + 1];
        trailPos[i * 3 + 2] = 0;
      }
      trailCount = TRAIL_MAX / 2;
    }
    trailPos[trailCount * 3] = x;
    trailPos[trailCount * 3 + 1] = y;
    trailPos[trailCount * 3 + 2] = 0;
    trailCount++;
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, trailCount);
  }

  function screenOf(localPos) {
    tmpV.copy(localPos);
    world.localToWorld(tmpV);
    tmpV.project(camera);
    if (tmpV.z > 1) return null;
    return { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight };
  }

  function updateScene(dt) {
    const sim = state.sim;
    const L = state.layout;
    const s = sim || { x: 0, y: R + ROCKET.padHeight, theta: Math.PI / 2, stage: 0 };
    const r = Math.hypot(s.x, s.y);
    const phi = Math.atan2(s.y, s.x);
    const alt = r - R;
    const stage = s.stage;

    if (!state.frozen) {
      if (state.view === 'map') {
        world.position.set(0, 0, 0);
        world.rotation.set(0, 0, 0);
        rocketRoot.position.set(s.x, s.y, 0);
        rocketRoot.rotation.set(0, 0, s.theta - Math.PI / 2);
      } else {
        world.position.set(0, -r, 0);
        world.rotation.set(0, 0, Math.PI / 2 - phi);
        rocketRoot.position.set(0, 0, 0);
        rocketRoot.rotation.set(0, 0, s.theta - phi);
      }
    }
    world.updateMatrixWorld();
    stackHolder.position.y = -L.stacks[stage].yBottom;

    // engines and flames
    const firing = !!(sim && !sim.finished && sim.thrust > 0 && state.countdown <= 0);
    const pRatio = airDensity(alt) / PLANET.rho0;
    state.rocket.flames.forEach((f, i) => {
      const on = firing && i === stage;
      f.group.visible = on;
      const nm = state.rocket.nozzleMats[i];
      nm.emissiveIntensity = on ? 0.9 : Math.max(0, nm.emissiveIntensity - dt * 0.3);
      if (!on) return;
      const eng = L.stages[i].engine;
      const thr = Math.min(sim.thrust / eng.thrustVac, 1);
      const vac = 1 - pRatio;
      const flick = 0.9 + Math.random() * 0.2;
      const len = f.exitR * (6 + 10 * vac) * (0.35 + 0.65 * thr) * flick + 1.2;
      const wid = f.exitR * (1 + 2.2 * vac * vac);
      f.outer.scale.set(wid * 1.15, len, wid * 1.15);
      f.mid.scale.set(wid * 0.85, len * 0.7, wid * 0.85);
      f.inner.scale.set(f.exitR * 0.55, len * 0.32, f.exitR * 0.55);
      f.outer.material.opacity = (0.25 + 0.3 * thr) * (1 - 0.45 * vac);
      f.mid.material.opacity = (0.3 + 0.3 * thr) * (1 - 0.3 * vac);
      state.rocket.pivots[i].rotation.z = -sim.gimbal * eng.gimbal * (Math.PI / 180) * 2.5;
    });
    engineLight.intensity = firing && alt < 6000 && state.view === 'chase' ? 2500 * (0.8 + Math.random() * 0.4) : 0;

    for (const [d, c] of state.drops) {
      c.position.set(d.x, d.y, 0);
      c.rotation.set(0, 0, d.theta - Math.PI / 2);
    }

    if (firing && state.warp <= 10 && state.view === 'chase' && dt > 0) {
      const base = new THREE.Vector3(s.x, s.y, 0);
      const down = new THREE.Vector3(-Math.cos(s.theta), -Math.sin(s.theta), 0);
      const up = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      const tangent = new THREE.Vector3(Math.cos(phi - Math.PI / 2), Math.sin(phi - Math.PI / 2), 0);
      effects.exhaust(base, down, up, tangent, {
        alt, onPad: alt < 40, throttle: sim.throttle, dt: dt * Math.min(state.warp, 2), exitR: state.rocket.flames[stage].exitR,
      });
    }

    // camera follows the rocket in chase view
    if (state.view === 'chase' && !state.frozen) {
      rocketCenter(tmpC);
      tmpV.copy(tmpC).sub(controls.target);
      controls.target.add(tmpV);
      camera.position.add(tmpV);
    } else if (state.view === 'chase' && state.frozen && effects.debrisCenter(tmpC)) {
      // ease the camera after the falling wreckage
      tmpV.copy(tmpC).sub(controls.target).multiplyScalar(Math.min(1, dt * 2.5));
      controls.target.add(tmpV);
      camera.position.add(tmpV);
    }

    // trajectory
    if (sim && sim.liftedOff && !state.frozen) {
      const dist = Math.hypot(s.x - state.lastTrail.x, s.y - state.lastTrail.y);
      if (trailCount === 0 || dist > Math.max(15, alt * 0.004)) {
        addTrailPoint(s.x, s.y);
        state.lastTrail.set(s.x, s.y);
      }
    }
    trail.visible = !!sim;
    const map = state.view === 'map';
    trail.material.opacity = map ? 0.9 : 0.5;
    orbitLine.material.opacity = map ? 0.9 : 0.35;

    state.orbitTimer -= dt;
    let orb = null;
    if (sim && (state.orbitTimer <= 0 || dt === 0)) {
      state.orbitTimer = 0.15;
      orb = updateOrbitLine(sim);
      state.lastOrb = orb;
    }
    orb = orb || state.lastOrb;

    marker.visible = map && !!sim;
    if (marker.visible) marker.position.set(s.x, s.y, 0);

    if (map && sim && orb) {
      const labels = [];
      const you = screenOf(tmpV.set(s.x, s.y, 0));
      if (you) labels.push({ key: 'you', cls: 'you', text: 'Rocket', ...you });
      if (sim.liftedOff && orb.p > 20_000) {
        if (orb.e < 1) {
          const ap = screenOf(tmpV.set(Math.cos(orb.argPeri + Math.PI) * orb.ra, Math.sin(orb.argPeri + Math.PI) * orb.ra, 0));
          if (ap) labels.push({ key: 'ap', text: `Ap ${fmt.dist(orb.apo)}`, ...ap });
        }
        if (orb.rp > R * 0.3) {
          const pe = screenOf(tmpV.set(Math.cos(orb.argPeri) * orb.rp, Math.sin(orb.argPeri) * orb.rp, 0));
          if (pe) labels.push({ key: 'pe', cls: 'pe', text: `Pe ${fmt.dist(orb.peri)}`, ...pe });
        }
      }
      ui.setMapLabels(labels);
    }

    W.update(alt, state.view);

    state.hudTimer -= dt;
    if (sim && state.hudTimer <= 0) {
      state.hudTimer = 0.08;
      ui.updateHud(sim, state.countdown);
      ui.updateWarp(state.warp, maxWarp());
    }
  }

  // ---------- main loop ----------
  const clock = new THREE.Clock();
  let firstFrame = true;

  function frame() {
    scheduleFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const sim = state.sim;

    if (sim && state.mode === 'flight' && !academy.isOpen) {
      if (state.countdown > 0) {
        const before = Math.ceil(state.countdown);
        state.countdown -= dt;
        const after = Math.ceil(state.countdown);
        if (state.countdown <= 0) ui.countdown(null);
        else if (after !== before) ui.countdown(after);
      } else if (!sim.finished) {
        handleManualInput(dt);
        let remaining = dt * state.warp;
        let steps = 0;
        while (remaining > 1e-9 && steps < 8000 && !sim.finished) {
          const h = sim.tel.alt < PLANET.atmosphereHeight ? 0.01 : sim.thrust > 0 ? 0.02 : 0.05;
          const step = Math.min(h, remaining);
          sim.step(step);
          remaining -= step;
          steps++;
        }
        processEvents();
        if (state.warp > maxWarp()) setWarp(state.warp);
      }
    }

    updateScene(dt);
    effects.update(dt);
    controls.update();
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      const loading = document.getElementById('loading');
      if (loading) {
        loading.classList.add('done');
        setTimeout(() => loading.remove(), 700);
      }
      try {
        if (!localStorage.getItem('orbitforge.seenIntro')) academy.open(0);
      } catch { /* storage unavailable */ }
    }
  }

  loadingText.textContent = 'Assembling rocket…';
  await nextFrame();
  ui.renderHangar(state.design);
  rebuildRocket();
  updateScene(0);
  resetBuildCamera();
  ui.setMode('build');
  frame();
}

main().catch((err) => {
  console.error(err);
  if (!document.querySelector('.fatal')) {
    fatal(`<div><h2>Something went wrong</h2><p>${String(err && err.message ? err.message : err)}</p><p>Check that you are online (three.js loads from a CDN) and serving the folder over HTTP.</p></div>`);
  }
});
