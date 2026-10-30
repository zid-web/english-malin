/* =============================================================================
 * English Malin — illustrations.js
 * -----------------------------------------------------------------------------
 * Illustrations vectorielles (SVG en ligne) : aucune image à télécharger, donc
 * tout fonctionne hors ligne et reste net sur tous les écrans.
 *  - mascotSvg(mood)  : Malin le renard (happy | wow | sad)
 *  - levelScene(id)   : scène illustrée de chaque niveau
 *  - launchConfetti() : pluie de confettis (respecte prefers-reduced-motion)
 * ========================================================================== */

/** Malin, la mascotte renard. mood : "happy" | "wow" | "sad". */
export function mascotSvg(mood = "happy", size = 96) {
  const mouths = {
    happy: '<path d="M50 78 Q60 88 70 78" fill="none" stroke="#3b2316" stroke-width="3.5" stroke-linecap="round"/>',
    wow: '<ellipse cx="60" cy="81" rx="5" ry="6" fill="#3b2316"/>',
    sad: '<path d="M50 84 Q60 75 70 84" fill="none" stroke="#3b2316" stroke-width="3.5" stroke-linecap="round"/>',
  };
  const eyes = mood === "happy"
    ? '<path d="M40 60 q6 -7 12 0 M68 60 q6 -7 12 0" fill="none" stroke="#3b2316" stroke-width="3.5" stroke-linecap="round"/>'
    : '<circle cx="46" cy="60" r="5" fill="#3b2316"/><circle cx="74" cy="60" r="5" fill="#3b2316"/><circle cx="47.5" cy="58.5" r="1.6" fill="#fff"/><circle cx="75.5" cy="58.5" r="1.6" fill="#fff"/>';
  return `
    <svg class="mascot" data-mood="${mood}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Malin le renard">
      <path d="M22 18 L50 40 L30 58 Z" fill="#f97316"/><path d="M98 18 L70 40 L90 58 Z" fill="#f97316"/>
      <path d="M28 27 L44 40 L33 50 Z" fill="#3b2316"/><path d="M92 27 L76 40 L87 50 Z" fill="#3b2316"/>
      <path d="M60 104 C30 104 18 80 22 58 C26 38 44 32 60 32 C76 32 94 38 98 58 C102 80 90 104 60 104 Z" fill="#fb8c3c"/>
      <path d="M60 104 C44 104 30 94 28 80 C40 82 50 76 60 70 C70 76 80 82 92 80 C90 94 76 104 60 104 Z" fill="#fff7ed"/>
      ${eyes}
      <ellipse cx="60" cy="71" rx="6" ry="4.5" fill="#3b2316"/>
      ${mouths[mood] || mouths.happy}
      <circle cx="34" cy="74" r="5" fill="#fda4af" opacity=".7"/><circle cx="86" cy="74" r="5" fill="#fda4af" opacity=".7"/>
    </svg>`;
}

/** Scène illustrée d'un niveau (bandeau des cartes de niveau). */
export function levelScene(levelId) {
  const scenes = {
    // Niveau 1 : ballons-lettres dans un ciel ensoleillé
    1: `
      <rect width="320" height="150" fill="#fde68a"/>
      <circle cx="270" cy="38" r="22" fill="#fbbf24"/>
      <path d="M20 120 q30 -18 60 0 t60 0 t60 0 t60 0 t60 0 V150 H20 Z" fill="#86efac"/>
      <g class="float" style="--d:0s"><line x1="80" y1="88" x2="84" y2="128" stroke="#92400e"/><ellipse cx="80" cy="62" rx="22" ry="27" fill="#f43f5e"/><text x="80" y="72" text-anchor="middle" font-size="28" font-weight="700" fill="#fff" font-family="Fredoka, sans-serif">A</text></g>
      <g class="float" style="--d:.6s"><line x1="140" y1="74" x2="138" y2="128" stroke="#92400e"/><ellipse cx="140" cy="48" rx="22" ry="27" fill="#3b82f6"/><text x="140" y="58" text-anchor="middle" font-size="28" font-weight="700" fill="#fff" font-family="Fredoka, sans-serif">B</text></g>
      <g class="float" style="--d:1.2s"><line x1="200" y1="92" x2="196" y2="128" stroke="#92400e"/><ellipse cx="200" cy="66" rx="22" ry="27" fill="#22c55e"/><text x="200" y="76" text-anchor="middle" font-size="28" font-weight="700" fill="#fff" font-family="Fredoka, sans-serif">C</text></g>`,
    // Niveau 2 : cahier ouvert, crayon et bulle « Hi! »
    2: `
      <rect width="320" height="150" fill="#99f6e4"/>
      <circle cx="40" cy="30" r="40" fill="#5eead4"/>
      <path d="M70 110 L160 96 L250 110 L250 60 L160 46 L70 60 Z" fill="#fff"/>
      <path d="M160 46 V96" stroke="#14b8a6" stroke-width="3"/>
      <path d="M86 66 H145 M86 76 H140 M86 86 H145 M175 66 H234 M175 76 H228 M175 86 H234" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
      <g transform="rotate(-30 250 110)"><rect x="200" y="104" width="70" height="12" rx="3" fill="#facc15"/><path d="M270 104 L284 110 L270 116 Z" fill="#fde68a"/><rect x="194" y="104" width="8" height="12" fill="#f472b6"/></g>
      <g class="float" style="--d:.3s"><path d="M200 14 h86 a12 12 0 0 1 12 12 v18 a12 12 0 0 1 -12 12 h-60 l-14 12 v-12 h-12 a12 12 0 0 1 -12 -12 v-18 a12 12 0 0 1 12 -12 z" fill="#0f766e"/><text x="243" y="44" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" font-family="Fredoka, sans-serif">Hi!</text></g>`,
    // Niveau 3 : globe, journal et ondes audio
    3: `
      <rect width="320" height="150" fill="#fecdd3"/>
      <circle cx="290" cy="130" r="50" fill="#fda4af"/>
      <g class="spin-slow" style="transform-origin:95px 78px"><circle cx="95" cy="78" r="46" fill="#38bdf8"/>
      <path d="M70 50 q14 10 6 24 q-10 8 -2 20 q10 10 24 4 M110 40 q-4 18 12 22 q14 4 10 24" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="95" cy="78" rx="20" ry="46" fill="none" stroke="#e0f2fe" stroke-width="2"/><path d="M49 78 H141" stroke="#e0f2fe" stroke-width="2"/></g>
      <g transform="rotate(6 220 80)"><rect x="168" y="30" width="110" height="96" rx="8" fill="#fff"/>
      <rect x="180" y="42" width="86" height="14" rx="3" fill="#e11d48"/><path d="M180 66 H266 M180 76 H250 M180 86 H262 M180 96 H240 M180 106 H258" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/></g>
      <g class="pulse" fill="none" stroke="#be123c" stroke-width="4" stroke-linecap="round"><path d="M150 60 q8 18 0 36"/><path d="M160 52 q14 26 0 52"/></g>`,
  };
  return `<svg viewBox="0 0 320 150" class="scene" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scenes[levelId] || scenes[1]}</svg>`;
}

/** Pluie de confettis plein écran (≈ 2 s). Sans effet si l'utilisateur réduit les animations. */
export function launchConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#f43f5e", "#fbbf24", "#22c55e", "#3b82f6", "#f97316", "#a855f7"];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vy: 2.5 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
    r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bits.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    });
    if (now - start < 2200) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}
