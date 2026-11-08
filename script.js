/* =========================================================
   Basketball Hoopers – script.js
   Sections: Data · Storage · AuthService · Validation · UI · Effects
   ========================================================= */

/* ---------- Data: registered players ----------
   A real backend / database would replace this list.
   Hash = SHA-256 of "email:password". */
const PLAYERS = [
  { email: 'mj23@hoopers.com',   hash: 'd9c27b5630f2fbb2079b31db6f7b08ed64578931fa7d1e508e07c626918e8632', name: 'MJ',     number: '#23', position: 'Guard',   team: 'Bulls'    },
  { email: 'lebron@hoopers.com', hash: '6fe8f1b18a2ae19e6bbb680d249a716f0f0e215fc28ae3cbdfaf3aed377d5fc4', name: 'LeBron', number: '#6',  position: 'Forward', team: 'Kings'    },
  { email: 'curry@hoopers.com',  hash: '856f55e5394eae28cbc03ac54ff4d7788a15e5adc1bdd4586a74a7fb5dccbd8c', name: 'Curry',  number: '#30', position: 'Guard',   team: 'Splash'   }
];
const MAX_TRIES = 5, LOCK_SECONDS = 30;

/* ---------- Storage helpers ---------- */
const Store = {
  get(k, fb, area = localStorage) { try { const v = area.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v, area = localStorage) { try { area.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k, area = localStorage) { try { area.removeItem(k); } catch {} }
};

/* ---------- Auth service ---------- */
const AuthService = (() => {
  const SESSION = 'hoopers:session', LOCK = 'hoopers:lock';
  const mem = { session: null };
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

  // NOTE: client-side check is for the prototype only. Production needs server-side authentication.
  async function sha256(text) {
    if (!(window.crypto && crypto.subtle)) throw new Error('SECURE_CONTEXT');
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  }
  const pub = p => p ? { email: p.email, name: p.name, number: p.number, position: p.position, team: p.team } : null;

  return {
    lockLeft() { return Math.max(0, Math.ceil((Store.get(LOCK, { until: 0 }).until - Date.now()) / 1000)); },
    async login(email, password, remember) {
      if (this.lockLeft() > 0) return { ok: false, locked: true };
      email = email.trim().toLowerCase();
      let digest;
      try { digest = await sha256(email + ':' + password); }
      catch { return { ok: false, error: 'A secure (HTTPS) connection is required to log in.' }; }

      const player = PLAYERS.find(p => p.email === email && p.hash === digest);
      const lock = Store.get(LOCK, { n: 0, until: 0 });
      if (!player) {
        lock.n += 1;
        if (lock.n >= MAX_TRIES) { Store.set(LOCK, { n: 0, until: Date.now() + LOCK_SECONDS * 1000 }); return { ok: false, locked: true }; }
        Store.set(LOCK, lock);
        return { ok: false, error: 'Incorrect email or password.' };
      }
      Store.del(LOCK);
      this.logout();
      const area = remember ? localStorage : sessionStorage;
      if (!Store.set(SESSION, { email: player.email }, area)) mem.session = { email: player.email };
      return { ok: true };
    },
    current() {
      const s = Store.get(SESSION, null, localStorage) ?? Store.get(SESSION, null, sessionStorage) ?? mem.session;
      return s ? pub(PLAYERS.find(p => p.email === s.email)) : null;
    },
    logout() { Store.del(SESSION, localStorage); Store.del(SESSION, sessionStorage); mem.session = null; }
  };
})();

/* ---------- Validation ---------- */
const Validate = {
  email: v => !v.trim() ? 'Email is required.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter a valid email address.',
  password: v => !v ? 'Password is required.' : v.length < 8 ? 'Password must be at least 8 characters.' : ''
};

/* ---------- UI helpers ---------- */
const $ = id => document.getElementById(id);
const flash = (type, text) => { const m = $('msg'); m.className = 'msg show ' + type; m.textContent = text; };
const clearFlash = () => { $('msg').className = 'msg'; };
function setErr(id, text) {
  document.querySelector(`[data-for="${id}"]`).textContent = text;
  $(id).classList.toggle('bad', !!text);
  return !text;
}

function render() {
  const user = AuthService.current();
  $('loginView').hidden = !!user;
  $('dashView').hidden = !user;
  if (user) {
    $('dName').textContent = user.name;
    $('dNum').textContent = user.number;
    $('dPos').textContent = user.position;
    $('dTeam').textContent = user.team;
    $('dInfo').textContent = user.email;
  } else {
    lockWatch();
  }
}

/* ---------- Lockout countdown ---------- */
let lockTimer = null;
function lockWatch() {
  clearInterval(lockTimer);
  const btn = $('loginBtn'), label = $('btnLabel');
  const tick = () => {
    const left = AuthService.lockLeft();
    if (left > 0) {
      btn.disabled = true; label.textContent = `Locked · ${left}s`;
      flash('err', 'Too many failed attempts. Please wait before trying again.');
    } else {
      clearInterval(lockTimer); btn.disabled = false; label.textContent = 'Log in';
      if ($('msg').textContent.startsWith('Too many')) clearFlash();
    }
  };
  if (AuthService.lockLeft() > 0) { tick(); lockTimer = setInterval(tick, 1000); }
}

/* ---------- Events ---------- */
$('eye').addEventListener('click', () => {
  const p = $('password'), hide = p.type === 'password';
  p.type = hide ? 'text' : 'password'; $('eye').textContent = hide ? 'Hide' : 'Show';
});
$('email').addEventListener('input', e => { clearFlash(); setErr('email', e.target.value ? Validate.email(e.target.value) : ''); });
$('password').addEventListener('input', e => { clearFlash(); setErr('password', e.target.value ? Validate.password(e.target.value) : ''); });

document.querySelectorAll('.demo-item').forEach(b => b.addEventListener('click', () => {
  $('email').value = b.dataset.email; $('password').value = b.dataset.pass;
  setErr('email', ''); setErr('password', ''); clearFlash();
}));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); clearFlash();
  if (AuthService.lockLeft() > 0) return lockWatch();
  const email = $('email').value, pw = $('password').value;
  const ok = [setErr('email', Validate.email(email)), setErr('password', Validate.password(pw))].every(Boolean);
  if (!ok) return;

  const btn = $('loginBtn'), label = $('btnLabel');
  btn.disabled = true; label.innerHTML = '<span class="spin"></span> Logging in';
  await new Promise(r => setTimeout(r, 600));
  const r = await AuthService.login(email, pw, $('remember').checked);
  btn.disabled = false; label.textContent = 'Log in';

  if (r.locked) return lockWatch();
  if (!r.ok) return flash('err', r.error);
  e.target.reset(); render();
});

$('logoutBtn').addEventListener('click', () => { AuthService.logout(); render(); flash('ok', 'You have been logged out.'); });

/* ---------- Effect 1: bubbles rising from the top of the card ---------- */
(function bubbles() {
  const box = $('bubbles');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function spawn() {
    const b = document.createElement('span');
    const size = 8 + Math.random() * 20;
    b.style.width = b.style.height = size + 'px';
    b.style.left = (6 + Math.random() * 88) + '%';
    b.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    b.style.animationDuration = (2.6 + Math.random() * 2.4) + 's';
    box.appendChild(b);
    setTimeout(() => b.remove(), 5200);
  }
  setInterval(spawn, 260);
})();

/* ---------- Effect 2: black smoke rising + embers (canvas) ---------- */
(function smoke() {
  const cv = $('smoke'), ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, puffs = [], embers = [];
  function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
  size(); addEventListener('resize', size);

  const rnd = (a, b) => a + Math.random() * (b - a);
  function newPuff() {
    return { x: rnd(0, W), y: H + 40, r: rnd(40, 110), vy: rnd(.35, 1), vx: rnd(-.25, .25), a: rnd(.12, .3), life: 0, max: rnd(420, 760), grow: rnd(.25, .5) };
  }
  function newEmber() {
    return { x: rnd(0, W), y: H + 10, r: rnd(1, 2.8), vy: rnd(.8, 2.2), vx: rnd(-.4, .4), a: 1, life: 0, max: rnd(120, 280) };
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    if (puffs.length < (W < 600 ? 22 : 40) && Math.random() < .4) puffs.push(newPuff());
    if (embers.length < 40 && Math.random() < .5) embers.push(newEmber());

    for (const p of puffs) {                       // smoke
      p.life++; p.y -= p.vy; p.x += p.vx + Math.sin(p.life / 40) * .25; p.r += p.grow;
      const t = p.life / p.max, alpha = p.a * Math.sin(Math.min(1, t) * Math.PI);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(30,30,30,${alpha})`);
      g.addColorStop(.6, `rgba(12,12,12,${alpha * .6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    puffs = puffs.filter(p => p.life < p.max);

    ctx.globalCompositeOperation = 'lighter';     // embers
    for (const e of embers) {
      e.life++; e.y -= e.vy; e.x += e.vx + Math.sin(e.life / 12) * .5;
      const a = 1 - e.life / e.max;
      ctx.fillStyle = `rgba(255,${120 + Math.random() * 80 | 0},30,${Math.max(a, 0)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    embers = embers.filter(e => e.life < e.max);

    requestAnimationFrame(frame);
  }
  if (!reduce) frame();
})();

/* ---------- Init ---------- */
render();
