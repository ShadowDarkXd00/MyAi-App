export interface Template {
  id: string
  name: string
  desc: string
  icon: string
  color: string
  files: Record<string, string>
  entry: string
}

const shell = (title: string, body: string, extra = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { --a1:#7c5cff; --a2:#22d3ee; --ink:#eef0f7; --bg:#07080d; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  ${extra}
</style>
</head>
<body>
${body}
</body>
</html>
`

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank page',
    desc: 'Clean HTML + CSS starter, safe-area aware',
    icon: 'code',
    color: '#7c5cff',
    entry: 'index.html',
    files: {
      'index.html': shell(
        'New page',
        `  <main class="wrap">
    <h1>Hello, world</h1>
    <p>Edit this file in Studio — or ask the agent to build something here.</p>
  </main>`,
        `.wrap { max-width: 640px; margin: 0 auto; padding: 64px 22px; }
h1 { font-size: clamp(30px, 8vw, 46px); letter-spacing: -.03em; margin: 0 0 12px; }
p { color: #a8aec1; line-height: 1.7; }`,
      ),
    },
  },
  {
    id: 'landing',
    name: 'Landing page',
    desc: 'Gradient hero, feature cards, animated CTA',
    icon: 'palette',
    color: '#f472b6',
    entry: 'index.html',
    files: {
      'index.html': shell(
        'Studio · Landing',
        `  <div class="glow"></div>
  <main class="wrap">
    <nav>
      <div class="logo"><span class="dot"></span> Studio</div>
      <button class="pill">Get started</button>
    </nav>
    <section class="hero">
      <h1>Build something<br /><span>worth sharing.</span></h1>
      <p>A single page, a strong idea, and thirty seconds. Make the web feel handmade again.</p>
      <div class="row">
        <button class="cta">Start free</button>
        <button class="ghost">See the demo</button>
      </div>
    </section>
    <section class="cards">
      <article><b>01</b><h3>Fast</h3><p>No build step, no bundler. Just files.</p></article>
      <article><b>02</b><h3>Yours</h3><p>Every pixel is editable in the Studio tab.</p></article>
      <article><b>03</b><h3>Alive</h3><p>Motion that responds to the thumb, not the mouse.</p></article>
    </section>
  </main>`,
        `body { overflow-x: hidden; }
.glow {
  position: fixed; inset: -30% -10% auto -10%; height: 70vh; pointer-events: none;
  background: radial-gradient(45% 50% at 25% 30%, rgba(124,92,255,.5), transparent 70%),
              radial-gradient(40% 45% at 80% 20%, rgba(34,211,238,.35), transparent 70%);
  filter: blur(30px);
}
.wrap { position: relative; max-width: 960px; margin: 0 auto; padding: 22px; }
nav { display: flex; align-items: center; justify-content: space-between; padding: 10px 0 40px; }
.logo { display: flex; align-items: center; gap: 9px; font-weight: 700; letter-spacing: -.02em; }
.dot { width: 22px; height: 22px; border-radius: 8px; background: linear-gradient(135deg, var(--a1), var(--a2)); }
.pill { height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.05); color: var(--ink); font-size: 13px; }
.hero { padding: 30px 0 60px; }
h1 { font-size: clamp(38px, 10vw, 68px); line-height: 1.03; letter-spacing: -.045em; margin: 0 0 18px; }
h1 span { background: linear-gradient(120deg, var(--a1), var(--a2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero p { max-width: 460px; color: #a8aec1; line-height: 1.7; font-size: 16px; }
.row { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
.cta { height: 50px; padding: 0 26px; border: 0; border-radius: 999px; font-weight: 650; color: #fff;
  background: linear-gradient(135deg, var(--a1), var(--a2)); box-shadow: 0 18px 40px -16px rgba(124,92,255,.9);
  transition: transform .18s cubic-bezier(.22,1.2,.36,1); }
.cta:active { transform: scale(.96); }
.ghost { height: 50px; padding: 0 22px; border-radius: 999px; background: transparent;
  border: 1px solid rgba(255,255,255,.16); color: var(--ink); }
.cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); padding-bottom: 40px; }
.cards article { padding: 20px; border-radius: 22px; border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.035); backdrop-filter: blur(12px); }
.cards b { color: var(--a2); font-size: 11px; letter-spacing: .14em; }
.cards h3 { margin: 10px 0 6px; font-size: 17px; letter-spacing: -.02em; }
.cards p { margin: 0; color: #99a0b3; font-size: 13.5px; line-height: 1.6; }`,
      ),
    },
  },
  {
    id: 'game',
    name: 'Canvas game',
    desc: 'Neon dodge — touch + keyboard, score, juice',
    icon: 'gamepad',
    color: '#4ade80',
    entry: 'index.html',
    files: {
      'index.html': shell(
        'Neon Dodge',
        `  <canvas id="c"></canvas>
  <div class="hud"><span id="score">0</span><small>points</small></div>
  <div class="overlay" id="overlay">
    <h1>Neon Dodge</h1>
    <p>Move with your thumb or arrow keys. Survive.</p>
    <button id="play">Play</button>
  </div>
  <script>
    const c = document.getElementById('c'), x = c.getContext('2d');
    const scoreEl = document.getElementById('score'), overlay = document.getElementById('overlay');
    let w, h, dpr, ship, rocks, score, playing, t, spawnT, last;
    const keys = {};
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', resize);
    addEventListener('keydown', e => { keys[e.key] = true; });
    addEventListener('keyup', e => { keys[e.key] = false; });
    c.addEventListener('pointermove', e => { if (ship) { ship.tx = e.clientX; ship.ty = e.clientY; } });
    function reset() {
      ship = { x: w / 2, y: h - 90, tx: w / 2, ty: h - 90, r: 13 };
      rocks = []; score = 0; spawnT = 0; playing = true; last = performance.now();
      scoreEl.textContent = '0'; overlay.style.display = 'none'; requestAnimationFrame(loop);
    }
    function loop(now) {
      if (!playing) return;
      const dt = Math.min(40, now - last) / 1000; last = now;
      const speed = 220 + Math.min(360, score * 6);
      ship.x += (ship.tx - ship.x) * Math.min(1, dt * 12);
      ship.y += (ship.ty - ship.y) * Math.min(1, dt * 12);
      if (keys.ArrowLeft || keys.a) ship.x -= 420 * dt;
      if (keys.ArrowRight || keys.d) ship.x += 420 * dt;
      if (keys.ArrowUp || keys.w) ship.y -= 420 * dt;
      if (keys.ArrowDown || keys.s) ship.y += 420 * dt;
      ship.x = Math.max(16, Math.min(w - 16, ship.x));
      ship.y = Math.max(16, Math.min(h - 16, ship.y));
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = Math.max(0.16, 0.5 - score * 0.006);
        rocks.push({ x: 20 + Math.random() * (w - 40), y: -20, r: 8 + Math.random() * 12, v: speed * (0.8 + Math.random() * 0.5) });
      }
      for (const r of rocks) r.y += r.v * dt;
      rocks = rocks.filter(r => r.y < h + 40);
      for (const r of rocks) {
        const d = Math.hypot(r.x - ship.x, r.y - ship.y);
        if (d < r.r + ship.r) return gameOver();
      }
      score += dt * 10; scoreEl.textContent = Math.floor(score);
      draw();
      requestAnimationFrame(loop);
    }
    function draw() {
      x.clearRect(0, 0, w, h);
      const g = x.createRadialGradient(w / 2, 0, 0, w / 2, 0, h);
      g.addColorStop(0, 'rgba(124,92,255,.18)'); g.addColorStop(1, 'rgba(7,8,13,1)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (const r of rocks) {
        x.beginPath(); x.arc(r.x, r.y, r.r, 0, 7);
        x.fillStyle = 'rgba(255,90,120,.9)';
        x.shadowColor = '#ff5a78'; x.shadowBlur = 18; x.fill(); x.shadowBlur = 0;
      }
      x.beginPath(); x.arc(ship.x, ship.y, ship.r, 0, 7);
      x.fillStyle = '#7ef7e0'; x.shadowColor = '#22d3ee'; x.shadowBlur = 22; x.fill(); x.shadowBlur = 0;
    }
    function gameOver() {
      playing = false;
      overlay.querySelector('h1').textContent = 'Crashed';
      overlay.querySelector('p').textContent = 'Score ' + Math.floor(score) + ' — go again?';
      overlay.querySelector('button').textContent = 'Retry';
      overlay.style.display = 'grid';
    }
    document.getElementById('play').onclick = reset;
    resize(); ship = null; overlay.style.display = 'grid';
  </script>`,
        `html, body { margin: 0; overflow: hidden; background: #07080d; touch-action: none; }
canvas { display: block; }
.hud { position: fixed; top: 18px; left: 0; right: 0; text-align: center; pointer-events: none;
  font-variant-numeric: tabular-nums; }
.hud span { font-size: 34px; font-weight: 700; letter-spacing: -.03em; display: block; }
.hud small { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #8b93a8; }
.overlay { position: fixed; inset: 0; display: grid; place-content: center; justify-items: center;
  text-align: center; padding: 24px; background: radial-gradient(60% 50% at 50% 40%, rgba(124,92,255,.22), transparent 70%); }
.overlay h1 { font-size: 34px; letter-spacing: -.04em; margin: 0 0 8px; }
.overlay p { color: #9aa1b4; margin: 0 0 22px; max-width: 260px; line-height: 1.6; font-size: 14px; }
.overlay button { height: 52px; padding: 0 34px; border: 0; border-radius: 999px; font-weight: 650;
  color: #06131a; background: linear-gradient(135deg, #7ef7e0, #22d3ee); box-shadow: 0 14px 40px -14px #22d3ee; }`,
      ),
    },
  },
  {
    id: 'deck',
    name: 'Slide deck',
    desc: 'Workshop slides — arrow keys, big type',
    icon: 'book',
    color: '#fbbf24',
    entry: 'index.html',
    files: {
      'index.html': shell(
        'Workshop deck',
        `  <div class="deck" id="deck">
    <section class="slide active">
      <span class="kicker">ShadowCode workshop</span>
      <h1>Building with an<br />on-device agent</h1>
      <p class="sub">Use ← → to move. Edit these slides in Studio.</p>
    </section>
    <section class="slide">
      <span class="kicker">01 · Setup</span>
      <h2>Add a key, pick a skill</h2>
      <ul><li>Vault → provider key</li><li>Skills → enable a craft</li><li>Chat → describe the outcome</li></ul>
    </section>
    <section class="slide">
      <span class="kicker">02 · Build</span>
      <h2>Let the agent act</h2>
      <pre>build a landing page for a<br />coffee roastery, then preview it</pre>
    </section>
    <section class="slide">
      <span class="kicker">03 · Ship</span>
      <h2>Files are the product</h2>
      <p class="sub">Studio → Preview → show the room.</p>
    </section>
  </div>
  <div class="progress"><i id="bar"></i></div>
  <div class="pager"><button id="prev">←</button><span id="count">1 / 4</span><button id="next">→</button></div>
  <script>
    const slides = [...document.querySelectorAll('.slide')];
    let i = 0;
    function go(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach((s, k) => s.classList.toggle('active', k === i));
      document.getElementById('count').textContent = (i + 1) + ' / ' + slides.length;
      document.getElementById('bar').style.width = ((i + 1) / slides.length * 100) + '%';
    }
    addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(i + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(i - 1);
    });
    document.getElementById('next').onclick = () => go(i + 1);
    document.getElementById('prev').onclick = () => go(i - 1);
    go(0);
  </script>`,
        `body { overflow: hidden; }
.deck { position: fixed; inset: 0; }
.slide { position: absolute; inset: 0; padding: 8vh 7vw; display: none; flex-direction: column; justify-content: center;
  background: radial-gradient(60% 50% at 15% 10%, rgba(124,92,255,.28), transparent 65%),
              radial-gradient(50% 45% at 90% 85%, rgba(34,211,238,.2), transparent 65%); }
.slide.active { display: flex; animation: in .45s cubic-bezier(.22,1.2,.36,1); }
@keyframes in { from { opacity: 0; transform: translateY(14px); } }
.kicker { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: #22d3ee; margin-bottom: 18px; }
h1 { font-size: clamp(34px, 7vw, 68px); line-height: 1.04; letter-spacing: -.045em; margin: 0 0 18px; }
h2 { font-size: clamp(26px, 5vw, 46px); line-height: 1.1; letter-spacing: -.035em; margin: 0 0 20px; }
.sub, li { color: #a8aec1; font-size: clamp(14px, 2vw, 19px); line-height: 1.7; }
ul { margin: 0; padding-left: 1.1em; }
li { margin: .3em 0; }
pre { font-family: ui-monospace, Menlo, monospace; font-size: clamp(13px, 1.8vw, 18px); line-height: 1.8;
  padding: 20px 22px; border-radius: 20px; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.045); color: #d7dbe8; white-space: pre-wrap; margin: 0; }
.progress { position: fixed; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.08); }
.progress i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #7c5cff, #22d3ee); transition: width .4s cubic-bezier(.22,1.2,.36,1); }
.pager { position: fixed; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 10px;
  padding: 6px; border-radius: 999px; background: rgba(10,11,18,.75); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(14px); }
.pager button { width: 38px; height: 38px; border-radius: 999px; border: 0; background: rgba(255,255,255,.07); color: #eef0f7; font-size: 16px; }
.pager span { font-size: 12px; color: #8b93a8; font-variant-numeric: tabular-nums; padding: 0 4px; }`,
      ),
    },
  },
]
