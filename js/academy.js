// Orbit Forge Academy: short animated, interactive lessons on the science of rocketry.
import { ICONS } from './icons.js';

const TAU = Math.PI * 2;
const G0 = 9.81;
const VW = 600, VH = 420;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// ---------------- drawing helpers (virtual 600 × 420 canvas) ----------------
const STARS = (() => {
  let seed = 42;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 150 }, () => ({ x: r() * VW, y: r() * VH, s: r() * 1.5 + 0.4, p: r() * TAU }));
})();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx, str, x, y, { color = '#e8ecf4', size = 15, weight = 600, align = 'center', bg = null } = {}) {
  ctx.font = `${weight} ${size}px 'Space Grotesk', system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (bg) {
    const w = ctx.measureText(str).width;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg;
    roundRect(ctx, x0 - 9, y - size * 0.5 - 6, w + 18, size + 12, 9);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawSpace(ctx, t, { top = '#040713', bottom = '#0e1a33', stars = true } = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  if (!stars) return;
  ctx.fillStyle = '#fff';
  for (const s of STARS) {
    ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 1.4 + s.p);
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#3d78bf');
  g.addColorStop(1, '#a9d1f2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
}

function drawPlanet(ctx, cx, cy, r) {
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.09);
  glow.addColorStop(0, 'rgba(110,180,255,0.55)');
  glow.addColorStop(1, 'rgba(110,180,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.09, 0, TAU);
  ctx.fill();
  const sea = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  sea.addColorStop(0, '#4f9be0');
  sea.addColorStop(1, '#1b4f8f');
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#3d7d3f';
  for (const [bx, by, rx, ry] of [[-0.3, -0.55, 0.35, 0.18], [0.4, -0.2, 0.25, 0.3], [-0.45, 0.25, 0.3, 0.2], [0.15, 0.55, 0.35, 0.15], [0.05, -0.97, 0.45, 0.1]]) {
    ctx.beginPath();
    ctx.ellipse(cx + bx * r, cy + by * r, rx * r, ry * r, 0.4, 0, TAU);
    ctx.fill();
  }
  const shade = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,12,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
}

function drawFlame(ctx, w, flame, t, y0 = 5) {
  if (flame <= 0) return;
  const len = (26 + 8 * Math.sin(t * 37) + 5 * Math.sin(t * 23)) * flame * (w / 10);
  const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
  g.addColorStop(0, 'rgba(255,250,215,1)');
  g.addColorStop(0.35, 'rgba(255,170,60,0.95)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w * 0.6, y0);
  ctx.quadraticCurveTo(-w * 0.95, y0 + len * 0.45, 0, y0 + len);
  ctx.quadraticCurveTo(w * 0.95, y0 + len * 0.45, w * 0.6, y0);
  ctx.closePath();
  ctx.fill();
}

/** A rocket pointing up with its base at (x, y). */
function drawRocket(ctx, o) {
  const { x, y, angle = 0, fins = true, nose = 'ogive', flame = 0, t = 0, stripe = '#ff7a1a', body = '#eef0f2', height = 90, width = 20, alpha = 1 } = o;
  const w = width / 2, H = height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawFlame(ctx, w, flame, t);
  ctx.fillStyle = '#4a4d55';
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, -4);
  ctx.lineTo(w * 0.45, -4);
  ctx.lineTo(w * 0.7, 5);
  ctx.lineTo(-w * 0.7, 5);
  ctx.closePath();
  ctx.fill();

  const bodyTop = -H * 0.72;
  ctx.fillStyle = body;
  ctx.fillRect(-w, bodyTop, 2 * w, -bodyTop - 4);
  ctx.fillStyle = '#1c1f25';
  ctx.fillRect(-w, -H * 0.32, 2 * w, H * 0.04);
  ctx.fillStyle = stripe;
  ctx.fillRect(-w, bodyTop + H * 0.05, 2 * w, H * 0.035);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(w * 0.35, bodyTop, w * 0.65, -bodyTop - 4);

  const tip = -H;
  const d = bodyTop - tip;
  ctx.fillStyle = body;
  ctx.beginPath();
  if (nose === 'flat') {
    ctx.moveTo(-w, bodyTop);
    ctx.lineTo(-w, bodyTop - 5);
    ctx.lineTo(-w * 0.8, bodyTop - 8);
    ctx.lineTo(w * 0.8, bodyTop - 8);
    ctx.lineTo(w, bodyTop - 5);
    ctx.lineTo(w, bodyTop);
  } else if (nose === 'rounded') {
    ctx.moveTo(-w, bodyTop);
    ctx.ellipse(0, bodyTop, w, w * 1.1, 0, Math.PI, TAU);
  } else if (nose === 'cone') {
    ctx.moveTo(-w, bodyTop);
    ctx.lineTo(0, tip);
    ctx.lineTo(w, bodyTop);
  } else {
    ctx.moveTo(-w, bodyTop);
    ctx.bezierCurveTo(-w, bodyTop - 0.55 * d, -w * 0.35, tip + 0.1 * d, 0, tip);
    ctx.bezierCurveTo(w * 0.35, tip + 0.1 * d, w, bodyTop - 0.55 * d, w, bodyTop);
  }
  ctx.closePath();
  ctx.fill();

  if (fins) {
    ctx.fillStyle = '#2f333b';
    ctx.beginPath();
    ctx.moveTo(-w, -H * 0.26);
    ctx.lineTo(-w * 2.1, 3);
    ctx.lineTo(-w, -3);
    ctx.closePath();
    ctx.moveTo(w, -H * 0.26);
    ctx.lineTo(w * 2.1, 3);
    ctx.lineTo(w, -3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, color, { width = 6, text, side = 'right', size = 14 } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 3) return;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.min(18, len * 0.6);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(a) * head * 0.8, y2 - Math.sin(a) * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head);
  ctx.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fill();
  if (text) label(ctx, text, (x1 + x2) / 2 + (side === 'right' ? 16 : -16), (y1 + y2) / 2, { color, size, align: side === 'right' ? 'left' : 'right' });
}

// ---------------- control helpers ----------------
const sliderHtml = (id, text, min, max, step, value, out) =>
  `<label class="ac-slider"><span>${text}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="${id}-out">${out}</output></label>`;

const segHtml = (id, options, active) =>
  `<div class="seg" id="${id}">${options.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === active ? 'active' : ''}">${l}</button>`).join('')}</div>`;

function bindSlider(root, id, onInput, format) {
  const input = root.querySelector(`#${id}`);
  const out = root.querySelector(`#${id}-out`);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    onInput(v);
    out.textContent = format(v);
  });
}

function bindSeg(root, id, onPick) {
  const seg = root.querySelector(`#${id}`);
  seg.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      onPick(b.dataset.k);
    });
  });
}

// ---------------- lessons ----------------
const SLIDES = [
  {
    id: 'welcome',
    kicker: 'Orbit Forge Academy',
    title: 'Can you build a rocket that reaches space and stays there?',
    simple: 'In a few short lessons you’ll discover the real science of spaceflight, from Newton’s laws to orbits. Then you’ll build and launch your own rocket. Every lesson has something to play with.',
    extra: `<div class="ac-cta">
        <button class="primary" data-action="start">▶ Start the lessons</button>
        <button class="ghost" data-action="guide">🧭 Guide me through my first launch</button>
        <button class="ghost" data-action="skip">Skip to the hangar</button>
      </div>
      <p class="ac-meta">9 short lessons · about 5 minutes · for curious minds of every age</p>`,
    draw(ctx, t) {
      drawSpace(ctx, t);
      const P = 9;
      const p = (t % P) / P;
      drawPlanet(ctx, 300, 980, 640);
      // launch pad
      ctx.fillStyle = '#2b2f36';
      ctx.fillRect(284, 336, 32, 5);
      let x = 300, y = 336, angle = 0, flame = 0, scale = 1, alpha = 1;
      if (p < 0.12) {
        flame = p > 0.05 ? (p - 0.05) / 0.07 : 0;
        for (let i = 0; i < 10 * flame; i++) {
          ctx.fillStyle = `rgba(220,220,225,${0.25 * flame})`;
          ctx.beginPath();
          ctx.arc(300 + Math.sin(i * 2.3 + t) * 26 * flame, 334 - (i % 3) * 3, 8 + i * 1.2, 0, TAU);
          ctx.fill();
        }
      } else {
        const u = (p - 0.12) / 0.88;
        x = 300 + 250 * u * u;
        y = 336 - 300 * Math.sin((u * Math.PI) / 2);
        const vx = 500 * u, vy = -300 * (Math.PI / 2) * Math.cos((u * Math.PI) / 2);
        angle = Math.atan2(vx, -vy);
        flame = 1;
        scale = 1 - 0.55 * u;
        alpha = u > 0.88 ? (1 - u) / 0.12 : 1;
        ctx.strokeStyle = 'rgba(255,170,80,0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        for (let k = 0; k <= 30; k++) {
          const uu = (u * k) / 30;
          const px = 300 + 250 * uu * uu, py = 336 - 300 * Math.sin((uu * Math.PI) / 2);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawRocket(ctx, { x, y, angle, flame, t, height: 70 * scale, width: 16 * scale, alpha });
    },
  },

  {
    id: 'reaction',
    kicker: 'Lesson 1 · Push and push back',
    title: 'Action and reaction',
    simple: 'A rocket engine burns fuel and blasts hot gas out of its nozzle very fast. Pushing the gas down pushes the rocket up. It’s like sitting on a skateboard and throwing a heavy ball: you roll the other way.',
    tryIt: 'Drag the <b>Engine power</b> slider. Both arrows always stay the same size.',
    science: {
      formula: 'Thrust = ṁ × vₑ',
      text: 'Newton’s third law: every action has an equal and opposite reaction. Thrust equals the mass of gas thrown out each second (ṁ) times its exhaust speed (vₑ). A rocket doesn’t push against air or ground, which is why engines work in the vacuum of space.',
    },
    fact: 'The five F-1 engines of the Saturn V moon rocket made about 34 million newtons of thrust at liftoff, roughly the weight of 2,300 family cars.',
    state: () => ({ power: 70, parts: [], acc: 0 }),
    controls: (st) => sliderHtml('ac-power', 'Engine power', 0, 100, 1, st.power, `${st.power}%`),
    bind(root, st) { bindSlider(root, 'ac-power', (v) => { st.power = v; }, (v) => `${v}%`); },
    draw(ctx, t, dt, st) {
      const bg = ctx.createLinearGradient(0, 0, 0, VH);
      bg.addColorStop(0, '#0b1220');
      bg.addColorStop(1, '#1b2537');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#262c36';
      ctx.fillRect(0, 356, VW, 64);
      // test stand
      ctx.fillStyle = '#6b3a2a';
      ctx.fillRect(232, 110, 10, 246);
      ctx.fillRect(358, 110, 10, 246);
      ctx.fillRect(232, 150, 136, 8);
      label(ctx, 'Engine test stand', 300, 90, { color: '#8a94a7', size: 13 });

      const power = st.power / 100;
      st.acc += st.power * 3 * dt;
      while (st.acc >= 1) {
        st.acc -= 1;
        st.parts.push({ x: 300 + rand(-4, 4), y: 262, vx: rand(-25, 25), vy: rand(260, 380) * (0.45 + 0.55 * power), life: 0, max: rand(0.5, 0.9), hit: false });
      }
      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        p.life += dt;
        if (!p.hit && p.y > 350) {
          p.hit = true;
          p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(150, 260);
          p.vy = -rand(10, 40);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life > p.max) st.parts.splice(i, 1);
      }
      for (const p of st.parts) {
        const f = p.life / p.max;
        ctx.fillStyle = f < 0.3 ? `rgba(255,${190 - f * 200},80,${1 - f})` : `rgba(200,200,210,${(1 - f) * 0.45})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + f * 16, 0, TAU);
        ctx.fill();
      }
      drawRocket(ctx, { x: 300, y: 262, height: 130, width: 30, flame: power * 1.2, t });
      const L = 20 + power * 100;
      arrow(ctx, 400, 215, 400, 215 - L, '#ffb347', { text: 'Push on rocket ↑' });
      arrow(ctx, 200, 280, 200, 280 + L * 0.7, '#4fd1ff', { text: 'Push on gas ↓', side: 'left' });
      label(ctx, power > 0 ? 'Equal and opposite forces' : 'Engine off: no push either way', 300, 40, { size: 17, bg: 'rgba(0,0,0,0.45)' });
    },
  },

  {
    id: 'twr',
    kicker: 'Lesson 2 · Forces',
    title: 'Thrust vs. weight',
    simple: 'Gravity pulls the rocket down: that’s its weight. The engine pushes it up: that’s thrust. The rocket only lifts off when the push is bigger than the pull.',
    tryIt: 'Move the <b>Thrust</b> slider below and above the rocket’s weight.',
    science: {
      formula: 'TWR = Thrust ÷ Weight = F ÷ (m × g)',
      text: 'The thrust-to-weight ratio (TWR) must be above 1 to lift off. The extra push is what accelerates the rocket: a = g × (TWR − 1). Too low wastes fuel fighting gravity; too high means racing through thick air.',
    },
    fact: 'A SpaceX Falcon 9 lifts off with about 7.6 million newtons of thrust under a 549-tonne rocket, a TWR of roughly 1.4.',
    state: () => ({ thrust: 140, y: 0, v: 0, wait: 0 }),
    controls: (st) => sliderHtml('ac-thrust', 'Thrust', 0, 250, 5, st.thrust, `${st.thrust}% of weight`),
    bind(root, st) { bindSlider(root, 'ac-thrust', (v) => { st.thrust = v; }, (v) => `${v}% of weight`); },
    draw(ctx, t, dt, st) {
      const twr = st.thrust / 100;
      const g = 70;
      if (st.y <= 0 && twr <= 1) {
        st.y = 0;
        st.v = 0;
      } else {
        st.v += g * (twr - 1) * dt;
        st.y += st.v * dt;
        if (st.y < 0) { st.y = 0; st.v = 0; }
      }
      if (st.y > 430) {
        st.wait += dt;
        if (st.wait > 0.7) { st.y = 0; st.v = 0; st.wait = 0; }
      }
      drawSky(ctx);
      ctx.fillStyle = '#4b7d3a';
      ctx.fillRect(0, 370, VW, 50);
      ctx.fillStyle = '#8c8f93';
      ctx.fillRect(250, 362, 100, 10);
      const base = 362 - st.y;
      drawRocket(ctx, { x: 300, y: base, height: 130, width: 30, flame: twr > 0 ? Math.min(1.3, 0.3 + twr * 0.5) : 0, t });
      const cy = base - 65;
      arrow(ctx, 345, cy, 345, cy - twr * 70, '#ff8a2a', { text: 'Thrust' });
      arrow(ctx, 255, cy, 255, cy + 70, '#2f7de0', { text: 'Weight', side: 'left' });
      let status, color;
      if (Math.abs(twr - 1) < 0.03) { status = 'Balanced: it just hovers'; color = '#ffc53d'; }
      else if (twr < 1) { status = 'Too heavy: stays on the pad'; color = '#ff6b78'; }
      else { status = 'Liftoff! It speeds up as it climbs'; color = '#3ddc84'; }
      label(ctx, `TWR = ${twr.toFixed(2)}`, 300, 34, { size: 20, bg: 'rgba(4,8,16,0.7)' });
      label(ctx, status, 300, 72, { size: 15, color, bg: 'rgba(4,8,16,0.7)' });
    },
  },

  {
    id: 'fuel',
    kicker: 'Lesson 3 · Fuel',
    title: 'The rocket equation',
    simple: 'As a rocket burns fuel it gets lighter, so the same engine pushes it faster and faster. The bigger the share of your rocket that is fuel, the more speed it can gain. Rocket scientists call this speed budget Δv (“delta-v”).',
    tryIt: 'Change how much of the rocket is <b>fuel</b> and watch the final speed.',
    science: {
      formula: 'Δv = Isp × g₀ × ln(m_full ÷ m_empty)',
      text: 'Isp measures engine efficiency, g₀ is 9.81 m/s², and ln is the natural logarithm. Because of the logarithm, each extra tonne of fuel adds less speed than the one before, which is why reaching orbit is so hard.',
    },
    fact: 'Konstantin Tsiolkovsky published this equation in 1903, months before the Wright brothers’ first flight. Around 90% of a big rocket’s liftoff mass is propellant.',
    state: () => ({ fuel: 80 }),
    controls: (st) => sliderHtml('ac-fuel', 'Fuel share of mass', 50, 97, 1, st.fuel, `${st.fuel}%`),
    bind(root, st) { bindSlider(root, 'ac-fuel', (v) => { st.fuel = v; }, (v) => `${v}%`); },
    draw(ctx, t, dt, st) {
      drawSpace(ctx, t, { stars: false, top: '#0a0f1c', bottom: '#111a2c' });
      const isp = 320;
      const dvOf = (f) => isp * G0 * Math.log(1 / (1 - f));
      const f = st.fuel / 100;
      const c = (t % 6) / 4;
      const burn = clamp(c, 0, 1);
      const mass = 1 - f * burn;
      const speed = isp * G0 * Math.log(1 / mass);

      // cutaway tank
      const tx = 60, tw = 90, ty = 70, th = 250;
      label(ctx, 'Rocket', tx + tw / 2, 48, { size: 14, color: '#8a94a7' });
      ctx.fillStyle = '#394150';
      roundRect(ctx, tx, ty, tw, th, 10);
      ctx.fill();
      const structH = th * (1 - f);
      ctx.fillStyle = '#8e97a6';
      ctx.fillRect(tx + 6, ty + 6, tw - 12, structH - 6);
      label(ctx, 'tanks, engine,', tx + tw / 2, ty + Math.max(structH / 2 - 6, 12), { size: 11, color: '#101520' });
      label(ctx, 'payload', tx + tw / 2, ty + Math.max(structH / 2 + 8, 26), { size: 11, color: '#101520' });
      const fuelH = (th - structH - 6) * (1 - burn);
      const fg = ctx.createLinearGradient(0, ty + th - fuelH, 0, ty + th);
      fg.addColorStop(0, '#ffb347');
      fg.addColorStop(1, '#ff6a1a');
      ctx.fillStyle = fg;
      ctx.fillRect(tx + 6, ty + th - 6 - fuelH, tw - 12, fuelH);
      label(ctx, 'fuel', tx + tw / 2, ty + th - 20, { size: 13, color: '#1a0c00' });
      ctx.save();
      ctx.translate(tx + tw / 2, ty + th);
      drawFlame(ctx, 26, burn < 1 ? 1 : 0, t, 0);
      ctx.restore();
      label(ctx, `${fmt(speed)} m/s`, tx + tw / 2, 390, { size: 18, bg: 'rgba(0,0,0,0.45)' });

      // graph
      const gx = (ff) => 250 + ((ff - 0.5) / 0.47) * 320;
      const gy = (v) => 340 - (v / 12000) * 270;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(250, 60); ctx.lineTo(250, 340); ctx.lineTo(575, 340);
      ctx.stroke();
      label(ctx, 'Final speed (Δv)', 250, 46, { size: 12, color: '#8a94a7', align: 'left' });
      label(ctx, 'Fuel share of liftoff mass →', 575, 360, { size: 12, color: '#8a94a7', align: 'right' });
      for (const [v, text, col] of [[3400, 'Orbit in this game ≈ 3,400', '#3ddc84'], [9400, 'Earth orbit ≈ 9,400', '#4fd1ff']]) {
        ctx.strokeStyle = col;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(250, gy(v)); ctx.lineTo(575, gy(v));
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, text, 258, gy(v) - 10, { size: 12, color: col, align: 'left' });
      }
      ctx.strokeStyle = '#ff9a3d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const ff = 0.5 + (0.47 * i) / 60;
        if (i === 0) ctx.moveTo(gx(ff), gy(dvOf(ff))); else ctx.lineTo(gx(ff), gy(dvOf(ff)));
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx(f), 340); ctx.lineTo(gx(f), gy(speed));
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx(f), gy(dvOf(f)), 6, 0, TAU);
      ctx.fill();
      label(ctx, `${st.fuel}% fuel → ${fmt(dvOf(f))} m/s`, clamp(gx(f), 330, 500), clamp(gy(dvOf(f)) - 22, 70, 320), { size: 14, bg: 'rgba(4,8,16,0.8)' });
    },
  },

  {
    id: 'staging',
    kicker: 'Lesson 4 · Staging',
    title: 'Drop what you don’t need',
    simple: 'An empty fuel tank is just dead weight. So big rockets are really stacks of smaller rockets. When the bottom one runs out, it falls away and the next engine lights, now pushing a much lighter rocket.',
    tryIt: 'Watch both rockets burn the <b>same amount of fuel</b>. Which one ends up faster?',
    science: {
      formula: 'Δv_total = Δv₁ + Δv₂',
      text: 'Example: both rockets weigh 100 t, carry 85 t of fuel and 10 t of tanks and engines, and lift a 5 t payload (Isp 300 s). One stage reaches about 5,600 m/s. Split into two stages, the same rocket reaches about 6,900 m/s because stage 2 doesn’t carry stage 1’s empty tanks.',
    },
    fact: 'The Saturn V had three stages. Of the 2,900-tonne rocket, only the Apollo command module, under 6 tonnes, came back to Earth.',
    draw(ctx, t) {
      drawSpace(ctx, t, { bottom: '#0f1b33' });
      const k = 300 * G0;
      const c = t % 11;
      const tauS = clamp(c / 8, 0, 1);
      const vS = k * Math.log(100 / (100 - 85 * tauS));
      const tau1 = clamp(c / 4, 0, 1);
      const tau2 = clamp((c - 4.3) / 4, 0, 1);
      const vT = k * Math.log(100 / (100 - 60 * tau1)) + k * Math.log(33 / (33 - 25 * tau2));

      const speedLines = (x0, x1, v) => {
        ctx.strokeStyle = 'rgba(160,200,255,0.25)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 14; i++) {
          const x = x0 + 20 + ((i * 97) % (x1 - x0 - 40));
          const y = (i * 53 + t * (40 + v * 0.08)) % 440 - 20;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 8 + v * 0.006);
          ctx.stroke();
        }
      };
      speedLines(0, 300, vS);
      speedLines(300, 600, vT);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(299, 0, 2, VH);
      label(ctx, 'One big stage', 150, 30, { size: 16 });
      label(ctx, 'Two stages', 450, 30, { size: 16 });

      drawRocket(ctx, { x: 150, y: 290, height: 190, width: 34, flame: tauS < 1 ? 1 : 0, t });

      drawRocket(ctx, { x: 450, y: 196, height: 96, width: 30, fins: false, stripe: '#4fd1ff', flame: tau2 > 0 && tau2 < 1 ? 0.9 : 0, t });
      const drop = c >= 4 ? c - 4 : 0;
      ctx.save();
      ctx.globalAlpha = clamp(1 - drop / 3, 0, 1);
      ctx.translate(450 + drop * 14, 290 + drop * drop * 24);
      ctx.rotate(drop * 0.4);
      drawFlame(ctx, 15, tau1 < 1 ? 1 : 0, t);
      ctx.fillStyle = '#4a4d55';
      ctx.fillRect(-8, -4, 16, 9);
      ctx.fillStyle = '#e4e6ea';
      ctx.fillRect(-15, -94, 30, 90);
      ctx.fillStyle = '#1c1f25';
      ctx.fillRect(-15, -60, 30, 5);
      ctx.fillStyle = '#2f333b';
      ctx.beginPath();
      ctx.moveTo(-15, -30); ctx.lineTo(-30, 3); ctx.lineTo(-15, -3); ctx.closePath();
      ctx.moveTo(15, -30); ctx.lineTo(30, 3); ctx.lineTo(15, -3); ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (c >= 4 && c < 5.5) label(ctx, 'Separation!', 520, 250, { size: 15, color: '#ffd27a', bg: 'rgba(0,0,0,0.5)' });

      const bar = (x, v, col) => {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(ctx, x, 360, 220, 12, 6);
        ctx.fill();
        ctx.fillStyle = col;
        roundRect(ctx, x, 360, Math.max(12, (220 * v) / 7000), 12, 6);
        ctx.fill();
        label(ctx, `${fmt(v)} m/s`, x + 110, 392, { size: 15 });
      };
      bar(40, vS, '#ff9a3d');
      bar(340, vT, '#3ddc84');
      if (c > 8.4) label(ctx, `+${Math.round((6868 / 5583 - 1) * 100)}% speed, same fuel`, 450, 334, { size: 14, color: '#3ddc84', bg: 'rgba(0,0,0,0.55)' });
    },
  },

  {
    id: 'drag',
    kicker: 'Lesson 5 · Air',
    title: 'Air resistance and shape',
    simple: 'Air pushes back on anything moving through it. A pointed nose slips through; a flat front has to shove the air aside. Drag grows really fast with speed: go twice as fast and the drag is four times bigger.',
    tryIt: 'Switch <b>nose shapes</b> in the wind tunnel and change the <b>speed</b>.',
    science: {
      formula: 'Drag = ½ × ρ × v² × Cd × A',
      text: 'ρ is air density, v is speed, Cd is the shape’s drag coefficient and A is the front area. Air gets thinner as the rocket climbs, so the squeeze peaks about a minute after launch, at a moment called Max Q.',
    },
    fact: 'The Space Shuttle throttled its main engines down while passing through Max Q to reduce stress on the vehicle, then throttled back up.',
    state: () => ({
      nose: 'ogive',
      speed: 60,
      parts: Array.from({ length: 190 }, () => ({ x: rand(0, VW), y: rand(40, 380), vx: 0 })),
    }),
    controls: (st) => segHtml('ac-nose', [['ogive', 'Pointed'], ['rounded', 'Rounded'], ['flat', 'Flat']], st.nose)
      + sliderHtml('ac-speed', 'Speed', 10, 100, 1, st.speed, `${st.speed}%`),
    bind(root, st) {
      bindSeg(root, 'ac-nose', (k) => { st.nose = k; });
      bindSlider(root, 'ac-speed', (v) => { st.speed = v; }, (v) => `${v}%`);
    },
    draw(ctx, t, dt, st) {
      const CD = { ogive: 0.3, rounded: 0.55, flat: 1.0 };
      const TIP = { ogive: 170, rounded: 214, flat: 235 };
      const NB = 243, BASE = 430, CY = 210, HALF = 26;
      const Cd = CD[st.nose];
      const half = (x) => {
        const tip = TIP[st.nose];
        if (x < tip || x > BASE) return 0;
        if (x >= NB) return HALF;
        const u = (x - tip) / (NB - tip);
        if (st.nose === 'ogive') return HALF * Math.sqrt(u);
        if (st.nose === 'rounded') return HALF * Math.sqrt(1 - (1 - u) ** 2);
        return HALF;
      };

      ctx.fillStyle = '#0a1120';
      ctx.fillRect(0, 0, VW, VH);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < VW; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }

      const flow = 80 + st.speed * 3.2;
      const smooth = st.nose === 'ogive' ? 14 : st.nose === 'rounded' ? 9 : 4;
      for (const p of st.parts) {
        let vx = flow;
        const dy = p.y - CY, ady = Math.abs(dy), sgn = dy < 0 ? -1 : 1;
        // streamlines bend out ahead of the nose; a pointed nose parts the air gradually
        const ahead = st.nose === 'flat' ? 14 : 70;
        const need = Math.max(half(p.x + ahead), half(p.x + ahead * 0.5), half(p.x)) * 1.35 + 8;
        if (need > 8 && ady < need) {
          p.y += sgn * (need - ady) * Math.min(1, dt * smooth);
          if (p.x > NB && ady < HALF + 2) p.y = CY + sgn * (HALF + 3);
          if (st.nose === 'flat' && p.x > TIP.flat - 24 && p.x < TIP.flat + 4) {
            vx *= 0.25;
            p.y += sgn * rand(20, 90) * dt;
          }
        }
        if (p.x > BASE && ady < HALF + 16) {
          p.y += rand(-1, 1) * (Cd - 0.2) * 260 * dt;
          vx *= 1 - (Cd - 0.2) * 0.45;
        }
        p.x += vx * dt;
        p.vx = vx;
        if (p.x > 620) { p.x = rand(-40, -5); p.y = rand(40, 380); }
      }
      ctx.lineWidth = 2;
      for (const p of st.parts) {
        const k = p.vx / flow;
        ctx.strokeStyle = `rgba(110,205,255,${0.25 + 0.5 * k})`;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.07, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      drawRocket(ctx, { x: BASE, y: CY, angle: -Math.PI / 2, height: 260, width: 52, nose: st.nose, fins: false });
      label(ctx, 'Wind tunnel  ·  air flows →', 300, 30, { size: 15, bg: 'rgba(0,0,0,0.5)' });

      const value = Cd * (st.speed / 100) ** 2;
      label(ctx, 'Drag', 70, 362, { size: 14, color: '#8a94a7', align: 'right' });
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      roundRect(ctx, 84, 355, 420, 14, 7);
      ctx.fill();
      const hue = 120 - value * 120;
      ctx.fillStyle = `hsl(${hue}, 75%, 55%)`;
      roundRect(ctx, 84, 355, Math.max(14, 420 * value), 14, 7);
      ctx.fill();
      label(ctx, `Cd ≈ ${Cd.toFixed(2)}`, 520, 362, { size: 13, color: '#cfd6e2', align: 'left' });
      label(ctx, 'Twice the speed → four times the drag', 300, 396, { size: 13, color: '#8a94a7' });
    },
  },

  {
    id: 'stability',
    kicker: 'Lesson 6 · Balance',
    title: 'Staying pointed: fins and stability',
    simple: 'An arrow flies straight because its feathers are at the back. Fins do the same job on a rocket: when wind knocks it sideways, air pushes on the fins and swings the nose back into line.',
    tryIt: 'Turn the <b>fins off</b>, then send a <b>gust of wind</b>.',
    science: {
      formula: 'Stability margin = (CP − CM) ÷ body diameter',
      text: 'CM is the centre of mass, the balance point. CP is the centre of pressure, where the air pushes on average. If CP is behind CM, the air straightens the rocket. If CP is in front, the air flips it around.',
    },
    fact: 'Model rocket builders aim for the CP to sit 1–2 body widths behind the CM. Many modern rockets have no fins at all and steer by swivelling (gimballing) their engines instead.',
    state: () => ({ fins: true, th: 0, om: 0, gustT: 1.5, flash: 0, tumbling: false, tumbleT: 0, streaks: Array.from({ length: 36 }, () => ({ x: rand(0, VW), y: rand(20, 400) })) }),
    controls: (st) => segHtml('ac-fins', [['on', 'Fins on'], ['off', 'No fins']], st.fins ? 'on' : 'off')
      + '<button type="button" class="ghost" id="ac-gust">💨 Gust of wind</button>',
    bind(root, st) {
      bindSeg(root, 'ac-fins', (k) => { st.fins = k === 'on'; st.th = 0; st.om = 0; st.tumbling = false; });
      root.querySelector('#ac-gust').addEventListener('click', () => { st.gustT = 0; });
    },
    draw(ctx, t, dt, st) {
      drawSky(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (const s of st.streaks) {
        s.x -= 320 * dt;
        if (s.x < -30) { s.x = VW + rand(0, 60); s.y = rand(20, 400); }
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + 24, s.y);
        ctx.stroke();
      }
      st.gustT -= dt;
      if (st.gustT <= 0 && !st.tumbling) {
        st.om += (Math.random() < 0.5 ? -1 : 1) * 1.4;
        st.gustT = 4;
        st.flash = 0.8;
      }
      if (!st.tumbling) {
        const k = st.fins ? 7 : -2.4;
        const c = st.fins ? 1.6 : 0.2;
        st.om += (-k * Math.sin(st.th) - c * st.om) * dt;
        st.th += st.om * dt;
        if (Math.abs(st.th) > 1.3) st.tumbling = true;
      } else {
        st.om += Math.sign(st.om || 1) * 4 * dt;
        st.th += st.om * dt;
        st.tumbleT += dt;
        if (st.tumbleT > 2.4) { st.th = 0; st.om = 0; st.tumbling = false; st.tumbleT = 0; st.gustT = 2; }
      }
      if (st.flash > 0) {
        st.flash -= dt;
        arrow(ctx, 300, 60, 300, 120, `rgba(255,255,255,${clamp(st.flash, 0, 0.8)})`, { text: 'gust', width: 5 });
      }

      const cx = 300, cy = 220, a = Math.PI / 2 + st.th;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      drawRocket(ctx, { x: 0, y: 75, height: 160, width: 32, fins: st.fins, flame: 0.9, t });
      ctx.restore();

      const toWorld = (lx, ly) => [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)];
      const cpLocal = st.fins ? 48 : -55;
      const [cmx, cmy] = toWorld(0, 0);
      const [cpx, cpy] = toWorld(0, cpLocal);
      const force = Math.sin(st.th) * 80;
      if (Math.abs(force) > 4 && !st.tumbling) {
        const [fx, fy] = toWorld(force, cpLocal);
        arrow(ctx, cpx, cpy, fx, fy, '#4fd1ff', { width: 4 });
      }
      ctx.fillStyle = '#ffc53d';
      ctx.beginPath(); ctx.arc(cmx, cmy, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4fd1ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cpx, cpy, 8, 0, TAU); ctx.stroke();
      label(ctx, 'CM', cmx, cmy - 20, { size: 13, color: '#8a5a00', bg: 'rgba(255,255,255,0.85)' });
      label(ctx, 'CP', cpx, cpy + 22, { size: 13, color: '#0a5a78', bg: 'rgba(255,255,255,0.85)' });

      const status = st.tumbling ? ['Tumbling out of control!', '#ff4d5e'] : st.fins ? ['Stable: CP is behind CM', '#1f9d57'] : ['Unstable: CP is in front of CM', '#d9502e'];
      label(ctx, status[0], 300, 390, { size: 16, color: '#fff', bg: status[1] });
    },
  },

  {
    id: 'orbit',
    kicker: 'Lesson 7 · Orbits',
    title: 'What is an orbit?',
    simple: 'Isaac Newton imagined a cannon on a very tall mountain. Fire slowly and the ball falls to the ground. Fire faster and it lands farther away. Fire fast enough and the ground curves away as fast as the ball falls, so it never lands. That’s an orbit: falling around a planet forever.',
    tryIt: 'Change the <b>launch speed</b>. Can you find an orbit? Can you escape?',
    science: {
      formula: 'v_orbit = √(G × M ÷ r)',
      text: 'Orbital speed depends on the planet’s mass M and your distance r from its centre. Orbit is about going sideways fast, not just going high. About 41% faster than orbital speed (√2 times) and you escape the planet completely.',
    },
    fact: 'The International Space Station flies about 400 km up at 7.7 km/s (28,000 km/h) and circles Earth roughly every 90 minutes. This game’s planet is smaller, so orbit needs only about 2,300 m/s.',
    state() {
      const st = { speed: 85 };
      resetCannon(st);
      return st;
    },
    controls: (st) => sliderHtml('ac-cannon', 'Launch speed', 50, 150, 1, st.speed, `${st.speed}%`),
    bind(root, st) { bindSlider(root, 'ac-cannon', (v) => { st.speed = v; resetCannon(st); }, (v) => `${v}%`); },
    draw(ctx, t, dt, st) {
      const C = CANNON;
      drawSpace(ctx, t);
      if (st.status === 'flying' || st.status === 'orbit') {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const h = dt / n;
          const dx = st.px - C.x, dy = st.py - C.y;
          const r = Math.hypot(dx, dy);
          const acc = -C.GM / (r * r * r);
          st.vx += acc * dx * h;
          st.vy += acc * dy * h;
          st.px += st.vx * h;
          st.py += st.vy * h;
          const ang = Math.atan2(st.py - C.y, st.px - C.x);
          let da = ang - st.lastAng;
          if (da > Math.PI) da -= TAU;
          if (da < -Math.PI) da += TAU;
          st.travel += da;
          st.lastAng = ang;
          if (r < C.R) { st.status = 'crash'; break; }
          if (r > 720) { st.status = 'escape'; break; }
          if (Math.abs(st.travel) > TAU && st.status === 'flying') st.status = 'orbit';
        }
        st.trail.push([st.px, st.py]);
        if (st.trail.length > 700) st.trail.shift();
      } else {
        st.timer += dt;
        if (st.timer > 1.8) resetCannon(st);
      }

      ctx.strokeStyle = { flying: '#4fd1ff', orbit: '#3ddc84', crash: '#ff7a6a', escape: '#ffd27a' }[st.status];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      st.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();

      drawPlanet(ctx, C.x, C.y, C.R);
      ctx.fillStyle = '#6d6a63';
      ctx.beginPath();
      ctx.moveTo(C.x - 30, C.y - C.R + 8);
      ctx.lineTo(C.x, C.y - C.r0 + 6);
      ctx.lineTo(C.x + 30, C.y - C.R + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e9edf5';
      ctx.beginPath();
      ctx.moveTo(C.x - 7, C.y - C.r0 + 12); ctx.lineTo(C.x, C.y - C.r0 + 6); ctx.lineTo(C.x + 7, C.y - C.r0 + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a2d33';
      ctx.fillRect(C.x - 4, C.y - C.r0 - 3, 16, 7);
      if (st.status === 'crash') {
        label(ctx, '💥', st.px, st.py, { size: 22 });
      } else if (st.status !== 'escape') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(st.px, st.py, 5, 0, TAU); ctx.fill();
      }

      const text = {
        flying: st.speed >= 142 ? 'Heading out…' : 'Flying…',
        orbit: 'Orbit! It keeps falling around the planet',
        crash: 'Too slow: it falls back to the ground',
        escape: 'Escape! It flies off into deep space',
      }[st.status];
      label(ctx, text, 300, 34, { size: 16, bg: 'rgba(4,8,16,0.75)' });
      label(ctx, `In this game ≈ ${fmt((st.speed / 100) * 2300)} m/s   ·   On Earth ≈ ${fmt((st.speed / 100) * 7900)} m/s`, 300, 396, { size: 13, color: '#aeb7c6', bg: 'rgba(4,8,16,0.75)' });
      label(ctx, '(imagine no air to slow it down)', 300, 64, { size: 12, color: '#8a94a7' });
    },
  },

  {
    id: 'launch',
    kicker: 'Lesson 8 · Putting it together',
    title: 'How a launch to orbit works',
    simple: 'Rockets go straight up first to escape the thickest air, then tilt a little at a time. Gravity bends the path into a curve, a “gravity turn”. The engine stops once the highest point is high enough. The rocket coasts up, then fires sideways at the top to round out its orbit.',
    tryIt: 'Follow the highlighted <b>flight phases</b> below the animation.',
    science: {
      formula: 'In orbit when periapsis > top of atmosphere',
      text: 'Apoapsis is the highest point of your path; periapsis is the lowest. If the lowest point is still inside the air, drag drags you down. In this game the atmosphere ends at 70 km. On Earth, space is usually said to begin at the Kármán line, 100 km up.',
    },
    fact: 'Sputnik 1, the first artificial satellite, reached orbit on 4 October 1957 and went around Earth about every 96 minutes.',
    state: () => ({ phase: -1, sep: null }),
    controls: () => `<div class="ac-chips">${PHASES.map((p, i) => `<span class="ac-chip" data-i="${i}">${p[0]}</span>`).join('')}</div>`,
    bind(root, st) { st.root = root; },
    draw(ctx, t, dt, st) {
      drawSpace(ctx, t, { bottom: '#10203d' });
      const cx = 380, cy = 1560, R = 1188;
      const atmo = ctx.createRadialGradient(cx, cy, R, cx, cy, R + 225);
      atmo.addColorStop(0, 'rgba(90,160,255,0.55)');
      atmo.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = atmo;
      ctx.beginPath(); ctx.arc(cx, cy, R + 225, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f6a36';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R + 222, Math.PI * 1.35, Math.PI * 1.65); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, 'top of the atmosphere', 520, 182, { size: 12, color: '#c9d6ea' });

      const path = FLIGHT_PATH;
      const u = clamp((t % 15) / 13, 0, 1);
      const [x, y, idx] = pathAt(path, u);
      const [nx, ny] = path.pts[Math.min(idx + 1, path.pts.length - 1)];
      const [px0, py0] = path.pts[Math.max(idx - 1, 0)];
      const angle = Math.atan2(nx - px0, -(ny - py0));

      let phase;
      if (y > 345) phase = 0;
      else if (x < 150) phase = 1;
      else if (x < 185) phase = 2;
      else if (x < 228) phase = 3;
      else if (x < 330) phase = 4;
      else if (x < 520) phase = 5;
      else phase = 6;

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      path.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff9a3d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= idx; i++) (i ? ctx.lineTo(...path.pts[i]) : ctx.moveTo(...path.pts[i]));
      ctx.lineTo(x, y);
      ctx.stroke();

      if (u < 0.02) st.sep = null;
      if (phase >= 3 && !st.sep) st.sep = { x, y, t };
      if (st.sep) {
        const s = t - st.sep.t;
        if (s < 5) drawRocket(ctx, { x: st.sep.x - s * 10, y: st.sep.y + s * s * 12, angle: s * 0.8, height: 22, width: 9, fins: true, alpha: clamp(1 - s / 5, 0, 1) });
      }
      const burning = phase <= 3 || phase === 5;
      drawRocket(ctx, { x, y, angle, height: phase >= 3 ? 26 : 44, width: 10, fins: phase < 3, stripe: phase >= 3 ? '#4fd1ff' : '#ff7a1a', flame: burning ? 0.9 : 0, t });

      if (u > 0.45) {
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath(); ctx.arc(380, 90, 4, 0, TAU); ctx.fill();
        label(ctx, 'apoapsis (highest point)', 380, 70, { size: 12, color: '#ffd27a' });
      }
      label(ctx, PHASES[phase][1], 300, 30, { size: 14, bg: 'rgba(4,8,16,0.8)' });

      if (phase !== st.phase && st.root) {
        st.phase = phase;
        st.root.querySelectorAll('.ac-chip').forEach((chip) => {
          const i = Number(chip.dataset.i);
          chip.classList.toggle('active', i === phase);
          chip.classList.toggle('done', i < phase);
        });
      }
    },
  },

  {
    id: 'mission',
    kicker: 'Lesson 9 · Your mission',
    title: 'Build a rocket that reaches orbit',
    simple: 'You now know the science. Here’s the plan engineers follow, and you will too:',
    extra: `<ol class="ac-steps">
        <li><span class="ico">${ICONS.nose.ogive}</span><span><b>Nose cone:</b> a pointed shape cuts drag.</span></li>
        <li><span class="ico">${ICONS.body.cylinder}</span><span><b>Body:</b> a cylinder is strong and light.</span></li>
        <li><span class="ico">${ICONS.fins.swept}</span><span><b>Fins:</b> keep the centre of pressure behind the centre of mass.</span></li>
        <li><span class="ico">⛓️</span><span><b>Stages:</b> use two, so the empty booster can drop away.</span></li>
        <li><span class="ico">${ICONS.engine.bell}</span><span><b>Engines:</b> a strong sea-level engine below, an efficient vacuum engine on top.</span></li>
        <li><span class="ico">⛽</span><span><b>Fuel:</b> Δv past the orbit marker, with liftoff TWR above about 1.3.</span></li>
        <li><span class="ico">${ICONS.guidance.standard}</span><span><b>Flight plan:</b> choose the Gravity Turn.</span></li>
        <li><span class="ico">🚀</span><span><b>Check the numbers are green, then LAUNCH!</b></span></li>
      </ol>
      <div class="ac-cta row">
        <button class="primary" data-action="guide">🧭 Guide me step by step</button>
        <button class="ghost" data-action="skip">I’ll build it myself</button>
      </div>`,
    draw(ctx, t) {
      drawSpace(ctx, t, { bottom: '#142648' });
      ctx.fillStyle = '#26303b';
      ctx.fillRect(0, 372, VW, 48);
      ctx.fillStyle = '#8c8f93';
      ctx.fillRect(240, 366, 120, 8);
      const c = t % 8;
      const ease = (start) => {
        const k = clamp((c - start) / 0.7, 0, 1);
        return 1 - (1 - k) ** 3;
      };
      const rise = c > 5.6 ? (c - 5.6) ** 2 * 70 : 0;
      const base = 366 - rise;
      const W = 44;
      const parts = [
        ['Engine', 0.2, () => { ctx.fillStyle = '#4a4d55'; ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(12, -16); ctx.lineTo(18, 0); ctx.lineTo(-18, 0); ctx.closePath(); ctx.fill(); }],
        ['Fuel tank', 1.1, () => { ctx.fillStyle = '#eef0f2'; ctx.fillRect(-W / 2, -166, W, 150); ctx.fillStyle = '#1c1f25'; ctx.fillRect(-W / 2, -80, W, 6); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(-W / 2, -150, W, 6); }],
        ['Fins', 2.0, () => { ctx.fillStyle = '#2f333b'; ctx.beginPath(); ctx.moveTo(-W / 2, -60); ctx.lineTo(-W, 0); ctx.lineTo(-W / 2, -10); ctx.closePath(); ctx.moveTo(W / 2, -60); ctx.lineTo(W, 0); ctx.lineTo(W / 2, -10); ctx.closePath(); ctx.fill(); }],
        ['Nose cone', 2.9, () => { ctx.fillStyle = '#eef0f2'; ctx.beginPath(); ctx.moveTo(-W / 2, -166); ctx.bezierCurveTo(-W / 2, -200, -8, -222, 0, -226); ctx.bezierCurveTo(8, -222, W / 2, -200, W / 2, -166); ctx.closePath(); ctx.fill(); }],
      ];
      if (c > 4) {
        ctx.save();
        ctx.translate(300, base);
        drawFlame(ctx, 16, 1.2, t, 0);
        ctx.restore();
      }
      let current = null;
      for (const [name, start, draw] of parts) {
        const e = ease(start);
        if (e <= 0) continue;
        if (e < 1) current = name;
        ctx.save();
        ctx.globalAlpha = e;
        ctx.translate(300, base - (1 - e) * 160);
        draw();
        ctx.restore();
      }
      const caption = c > 5.6 ? 'Liftoff!' : c > 4 ? 'Ignition' : c > 3.6 ? 'Ready to launch' : current;
      if (caption) label(ctx, caption, 300, 34, { size: 17, bg: 'rgba(4,8,16,0.75)' });
    },
  },
];

const CANNON = { x: 300, y: 225, R: 112, r0: 130, vc: 115 };
CANNON.GM = CANNON.vc * CANNON.vc * CANNON.r0;

function resetCannon(st) {
  st.px = CANNON.x;
  st.py = CANNON.y - CANNON.r0;
  st.vx = (st.speed / 100) * CANNON.vc;
  st.vy = 0;
  st.trail = [[st.px, st.py]];
  st.status = 'flying';
  st.timer = 0;
  st.travel = 0;
  st.lastAng = -Math.PI / 2;
}

const PHASES = [
  ['Liftoff', 'Full power, climbing straight up out of the thickest air'],
  ['Pitch over', 'Tilting a little at a time; gravity bends the path'],
  ['Max Q', 'Maximum air pressure on the rocket. Hold steady!'],
  ['Staging', 'The empty booster drops away; the upper stage lights'],
  ['Coast', 'Engine off, coasting up to the highest point (apoapsis)'],
  ['Circularize', 'At the top, burn sideways to lift the lowest point out of the air'],
  ['Orbit!', 'Periapsis is above the atmosphere. You are in orbit!'],
];

const FLIGHT_PATH = (() => {
  const key = [[110, 402], [110, 350], [120, 290], [152, 225], [205, 170], [275, 128], [340, 102], [380, 90], [450, 92], [520, 97], [590, 105], [640, 113]];
  const pts = [];
  for (let i = 0; i < key.length - 1; i++) {
    const p0 = key[Math.max(i - 1, 0)], p1 = key[i], p2 = key[i + 1], p3 = key[Math.min(i + 2, key.length - 1)];
    for (let j = 0; j < 12; j++) {
      const s = j / 12, s2 = s * s, s3 = s2 * s;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * s + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(key[key.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
})();

function pathAt(path, u) {
  const d = u * path.total;
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < d) i++;
  const a = path.pts[i - 1], b = path.pts[i];
  const seg = path.cum[i] - path.cum[i - 1] || 1;
  const k = (d - path.cum[i - 1]) / seg;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, i - 1];
}

// ---------------- Academy overlay ----------------
export class Academy {
  constructor({ onGuide, onClose } = {}) {
    this.onGuide = onGuide;
    this.onClose = onClose;
    this.index = 0;
    this.open_ = false;
    this.t = 0;
    let science = true;
    try { science = localStorage.getItem('orbitforge.science') !== 'off'; } catch { /* storage unavailable */ }

    const root = document.createElement('div');
    root.className = `academy${science ? '' : ' hide-science'}`;
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Orbit Forge Academy');
    root.innerHTML = `
      <div class="ac-card">
        <div class="ac-head">
          <div class="ac-brand">🎓 Academy</div>
          <div class="ac-dots">${SLIDES.map((s, i) => `<button type="button" class="ac-dot" data-i="${i}" aria-label="${i === 0 ? 'Welcome' : `Lesson ${i}`}"></button>`).join('')}</div>
          <label class="ac-toggle"><input type="checkbox" ${science ? 'checked' : ''}> Show the science</label>
          <button type="button" class="ac-close" aria-label="Close">✕</button>
        </div>
        <div class="ac-body">
          <div class="ac-stage">
            <div class="ac-canvas-wrap"><canvas></canvas></div>
            <div class="ac-controls"></div>
          </div>
          <div class="ac-text"></div>
        </div>
        <div class="ac-foot">
          <button type="button" class="ghost ac-prev">← Back</button>
          <span class="ac-count"></span>
          <button type="button" class="primary ac-next">Next →</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.textEl = root.querySelector('.ac-text');
    this.controlsEl = root.querySelector('.ac-controls');

    root.querySelector('.ac-close').onclick = () => this.close();
    root.querySelector('.ac-prev').onclick = () => this.go(this.index - 1);
    root.querySelector('.ac-next').onclick = () => (this.index >= SLIDES.length - 1 ? this.close() : this.go(this.index + 1));
    root.querySelectorAll('.ac-dot').forEach((d) => { d.onclick = () => this.go(Number(d.dataset.i)); });
    root.querySelector('.ac-toggle input').addEventListener('change', (e) => {
      root.classList.toggle('hide-science', !e.target.checked);
      try { localStorage.setItem('orbitforge.science', e.target.checked ? 'on' : 'off'); } catch { /* storage unavailable */ }
    });
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    window.addEventListener('keydown', (e) => {
      if (!this.open_) return;
      if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
      if (e.key === 'ArrowRight') this.go(this.index + 1);
      else if (e.key === 'ArrowLeft') this.go(this.index - 1);
      else if (e.key === 'Escape') this.close();
      else return;
      e.preventDefault();
    });
  }

  get isOpen() {
    return this.open_;
  }

  open(index = 0) {
    this.root.hidden = false;
    const wasOpen = this.open_;
    this.open_ = true;
    this.go(index);
    if (!wasOpen) {
      this.last = performance.now();
      scheduleFrame((now) => this.tick(now));
    }
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.root.hidden = true;
    try { localStorage.setItem('orbitforge.seenIntro', '1'); } catch { /* storage unavailable */ }
    if (this.onClose) this.onClose();
  }

  go(i) {
    i = clamp(i, 0, SLIDES.length - 1);
    this.index = i;
    const s = SLIDES[i];
    this.st = s.state ? s.state() : {};
    this.t = 0;

    const science = s.science
      ? `<div class="ac-science"><div class="ac-label">🔬 The science</div>${s.science.formula ? `<div class="ac-formula">${s.science.formula}</div>` : ''}<p>${s.science.text}</p></div>`
      : '';
    this.textEl.innerHTML = `
      <div class="ac-kicker">${s.kicker}</div>
      <h2 class="ac-title">${s.title}</h2>
      <p class="ac-simple">${s.simple}</p>
      ${s.tryIt ? `<div class="ac-try">👉 ${s.tryIt}</div>` : ''}
      ${science}
      ${s.fact ? `<div class="ac-fact"><div class="ac-label">🌍 Real-world fact</div><p>${s.fact}</p></div>` : ''}
      ${s.extra || ''}`;
    this.textEl.scrollTop = 0;
    this.textEl.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        const a = b.dataset.action;
        if (a === 'start') this.go(1);
        else if (a === 'skip') this.close();
        else if (a === 'guide') {
          this.close();
          if (this.onGuide) this.onGuide();
        }
      });
    });

    this.controlsEl.innerHTML = s.controls ? s.controls(this.st) : '';
    if (s.bind) s.bind(this.controlsEl, this.st);

    this.root.querySelectorAll('.ac-dot').forEach((d, k) => {
      d.classList.toggle('active', k === i);
      d.classList.toggle('done', k < i);
    });
    const foot = this.root.querySelector('.ac-foot');
    foot.hidden = i === 0;
    this.root.querySelector('.ac-prev').disabled = i === 0;
    this.root.querySelector('.ac-count').textContent = i === 0 ? '' : `Lesson ${i} of ${SLIDES.length - 1}`;
    this.root.querySelector('.ac-next').textContent = i === SLIDES.length - 1 ? 'Start building →' : 'Next →';
  }

  tick(now) {
    if (!this.open_) return;
    const dt = Math.min((now - this.last) / 1000, 0.05) * (reduceMotion ? 0.4 : 1);
    this.last = now;
    this.t += dt;

    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (w > 0 && h > 0) {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, h);
      const k = Math.min(w / VW, h / VH);
      ctx.save();
      ctx.translate((w - VW * k) / 2, (h - VH * k) / 2);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.rect(0, 0, VW, VH);
      ctx.clip();
      SLIDES[this.index].draw(ctx, this.t, dt, this.st);
      ctx.restore();
    }
    scheduleFrame((n) => this.tick(n));
  }
}
