// Step-by-step guided first launch, and science tips that pop up during flight.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STEPS = [
  {
    title: 'Welcome to the hangar',
    text: 'Let’s build a rocket that can reach orbit, one part at a time. Every choice changes the 3D rocket in the middle and the numbers on the right.',
    fact: 'Real rocket engineers balance the same four things you will: weight, thrust, drag and stability.',
  },
  {
    target: '[data-tour="nose"]',
    title: 'Nose cone',
    text: 'The nose splits the air in front of the rocket. A smooth, pointed shape has the least drag.',
    task: 'Choose the Ogive nose.',
    done: (d) => d.nose === 'ogive',
    apply: (d) => { d.nose = 'ogive'; },
    fact: 'Drag grows with the square of speed: twice as fast means four times the drag.',
  },
  {
    target: '[data-tour="body"]',
    title: 'Body shape',
    text: 'The body holds the fuel tanks. A cylinder is strong, light, and slips through the air easily.',
    task: 'Choose the Cylinder.',
    done: (d) => d.body === 'cylinder',
    apply: (d) => { d.body = 'cylinder'; },
    fact: 'Rocket tanks are pressurized like a drink can, and round shapes spread that pressure evenly.',
  },
  {
    target: '[data-tour="fins"]',
    title: 'Fins',
    text: 'Fins at the back keep the rocket pointing forward, like the feathers on an arrow.',
    task: 'Choose Swept fins.',
    done: (d) => d.fins === 'swept',
    apply: (d) => { d.fins = 'swept'; },
    fact: 'Fins move the centre of pressure behind the centre of mass. That’s what makes a rocket stable.',
  },
  {
    target: '[data-tour="stages"]',
    title: 'Stages',
    text: 'With two stages, the empty booster falls away partway up, so the upper stage pushes a much lighter rocket.',
    task: 'Select 2 stages.',
    done: (d) => d.stages.length === 2,
    apply: (d) => {
      d.stages = [d.stages[0] || { engine: 'bell', tank: 10 }, d.stages[1] || { engine: 'vacuum', tank: 4 }];
    },
    fact: 'The Saturn V moon rocket used three stages.',
  },
  {
    target: '[data-tour="engine-0"]',
    title: 'Booster engine',
    text: 'The bottom engine fires in thick air at sea level and has to lift the whole rocket off the pad.',
    task: 'Give stage 1 the Bell Nozzle.',
    done: (d) => d.stages[0].engine === 'bell',
    apply: (d) => { d.stages[0].engine = 'bell'; },
    fact: 'Sea-level nozzles are short because outside air pressure would squeeze the exhaust inside a big nozzle.',
  },
  {
    target: '[data-tour="engine-1"]',
    title: 'Upper-stage engine',
    text: 'The upper stage fires in near-vacuum, where a huge nozzle squeezes extra speed out of every kilogram of fuel.',
    task: 'Give stage 2 the Vacuum Bell.',
    skip: (d) => d.stages.length < 2,
    done: (d) => !!d.stages[1] && d.stages[1].engine === 'vacuum',
    apply: (d) => { if (d.stages[1]) d.stages[1].engine = 'vacuum'; },
    fact: 'Falcon 9’s vacuum Merlin engine gets over 20% more efficiency (Isp) than the sea-level version, mostly thanks to its giant nozzle.',
  },
  {
    target: '[data-tour="tank-0"]',
    title: 'Fuel',
    text: 'More fuel means more Δv (your speed budget), but also a heavier rocket. Adjust the tank sliders until Δv passes the orbit marker while liftoff TWR stays above about 1.3.',
    task: 'Get Δv above 3,800 m/s with TWR above 1.3.',
    done: (d, s) => s.totalDv >= 3800 && s.liftoffTWR >= 1.3,
    apply: (d) => {
      d.stages[0].tank = 10;
      if (d.stages[1]) d.stages[1].tank = 4;
    },
    fact: 'Tsiolkovsky’s rocket equation explains the trade-off: speed gained depends on the logarithm of full mass ÷ empty mass.',
  },
  {
    target: '[data-tour="guidance"]',
    title: 'Flight plan',
    text: 'The Gravity Turn climbs first, then tilts gradually and lets gravity bend the path toward orbit.',
    task: 'Choose Gravity Turn.',
    done: (d) => d.guidance === 'standard',
    apply: (d) => { d.guidance = 'standard'; },
    fact: 'Real rockets start tilting within seconds of launch. Flying straight up and turning later would waste a lot of fuel.',
  },
  {
    target: '[data-tour="analysis"]',
    title: 'Pre-flight check',
    text: 'Engineers check the numbers before every launch. A green TWR and a Δv bar past the orbit marker mean you’re ready. Below, the stability line should show CP behind CM.',
    fact: 'Before liftoff, launch teams run a “go/no-go” poll: every system must answer “go”.',
  },
  {
    target: '[data-tour="launch"]',
    title: 'Launch!',
    text: 'Press LAUNCH and watch your rocket fly. Science tips will explain each moment of the flight.',
    task: 'Press LAUNCH.',
    waitLaunch: true,
  },
];

export class Guide {
  constructor({ getDesign, getStats, setDesign }) {
    this.getDesign = getDesign;
    this.getStats = getStats;
    this.setDesign = setDesign;
    this.active = false;
    this.i = 0;
    this.advancing = false;

    this.hole = document.createElement('div');
    this.hole.className = 'guide-hole';
    this.hole.hidden = true;
    this.card = document.createElement('div');
    this.card.className = 'guide-card';
    this.card.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-live', 'polite');
    document.body.append(this.hole, this.card);
    window.addEventListener('resize', () => this.active && this.position());
  }

  start() {
    this.active = true;
    this.card.hidden = false;
    clearInterval(this.interval);
    this.interval = setInterval(() => this.position(), 250);
    this.show(0);
  }

  stop() {
    this.active = false;
    this.advancing = false;
    clearTimeout(this.advanceTimer);
    clearInterval(this.interval);
    this.card.hidden = true;
    this.hole.hidden = true;
  }

  show(i, dir = 1) {
    const d = this.getDesign();
    while (i >= 0 && i < STEPS.length && STEPS[i].skip && STEPS[i].skip(d)) i += dir;
    if (i >= STEPS.length) {
      this.stop();
      return;
    }
    this.i = clamp(i, 0, STEPS.length - 1);
    this.advancing = false;
    clearTimeout(this.advanceTimer);
    this.render();
    const step = STEPS[this.i];
    const target = step.target && document.querySelector(step.target);
    if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.position();
  }

  render(justDone = false) {
    const step = STEPS[this.i];
    const done = step.done ? step.done(this.getDesign(), this.getStats()) : false;
    const task = step.task
      ? `<div class="guide-task ${done ? 'done' : ''}"><span>${done ? '✓' : '👉'}</span><span>${done ? (justDone ? 'Nice! ' : 'Already set. ') : ''}${step.task}</span></div>`
      : '';
    let nextLabel = 'Next';
    if (step.task && !done) nextLabel = 'Skip';
    this.card.innerHTML = `
      <button type="button" class="guide-x" aria-label="Exit guide">✕</button>
      <div class="guide-step">Step ${this.i + 1} of ${STEPS.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      ${task}
      ${step.fact ? `<div class="guide-fact">💡 ${step.fact}</div>` : ''}
      <div class="guide-actions">
        ${this.i > 0 ? '<button type="button" class="ghost small spacer" data-a="back">← Back</button>' : '<span class="spacer"></span>'}
        ${step.apply && !done ? '<button type="button" class="ghost small" data-a="apply">Do it for me</button>' : ''}
        ${step.waitLaunch ? '' : `<button type="button" class="primary small" data-a="next">${nextLabel} →</button>`}
      </div>`;
    this.card.querySelector('.guide-x').onclick = () => this.stop();
    this.card.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'back') this.show(this.i - 1, -1);
        else if (a === 'next') this.show(this.i + 1);
        else if (a === 'apply') {
          const d = JSON.parse(JSON.stringify(this.getDesign()));
          step.apply(d);
          this.setDesign(d);
          this.onDesignChange();
        }
      };
    });
  }

  onDesignChange() {
    if (!this.active) return;
    const step = STEPS[this.i];
    if (!step.done) return;
    const done = step.done(this.getDesign(), this.getStats());
    if (done && !this.advancing) {
      this.advancing = true;
      this.render(true);
      this.advanceTimer = setTimeout(() => this.show(this.i + 1), 1400);
    } else if (!done) {
      this.advancing = false;
      clearTimeout(this.advanceTimer);
      this.render();
    }
  }

  onLaunch() {
    if (this.active) this.stop();
  }

  position() {
    if (!this.active) return;
    const step = STEPS[this.i];
    const target = step.target && document.querySelector(step.target);
    const cw = this.card.offsetWidth || 330;
    const ch = this.card.offsetHeight || 220;
    if (!target || !target.getClientRects().length) {
      this.hole.hidden = true;
      this.card.style.left = `${(window.innerWidth - cw) / 2}px`;
      this.card.style.top = `${Math.max(70, (window.innerHeight - ch) / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.hole.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    this.hole.hidden = false;
    let left = r.left + r.width / 2 < window.innerWidth / 2 ? r.right + 22 : r.left - cw - 22;
    left = clamp(left, 8, window.innerWidth - cw - 8);
    const top = clamp(r.top, 64, window.innerHeight - ch - 12);
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;
  }
}

const FACTS = {
  countdown: { icon: '⏱️', title: 'Countdown', text: 'The first person in space, Yuri Gagarin, launched on 12 April 1961 and circled Earth once in a flight lasting 108 minutes.' },
  liftoff: { icon: '🚀', title: 'Liftoff!', text: 'Thrust is now bigger than weight, so the rocket accelerates upward. Hot gas goes down and the rocket goes up: Newton’s third law.' },
  supersonic: { icon: '💨', title: 'Faster than sound', text: 'You just passed Mach 1. On Earth the speed of sound near the ground is about 343 m/s, and crossing it creates a sonic boom.' },
  maxq: { icon: '📈', title: 'Max Q', text: 'That was the moment of greatest air pressure on the rocket (½ × ρ × v²). From here the air thins out faster than the rocket speeds up.' },
  stage: { icon: '⛓️', title: 'Staging', text: 'The empty booster falls away. The upper stage now pushes a much lighter rocket, so it gains speed quickly.' },
  space: { icon: '🌌', title: 'Welcome to space', text: 'Above 70 km this planet has almost no air. On Earth, space is usually said to start at the Kármán line, 100 km up.' },
  meco: { icon: '⏹️', title: 'Engine cut-off', text: 'The highest point of the path (apoapsis) is now high enough. The rocket coasts upward like a ball thrown into the air.' },
  circ: { icon: '🔥', title: 'Circularization burn', text: 'Firing sideways near the top of the path raises the lowest point (periapsis). Orbit is about sideways speed, not just height.' },
  orbit: { icon: '🛰️', title: 'You’re in orbit!', text: 'The rocket is falling around the planet fast enough to keep missing the ground, just like Newton’s cannonball.' },
  escape: { icon: '☄️', title: 'Escape velocity', text: 'You’re going fast enough to leave the planet for good. From Earth’s surface that takes about 11.2 km/s.' },
};

export class FlightFacts {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('orbitforge.tips') !== 'off'; } catch { /* storage unavailable */ }
    this.seen = new Set();
    this.queue = [];
    this.el = document.createElement('div');
    this.el.className = 'fact-pop';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    document.body.appendChild(this.el);
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('orbitforge.tips', on ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (!on) this.hide();
  }

  reset() {
    this.seen.clear();
    this.hide();
  }

  onEvent(e) {
    let key = null;
    if (['liftoff', 'supersonic', 'maxq', 'stage', 'space', 'meco', 'circ'].includes(e.type)) key = e.type;
    else if (e.type === 'outcome' && (e.outcome.type === 'orbit' || e.outcome.type === 'escape')) key = e.outcome.type;
    if (key) this.show(key);
  }

  show(key) {
    if (!this.enabled || this.seen.has(key) || !FACTS[key]) return;
    this.seen.add(key);
    this.queue.push(FACTS[key]);
    if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2);
    if (this.el.hidden) this.next();
  }

  next() {
    clearTimeout(this.timer);
    const f = this.queue.shift();
    if (!f) {
      this.el.hidden = true;
      return;
    }
    const ms = 9000;
    this.el.innerHTML = `
      <button type="button" class="fact-close" aria-label="Dismiss">✕</button>
      <div class="ac-label">🔬 Science moment</div>
      <h4>${f.icon} ${f.title}</h4>
      <p>${f.text}</p>
      <div class="fact-bar" style="animation-duration:${ms}ms"></div>`;
    this.el.hidden = false;
    this.el.querySelector('.fact-close').onclick = () => this.next();
    this.timer = setTimeout(() => this.next(), ms);
  }

  hide() {
    clearTimeout(this.timer);
    this.queue.length = 0;
    this.el.hidden = true;
  }
}
