// Builds a three.js model of a rocket from a computed layout.
import * as THREE from 'three';

let shared = null;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function getShared() {
  if (shared) return shared;
  const roll = canvasTexture(256, 8, (ctx, w, h) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#1c1e23' : '#f2f2ee';
      ctx.fillRect((i * w) / 4, 0, w / 4, h);
    }
  });
  const foam = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d9832f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = Math.random();
      ctx.fillStyle = `rgba(${v > 0.5 ? '255,190,120' : '120,60,20'},${0.08 + Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 4);
    }
  });
  shared = {
    white: new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.45, metalness: 0.08 }),
    roll: new THREE.MeshStandardMaterial({ map: roll, roughness: 0.45, metalness: 0.08 }),
    foam: new THREE.MeshStandardMaterial({ map: foam, roughness: 0.8, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.3 }),
    darkDouble: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }),
    band: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.2 }),
    fin: new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 0.5, metalness: 0.25 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8f949c, roughness: 0.35, metalness: 0.85 }),
  };
  return shared;
}

function latheProfile(fn, n, y0, y1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(Math.max(fn(t), 0.0001), y0 + (y1 - y0) * t));
  }
  return pts;
}

function addMesh(parent, geo, mat, y = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  parent.add(m);
  return m;
}

// Nozzle geometry lives under `pivot` (top of the nozzle at y = 0), so it can gimbal.
function buildEngine(key, eng, r, rMount, stageGroup, s, bodyKey, mats, nozzleMat) {
  const h = eng.height;
  const mountH = 0.45;
  if (bodyKey === 'box') {
    addMesh(stageGroup, new THREE.BoxGeometry(rMount * 1.9, mountH, rMount * 1.9), mats.dark, s.engineY1 - mountH / 2);
  } else {
    addMesh(stageGroup, new THREE.CylinderGeometry(rMount * 0.97, rMount * 0.62, mountH, 36), mats.dark, s.engineY1 - mountH / 2);
  }

  const pivot = new THREE.Group();
  pivot.position.y = s.engineY1 - mountH;
  stageGroup.add(pivot);
  const L = h - mountH;

  const bell = (rc, chamber, rt, re, power) => {
    const pts = [
      new THREE.Vector2(0.0001, 0),
      new THREE.Vector2(rc, 0),
      new THREE.Vector2(rc, -chamber),
      new THREE.Vector2(rt, -chamber - 0.1),
    ];
    const rest = latheProfile((t) => rt + (re - rt) * (1 - Math.pow(1 - t, power)), 14, -chamber - 0.1, -L);
    return pts.concat(rest.slice(1));
  };

  let exitR;
  switch (key) {
    case 'cone': {
      exitR = eng.exit * r;
      const pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.26 * r, 0), new THREE.Vector2(0.26 * r, -0.3), new THREE.Vector2(0.15 * r, -0.4), new THREE.Vector2(exitR, -L)];
      addMesh(pivot, new THREE.LatheGeometry(pts, 32), nozzleMat);
      break;
    }
    case 'aerospike': {
      exitR = 0.72 * r;
      addMesh(pivot, new THREE.CylinderGeometry(0.9 * r, 0.9 * r, 0.3, 36, 1, true), mats.darkDouble, -0.15);
      const spike = latheProfile((t) => 0.82 * r - 0.5 * r * Math.pow(t, 0.7), 12, -0.05, -L);
      spike.push(new THREE.Vector2(0.0001, -L));
      addMesh(pivot, new THREE.LatheGeometry(spike, 36), nozzleMat);
      break;
    }
    case 'vacuum': {
      exitR = eng.exit * r;
      addMesh(pivot, new THREE.LatheGeometry(bell(0.22 * r, 0.3, 0.12 * r, exitR, 2.8), 40), nozzleMat);
      break;
    }
    case 'cluster': {
      exitR = 0.85 * r;
      const geo = new THREE.LatheGeometry(bell(0.14 * r, 0.25, 0.09 * r, eng.exit * r, 2.2), 24);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const m = addMesh(pivot, geo, nozzleMat);
        m.position.set(Math.cos(a) * 0.5 * r, 0, Math.sin(a) * 0.5 * r);
      }
      break;
    }
    default: {
      exitR = eng.exit * r;
      addMesh(pivot, new THREE.LatheGeometry(bell(0.28 * r, 0.35, 0.17 * r, exitR, 2.2), 36), nozzleMat);
    }
  }
  return { pivot, exitR, length: L };
}

function buildFlame(exitR, length, key) {
  const group = new THREE.Group();
  group.position.y = -length;
  group.visible = false;

  const unit = [
    new THREE.Vector2(0.95, 0),
    new THREE.Vector2(1.15, -0.12),
    new THREE.Vector2(1.05, -0.35),
    new THREE.Vector2(0.7, -0.65),
    new THREE.Vector2(0.0001, -1),
  ];
  const geo = new THREE.LatheGeometry(unit, 24);
  const mk = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const outer = new THREE.Mesh(geo, mk(0xff6a1a, 0.5));
  const mid = new THREE.Mesh(geo, mk(0xffa040, 0.55));
  const inner = new THREE.Mesh(geo, mk(0xfff3c4, 0.9));
  for (const m of [outer, mid, inner]) {
    m.userData.noDebris = true;
    m.renderOrder = 5;
    group.add(m);
  }
  return { group, outer, mid, inner, exitR, key };
}

function buildTank(layout, s, stageGroup, mats) {
  const { r, rs, radiusAt, design } = layout;
  const L = s.tankLen;
  const yc = (s.tankY0 + s.tankY1) / 2;
  const skin = s.index === 0 ? mats.roll : mats.white;
  switch (design.body) {
    case 'box': {
      addMesh(stageGroup, new THREE.BoxGeometry(2 * r, L, 2 * r), s.index === 0 ? mats.white : mats.white, yc);
      addMesh(stageGroup, new THREE.BoxGeometry(2 * r + 0.06, 0.16, 2 * r + 0.06), mats.band, s.tankY0 + 0.08);
      addMesh(stageGroup, new THREE.BoxGeometry(2 * r + 0.06, 0.16, 2 * r + 0.06), mats.band, s.tankY1 - 0.08);
      if (s.index === 0) {
        const stripe = addMesh(stageGroup, new THREE.BoxGeometry(2 * r + 0.02, Math.min(1.2, L * 0.2), 2 * r + 0.02), mats.accent, s.tankY1 - Math.min(1.2, L * 0.2) / 2 - 0.4);
        stripe.userData.small = true;
      }
      break;
    }
    case 'spheres': {
      addMesh(stageGroup, new THREE.CylinderGeometry(r * 0.32, r * 0.32, L, 16), mats.dark, yc);
      const geo = new THREE.SphereGeometry(rs, 32, 20);
      for (let j = 0; j < s.spheres; j++) {
        addMesh(stageGroup, geo, mats.foam, s.tankY0 + rs * (2 * j + 1));
      }
      break;
    }
    case 'tapered': {
      const r0 = radiusAt(s.tankY0), r1 = radiusAt(s.tankY1);
      addMesh(stageGroup, new THREE.CylinderGeometry(r1, r0, L, 48), skin, yc);
      addMesh(stageGroup, new THREE.CylinderGeometry(r0 * 1.012, r0 * 1.012, 0.14, 48), mats.band, s.tankY0 + 0.07);
      addMesh(stageGroup, new THREE.CylinderGeometry(r1 * 1.012, r1 * 1.012, 0.14, 48), mats.band, s.tankY1 - 0.07);
      break;
    }
    default: {
      addMesh(stageGroup, new THREE.CylinderGeometry(r, r, L, 48), skin, yc);
      addMesh(stageGroup, new THREE.CylinderGeometry(r * 1.012, r * 1.012, 0.14, 48), mats.band, s.tankY0 + 0.07);
      addMesh(stageGroup, new THREE.CylinderGeometry(r * 1.012, r * 1.012, 0.14, 48), mats.band, s.tankY1 - 0.07);
    }
  }
}

function buildInterstage(layout, s, stageGroup, mats) {
  const { r, radiusAt, design } = layout;
  const h = s.interY1 - s.interY0;
  const yc = (s.interY0 + s.interY1) / 2;
  if (design.body === 'box') {
    addMesh(stageGroup, new THREE.BoxGeometry(2 * r, h, 2 * r), mats.dark, yc);
  } else {
    const r0 = design.body === 'spheres' ? r : radiusAt(s.interY0);
    const r1 = design.body === 'spheres' ? r : radiusAt(s.interY1);
    addMesh(stageGroup, new THREE.CylinderGeometry(r1, r0, h, 48, 1, true), mats.darkDouble, yc);
    addMesh(stageGroup, new THREE.CylinderGeometry(r1 * 1.02, r1 * 1.02, 0.12, 48), mats.band, s.interY1 - 0.06);
  }
}

function buildFins(layout, stageGroup, mats) {
  const { finGeom, radiusAt, design, r, stages } = layout;
  const { cr, ct, sweep, span } = finGeom;
  if (cr <= 0) return;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, cr);
  shape.lineTo(span, cr - sweep);
  shape.lineTo(span, cr - sweep - ct);
  shape.closePath();
  const thick = 0.12;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.translate(0, 0, -thick / 2);
  const y0 = stages[0].tankY0;
  let off;
  if (design.body === 'box') off = r;
  else if (design.body === 'spheres') off = r * 0.55;
  else off = radiusAt(y0) - 0.02;
  const offsetAngle = design.body === 'box' ? 0 : Math.PI / 4;
  for (let i = 0; i < 4; i++) {
    const a = offsetAngle + (i * Math.PI) / 2;
    const m = new THREE.Mesh(geo, mats.fin);
    m.rotation.y = a;
    m.position.set(Math.cos(a) * off, y0, -Math.sin(a) * off);
    stageGroup.add(m);
  }
}

function buildNose(layout, stageGroup, mats) {
  const { noseR: R, noseLen: L, noseY0, design } = layout;
  const key = design.nose;
  let pts;
  switch (key) {
    case 'cone':
      pts = latheProfile((t) => R * (1 - t), 16, 0, L);
      break;
    case 'rounded':
      pts = latheProfile((t) => R * Math.sqrt(Math.max(0, 1 - t * t)), 20, 0, L);
      break;
    case 'flat':
      pts = [new THREE.Vector2(R, 0), new THREE.Vector2(R, L * 0.55), new THREE.Vector2(R * 0.86, L), new THREE.Vector2(0.0001, L)];
      break;
    default: {
      const rho = (R * R + L * L) / (2 * R);
      pts = latheProfile((t) => {
        const x = L * (1 - t); // distance from tip
        return Math.sqrt(Math.max(rho * rho - (L - x) ** 2, 0)) + R - rho;
      }, 24, 0, L);
    }
  }
  const box = design.body === 'box';
  if (box) for (const p of pts) p.x *= Math.SQRT2;
  const geo = new THREE.LatheGeometry(pts, box ? 4 : 48, box ? Math.PI / 4 : 0);
  const mat = mats.white.clone();
  mat.side = THREE.DoubleSide;
  if (box) mat.flatShading = true;
  addMesh(stageGroup, geo, mat, noseY0);
  if (!box) addMesh(stageGroup, new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.1, 48), mats.accent, noseY0 + 0.05);
}

export function buildRocketMesh(layout) {
  const mats = getShared();
  const { stages, r, design, radiusAt } = layout;
  const root = new THREE.Group();
  root.name = 'rocket';
  const stageGroups = [];
  const pivots = [];
  const flames = [];
  const nozzleMats = [];

  for (const s of stages) {
    const g = new THREE.Group();
    g.name = `stage-${s.index}`;
    root.add(g);
    stageGroups.push(g);

    const rMount = design.body === 'spheres' ? r * 0.9 : radiusAt(s.tankY0);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x4a4b52, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide,
      emissive: 0xff4a0a, emissiveIntensity: 0,
    });
    nozzleMats.push(nozzleMat);
    const eng = buildEngine(s.engineKey, s.engine, r, rMount, g, s, design.body, mats, nozzleMat);
    pivots.push(eng.pivot);
    const flame = buildFlame(eng.exitR, eng.length, s.engineKey);
    eng.pivot.add(flame.group);
    flames.push(flame);

    buildTank(layout, s, g, mats);
    if (s.interY0 !== undefined) buildInterstage(layout, s, g, mats);
    if (s.index === 0) buildFins(layout, g, mats);
  }
  buildNose(layout, stageGroups[stageGroups.length - 1], mats);

  root.traverse((o) => {
    if (o.isMesh && !o.userData.noDebris) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  return { root, stageGroups, pivots, flames, nozzleMats };
}

export function disposeRocket(rocket) {
  if (!rocket) return;
  rocket.root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material && !Object.values(shared || {}).includes(o.material)) o.material.dispose();
    }
  });
}
