// Planet, atmosphere, launch site, sky and lighting.
import * as THREE from 'three';
import { PLANET, ROCKET } from './config.js';

const R = PLANET.radius;
export const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// ---------- procedural noise ----------
function hash(ix, iy, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c000 = hash(ix, iy, iz), c100 = hash(ix + 1, iy, iz);
  const c010 = hash(ix, iy + 1, iz), c110 = hash(ix + 1, iy + 1, iz);
  const c001 = hash(ix, iy, iz + 1), c101 = hash(ix + 1, iy, iz + 1);
  const c011 = hash(ix, iy + 1, iz + 1), c111 = hash(ix + 1, iy + 1, iz + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  );
}

function fbm(x, y, z, octaves) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function makePlanetTexture() {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let py = 0; py < H; py++) {
    const theta = ((py + 0.5) / H) * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let px = 0; px < W; px++) {
      const phi = ((px + 0.5) / W) * Math.PI * 2;
      const dx = -Math.cos(phi) * st, dy = ct, dz = Math.sin(phi) * st;
      let e = fbm(dx * 2.1 + 11.3, dy * 2.1 + 3.1, dz * 2.1 + 7.7, 5);
      const nearPad = smoothstep(0.93, 0.999, -dz);
      e += (0.58 - e) * nearPad; // the launch site sits on green lowland
      const moist = fbm(dx * 5 + 2, dy * 5, dz * 5 - 4, 2);
      const lat = Math.abs(dy);
      let r, g, b;
      if (e < 0.5) {
        const t = Math.pow(e / 0.5, 3);
        r = 6 + 30 * t; g = 28 + 70 * t; b = 70 + 90 * t;
      } else if (e < 0.515) {
        r = 190; g = 176; b = 132;
      } else if (e < 0.66) {
        const t = (e - 0.515) / 0.145;
        if (moist > 0.52 || nearPad > 0.5) { r = 62 - 20 * t; g = 112 - 25 * t; b = 50 - 12 * t; }
        else { r = 150 - 40 * t; g = 135 - 35 * t; b = 84 - 20 * t; }
      } else if (e < 0.74) {
        const t = (e - 0.66) / 0.08;
        r = 96 + 30 * t; g = 88 + 26 * t; b = 72 + 26 * t;
      } else {
        r = 225; g = 228; b = 232;
      }
      if (lat > 0.975 + (moist - 0.5) * 0.05) { r = 236; g = 242; b = 248; }
      const i = (py * W + px) * 4;
      const n = (hash(px, py, 7) - 0.5) * 10;
      d[i] = r + n; d[i + 1] = g + n; d[i + 2] = b + n; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGrassTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // tileable noise by sampling on a torus
      const a = (x / S) * Math.PI * 2, b = (y / S) * Math.PI * 2;
      const n = fbm(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5, Math.cos(b) * 1.5 + Math.sin(b) * 1.5, 5);
      const fine = hash(x, y, 3);
      const i = (y * S + x) * 4;
      const dry = smoothstep(0.55, 0.7, n);
      d[i] = 58 + 50 * dry + fine * 14;
      d[i + 1] = 98 + 22 * dry + fine * 16;
      d[i + 2] = 44 + 22 * dry + fine * 8;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const LOGDEPTH_VERT_HEAD = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGDEPTH_FRAG_HEAD = '#include <common>\n#include <logdepthbuf_pars_fragment>\n';

function atmosphereMaterial(side, mode) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x5aa8ff) },
      uSun: { value: SUN_DIR.clone() },
      uOpacity: { value: 1 },
    },
    vertexShader: `${LOGDEPTH_VERT_HEAD}
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGDEPTH_FRAG_HEAD}
      uniform vec3 uColor; uniform vec3 uSun; uniform float uOpacity;
      varying vec3 vN; varying vec3 vW;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float d = dot(normalize(vN), V);
        float intensity = ${mode === 'halo'
          ? 'pow(clamp(-d / 0.5, 0.0, 1.0), 2.4)'
          : 'pow(1.0 - clamp(d, 0.0, 1.0), 3.0) * 0.9'};
        float lit = clamp(dot(normalize(vN), uSun) * 0.8 + 0.35, 0.05, 1.0);
        gl_FragColor = vec4(uColor * intensity * lit * uOpacity, 1.0);
      }`,
    side,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function buildLaunchSite(grassTex) {
  const site = new THREE.Group();
  site.position.set(0, R, 0);

  // Curved ground patch around the pad, fading out into the planet sphere
  const capAngle = 0.06;
  const capGeo = new THREE.SphereGeometry(R, 192, 72, 0, Math.PI * 2, 0, capAngle);
  capGeo.translate(0, -R, 0);
  const pos = capGeo.attributes.position;
  const uv = capGeo.attributes.uv;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + R, z = pos.getZ(i);
    const ang = Math.atan2(Math.hypot(x, z), y);
    const a = 1 - smoothstep(capAngle * 0.5, capAngle * 0.97, ang);
    uv.setXY(i, x / 70, z / 70);
    colors[i * 4] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1; colors[i * 4 + 3] = a;
  }
  capGeo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({
    map: grassTex, vertexColors: true, transparent: true, roughness: 1, metalness: 0,
  }));
  cap.renderOrder = -1;
  site.add(cap);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.92 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.95 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2f3134, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb0452a, roughness: 0.6, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.7 });

  const apron = new THREE.Mesh(new THREE.CircleGeometry(70, 48), darkConcrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.04;
  site.add(apron);

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, ROCKET.padHeight, 40), concrete);
  pad.position.y = ROCKET.padHeight / 2;
  site.add(pad);
  const trench = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 36), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 1 }));
  trench.position.y = ROCKET.padHeight + 0.02;
  site.add(trench);

  const road = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 520), asphalt);
  road.position.set(-210, 0.06, -130);
  road.rotation.y = Math.atan2(420, 260);
  site.add(road);

  // Vehicle assembly building
  const vab = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(70, 90, 56), white);
  hall.position.y = 45;
  vab.add(hall);
  const door = new THREE.Mesh(new THREE.BoxGeometry(18, 72, 0.5), new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.8 }));
  door.position.set(0, 36, 28.1);
  vab.add(door);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(70.4, 6, 56.4), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 }));
  stripe.position.y = 80;
  vab.add(stripe);
  vab.position.set(-430, 0, -280);
  vab.rotation.y = Math.atan2(430, 280);
  site.add(vab);

  const control = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 26), white);
  control.position.set(320, 6, 210);
  site.add(control);

  // Propellant farm
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), white);
    tank.position.set(78 + i * 15, 8, 58);
    site.add(tank);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 4, 12), darkConcrete);
    leg.position.set(78 + i * 15, 2, 58);
    site.add(leg);
  }

  // Lightning masts
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 75, 8), steel);
    mast.position.set(Math.cos(a) * 48, 37.5, Math.sin(a) * 48);
    site.add(mast);
  }

  // Trees
  const treeCount = 700;
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.6, 9, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1 }),
    treeCount,
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (placed < treeCount) {
    const dist = 160 + Math.pow(rnd(), 1.6) * 3200;
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.abs(x + 210) < 60 && Math.abs(z + 130) < 300) continue;
    if (Math.hypot(x + 430, z + 280) < 90 || Math.hypot(x - 320, z - 210) < 50) continue;
    const sc = 0.7 + rnd() * 0.9;
    const drop = (dist * dist) / (2 * R);
    p.set(x, 4.5 * sc - drop, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    s.set(sc, sc, sc);
    m4.compose(p, q, s);
    trees.setMatrixAt(placed++, m4);
  }
  site.add(trees);

  // Service tower, rebuilt to match the rocket height
  let tower = null;
  const setRocketHeight = (h) => {
    if (tower) {
      site.remove(tower);
      tower.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    tower = new THREE.Group();
    const H = Math.ceil(h + 6);
    const cx = -(ROCKET.diameter / 2 + 5.5);
    const w = 3;
    const post = new THREE.BoxGeometry(0.35, H, 0.35);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const m = new THREE.Mesh(post, steel);
      m.position.set(cx + (dx * w) / 2, ROCKET.padHeight + H / 2, (dz * w) / 2);
      tower.add(m);
    }
    const brace = new THREE.BoxGeometry(0.18, Math.hypot(w, 3), 0.18);
    const rung = new THREE.BoxGeometry(w, 0.2, 0.2);
    for (let y = 0; y < H - 1; y += 3) {
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(brace, steel);
        b.position.set(cx, ROCKET.padHeight + y + 1.5, (side * w) / 2);
        b.rotation.z = Math.atan2(w, 3) * (y % 6 === 0 ? 1 : -1);
        tower.add(b);
        const b2 = new THREE.Mesh(brace, steel);
        b2.position.set(cx + (side * w) / 2, ROCKET.padHeight + y + 1.5, 0);
        b2.rotation.x = Math.atan2(w, 3) * (y % 6 === 0 ? 1 : -1);
        tower.add(b2);
      }
      const r1 = new THREE.Mesh(rung, steel);
      r1.position.set(cx, ROCKET.padHeight + y, w / 2);
      tower.add(r1);
      const r2 = r1.clone();
      r2.position.z = -w / 2;
      tower.add(r2);
    }
    const armLen = Math.abs(cx) - ROCKET.diameter / 2 - w / 2 + 0.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.6, 1.4), steel);
    arm.position.set(cx + w / 2 + armLen / 2, ROCKET.padHeight + h * 0.82, 0);
    tower.add(arm);
    const topper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), steel);
    topper.position.set(cx, ROCKET.padHeight + H + 4, 0);
    tower.add(topper);
    site.add(tower);
  };

  return { site, setRocketHeight, cap };
}

export function createWorld(scene) {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  const planetTex = makePlanetTexture();
  const grassTex = makeGrassTexture();

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(R - 120, 256, 128),
    new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.95, metalness: 0 }),
  );
  planet.rotation.x = Math.PI / 2; // texture poles on ±Z, the flight plane is the equator
  world.add(planet);

  const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.13, 128, 64), atmosphereMaterial(THREE.BackSide, 'halo'));
  world.add(halo);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(R + 2500, 192, 96), atmosphereMaterial(THREE.FrontSide, 'haze'));
  world.add(haze);

  const launch = buildLaunchSite(grassTex);
  world.add(launch.site);

  // Stars
  const starCount = 5000;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dist = 6e7;
    starPos[i * 3] = s * Math.cos(a) * dist;
    starPos[i * 3 + 1] = s * Math.sin(a) * dist;
    starPos[i * 3 + 2] = u * dist;
    const b = 0.5 + Math.random() * 0.5;
    const tint = Math.random();
    starCol[i * 3] = b * (tint > 0.8 ? 1 : 0.85);
    starCol[i * 3 + 1] = b * 0.9;
    starCol[i * 3 + 2] = b * (tint < 0.2 ? 1 : 0.85);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false,
  }));
  stars.frustumCulled = false;
  world.add(stars);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,255,245,1)'], [0.08, 'rgba(255,245,210,0.95)'], [0.25, 'rgba(255,210,140,0.25)'], [1, 'rgba(255,180,100,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true,
  }));
  sunSprite.position.copy(SUN_DIR).multiplyScalar(5e7);
  sunSprite.scale.setScalar(6e6);
  world.add(sunSprite);

  // Lights
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  world.add(sun);
  world.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x4a5a36, 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x8899bb, 0.06);
  scene.add(ambient);

  scene.fog = new THREE.FogExp2(0x88b8e8, 0);
  scene.background = new THREE.Color(0x88b8e8);

  const skyLow = new THREE.Color(0x86b9ea);
  const skyMid = new THREE.Color(0x1c3a6e);
  const skyHigh = new THREE.Color(0x020308);
  const tmpColor = new THREE.Color();
  const tmpQuat = new THREE.Quaternion();

  function update(alt, viewMode) {
    const map = viewMode === 'map';
    if (map) {
      tmpColor.copy(skyHigh);
    } else {
      const t1 = smoothstep(0, 22_000, alt);
      const t2 = smoothstep(18_000, 60_000, alt);
      tmpColor.copy(skyLow).lerp(skyMid, t1).lerp(skyHigh, t2);
    }
    scene.background.copy(tmpColor);
    scene.fog.color.copy(tmpColor);
    scene.fog.density = map ? 0 : (1 / 26_000) * Math.exp(-Math.max(alt, 0) / 6000);

    stars.material.opacity = map ? 1 : smoothstep(20_000, 55_000, alt);
    stars.visible = stars.material.opacity > 0.01;
    hemi.intensity = map ? 0.08 : 0.9 - 0.8 * smoothstep(0, 40_000, alt);

    world.getWorldQuaternion(tmpQuat);
    const sunWorld = SUN_DIR.clone().applyQuaternion(tmpQuat);
    halo.material.uniforms.uSun.value.copy(sunWorld);
    haze.material.uniforms.uSun.value.copy(sunWorld);
    halo.material.uniforms.uOpacity.value = map ? 1 : smoothstep(25_000, 140_000, alt);
    haze.material.uniforms.uOpacity.value = map ? 0.7 : smoothstep(4000, 30_000, alt) * 0.8;
    halo.visible = halo.material.uniforms.uOpacity.value > 0.005;
    haze.visible = haze.material.uniforms.uOpacity.value > 0.005;
  }

  return { world, planet, stars, launch, update, sun };
}
