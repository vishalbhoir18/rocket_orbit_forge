// Small inline SVG icons for the part pickers. Styled via CSS (currentColor).
const svg = (inner, cls = '') => `<svg viewBox="0 0 48 48" class="${cls}" aria-hidden="true">${inner}</svg>`;

const body = '<rect x="19" y="4" width="10" height="40" rx="1.5" class="soft"/>';

export const ICONS = {
  nose: {
    ogive: svg('<path d="M24 4 C31 13 34 25 34 44 H14 C14 25 17 13 24 4Z"/>'),
    cone: svg('<path d="M24 4 L34 44 H14Z"/>'),
    rounded: svg('<path d="M14 44 V30 C14 22 18 16 24 16 C30 16 34 22 34 30 V44Z"/>'),
    flat: svg('<path d="M16 32 H32 L34 36 V44 H14 V36Z"/>'),
  },
  body: {
    cylinder: svg('<rect x="15" y="5" width="18" height="38" rx="2"/><path d="M15 12 H33 M15 36 H33" class="line"/>'),
    tapered: svg('<path d="M19.5 5 H28.5 L34 43 H14Z"/>'),
    box: svg('<path d="M13 9 H35 V43 H13Z"/><path d="M13 9 L18 5 H40 L35 9 M35 43 L40 39 V5" class="line"/>'),
    spheres: svg('<circle cx="24" cy="11" r="7"/><circle cx="24" cy="24" r="7"/><circle cx="24" cy="37" r="7"/>'),
  },
  fins: {
    none: svg(body),
    delta: svg(body + '<path d="M19 26 L9 44 H19Z M29 26 L39 44 H29Z"/>'),
    swept: svg(body + '<path d="M19 27 L9 39 V46 L19 41Z M29 27 L39 39 V46 L29 41Z"/>'),
    rect: svg(body + '<path d="M19 28 H6 V44 H19Z M29 28 H42 V44 H29Z"/>'),
  },
  engine: {
    bell: svg('<rect x="15" y="4" width="18" height="8" rx="1"/><path d="M21 12 H27 C27 24 33 33 37 44 H11 C15 33 21 24 21 12Z"/>'),
    cone: svg('<rect x="15" y="4" width="18" height="8" rx="1"/><path d="M21 12 H27 L35 44 H13Z"/>'),
    aerospike: svg('<rect x="10" y="4" width="28" height="9" rx="1"/><path d="M13 13 H35 C30 22 28 32 27 43 H21 C20 32 18 22 13 13Z"/>'),
    vacuum: svg('<rect x="18" y="4" width="12" height="7" rx="1"/><path d="M22 11 H26 C26 22 38 32 45 44 H3 C10 32 22 22 22 11Z"/>'),
    cluster: svg('<rect x="8" y="4" width="32" height="8" rx="1"/><path d="M11 12 H15 C15 22 18 30 20 40 H6 C8 30 11 22 11 12Z M22 12 H26 C26 24 29 34 31 44 H17 C19 34 22 24 22 12Z M33 12 H37 C37 22 40 30 42 40 H28 C30 30 33 22 33 12Z"/>'),
  },
  guidance: {
    standard: svg('<path d="M10 44 C10 24 20 11 41 8" class="line thick"/><path d="M35 3 L42 8 L36 13" class="line thick"/>'),
    gentle: svg('<path d="M14 44 C14 20 19 9 39 5" class="line thick"/><path d="M33 1 L40 5 L34 10" class="line thick"/>'),
    aggressive: svg('<path d="M9 44 C13 31 24 26 43 25" class="line thick"/><path d="M37 20 L44 25 L37 30" class="line thick"/>'),
    straight: svg('<path d="M24 45 V7" class="line thick"/><path d="M18 13 L24 5 L30 13" class="line thick"/>'),
    manual: svg('<rect x="5" y="15" width="38" height="20" rx="10"/><path d="M14 21 V29 M10 25 H18" class="line thick"/><circle cx="31" cy="22" r="2.2" class="dot"/><circle cx="36" cy="28" r="2.2" class="dot"/>'),
  },
};

export const OUTCOME_ICONS = {
  orbit: '🛰️', escape: '☄️', crash: '💥', aero: '💥', maxq: '💥', reentry: '🔥', g: '💥', pad: '🪨',
};
