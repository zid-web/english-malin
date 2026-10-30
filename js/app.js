/* =============================================================================
 * English Malin — app.js
 * -----------------------------------------------------------------------------
 *  - Navigation par onglets (Niveaux / Apprendre / Quiz)
 *  - Progression sauvegardée dans le LocalStorage (niveau, scores, leçons faites)
 *  - Zone d'apprentissage : flashcards (niveau 1), articles + grammaire (2-3),
 *    lecteur audio simulé (avec lecture vocale du navigateur si disponible)
 *  - Zone de quiz : QCM interactif, score enregistré
 * ========================================================================== */

import { mascotSvg, levelScene, launchConfetti } from "./illustrations.js";

/* ---------------------------------------------------------------------------
 * 1. Constantes & état
 * ------------------------------------------------------------------------ */
const STORAGE_KEY = "eq:progress:v1";
const TAB_KEY = "eq:tab";
const THEME_KEY = "eq:theme";
const PASS_SCORE = 0.6;   // 60 % au quiz → leçon validée
const UNLOCK_RATIO = 0.5; // 50 % du niveau précédent → niveau suivant débloqué
const TABS = ["levels", "learn", "quiz"];

/** Progression par défaut (premier lancement ou données corrompues). */
const defaultProgress = () => ({
  version: 1,
  currentLevel: 1,
  currentLesson: null,
  completedLessons: [],          // ids des leçons validées
  quizScores: {},                // { [lessonId]: { best, last, attempts } }
  updatedAt: null,
});

const state = {
  content: null,                 // contenu chargé depuis data/lessons.json
  progress: defaultProgress(),
  tab: "levels",
  quiz: null,                    // { lessonId, index, correct, answered }
  audio: null,                   // { timer, elapsed, duration, playing }
};

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------------------------------------------------------------------------
 * 2. LocalStorage : lecture / écriture robustes
 * ------------------------------------------------------------------------ */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const data = JSON.parse(raw);
    // Validation minimale : on repart de zéro plutôt que de planter sur des données invalides.
    if (typeof data !== "object" || !Array.isArray(data.completedLessons)) return defaultProgress();
    return { ...defaultProgress(), ...data };
  } catch (err) {
    console.warn("[Progression] Lecture impossible, valeurs par défaut :", err);
    return defaultProgress();
  }
}

function saveProgress() {
  state.progress.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  } catch (err) {
    // Navigation privée, quota plein… l'app continue, seule la persistance manque.
    console.warn("[Progression] Sauvegarde impossible :", err);
  }
}

function readPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key, value) { try { localStorage.setItem(key, value); } catch { /* ignoré */ } }

/* ---------------------------------------------------------------------------
 * 3. Calculs de progression
 * ------------------------------------------------------------------------ */
const allLessons = () => state.content.levels.flatMap((l) => l.lessons.map((s) => ({ ...s, levelId: l.id })));
const findLevel = (id) => state.content.levels.find((l) => l.id === id);
const findLesson = (id) => allLessons().find((l) => l.id === id);
const isDone = (lessonId) => state.progress.completedLessons.includes(lessonId);

function levelRatio(level) {
  const done = level.lessons.filter((l) => isDone(l.id)).length;
  return level.lessons.length ? done / level.lessons.length : 0;
}

function isUnlocked(level) {
  if (level.id === 1) return true;
  const previous = findLevel(level.id - 1);
  return previous ? levelRatio(previous) >= UNLOCK_RATIO : true;
}

function globalRatio() {
  const lessons = allLessons();
  return lessons.length ? lessons.filter((l) => isDone(l.id)).length / lessons.length : 0;
}

/** Étoiles d'une leçon selon le meilleur score : 1 (validée), 2 (≥ 80 %), 3 (100 %). */
function lessonStars(lessonId) {
  const best = state.progress.quizScores[lessonId]?.best ?? 0;
  return best >= 1 ? 3 : best >= 0.8 ? 2 : best >= PASS_SCORE ? 1 : 0;
}
const totalStars = () => allLessons().reduce((sum, l) => sum + lessonStars(l.id), 0);
const starsHtml = (n) =>
  `<span class="tabular" aria-label="${n} étoile${n > 1 ? "s" : ""} sur 3">${[0, 1, 2].map((i) => `<span class="${i < n ? "star" : "text-line"}" aria-hidden="true">★</span>`).join("")}</span>`;

/** Leçon courante : celle mémorisée, sinon la première non terminée du niveau courant. */
function currentLesson() {
  const saved = state.progress.currentLesson && findLesson(state.progress.currentLesson);
  if (saved) return saved;
  const level = findLevel(state.progress.currentLevel) || state.content.levels[0];
  const lesson = level.lessons.find((l) => !isDone(l.id)) || level.lessons[0];
  return { ...lesson, levelId: level.id };
}

/* ---------------------------------------------------------------------------
 * 4. Utilitaires d'affichage
 * ------------------------------------------------------------------------ */
/** Échappe le HTML : le contenu JSON pourra venir d'un serveur plus tard. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pct = (ratio) => `${Math.round(ratio * 100)} %`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let toastTimer = null;
/** Message éphémère, avec action optionnelle (ex. « Recharger »). */
export function showToast(message, actionLabel, onAction) {
  const toast = $("#toast");
  if (!toast) return;
  toast.innerHTML = `<span>${esc(message)}</span>`;
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.className = "underline";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => { toast.hidden = true; onAction?.(); });
    toast.append(btn);
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), actionLabel ? 12000 : 4000);
}

/* ---------------------------------------------------------------------------
 * 5. Onglets
 * ------------------------------------------------------------------------ */
function switchTab(tab) {
  if (!TABS.includes(tab)) tab = "levels";
  state.tab = tab;
  stopAudio(); // on ne laisse pas l'audio tourner en arrière-plan

  TABS.forEach((name) => {
    $(`#tab-${name}`).setAttribute("aria-selected", String(name === tab));
    $(`#panel-${name}`).hidden = name !== tab;
  });

  if (tab === "levels") renderDashboard();
  if (tab === "learn") renderLearn();
  if (tab === "quiz") renderQuiz();

  writePref(TAB_KEY, tab);
  // URL partageable (?tab=quiz) sans rechargement — utilisée aussi par les raccourcis du manifest.
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  history.replaceState(null, "", url);
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------------------
 * 6. Tableau de bord
 * ------------------------------------------------------------------------ */
function renderDashboard() {
  const ratio = globalRatio();
  $("#global-label").textContent = pct(ratio);
  $("#global-bar").style.width = `${ratio * 100}%`;
  $("#global-meter").setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  $("#star-count").textContent = totalStars();

  // Malin adapte son message à la progression.
  const current = currentLesson();
  $("#hero-mascot").innerHTML = mascotSvg(ratio === 1 ? "wow" : "happy", 92);
  $("#hero-bubble").textContent =
    ratio === 0 ? "Hello! Je suis Malin. On commence ?"
    : ratio === 1 ? "Amazing! Tu as tout terminé !"
    : `Welcome back! On continue avec « ${current.title} » ?`;

  // Rail de leçons du niveau en cours : cartes illustrées.
  const level = findLevel(current.levelId);
  $("#rail-title").textContent = `Niveau ${level.id} · ${level.title}`;
  $("#lessons-rail").innerHTML = level.lessons.map((l, i) => `
    <button class="lesson-card pop-in grid" style="--i:${i}" data-action="pick-and-learn" data-lesson="${l.id}">
      <span class="lesson-art" style="background:${esc(l.tint || "var(--hero)")}">
        ${(l.scene || ["📘"]).map((e, j) => `<span style="--j:${j}" aria-hidden="true">${esc(e)}</span>`).join("")}
      </span>
      <span class="grid gap-1 p-4">
        <span class="flex items-center justify-between gap-2">
          <strong class="font-display text-lg">${esc(l.title)}</strong>
          ${isDone(l.id) ? `<span class="badge-done text-xs font-bold px-2 py-0.5 rounded-full">Fait</span>` : ""}
        </span>
        <span class="text-sm text-muted">${l.type === "vocab" ? `${l.words.length} mots illustrés` : "Article + grammaire"} · ${l.quiz.length} questions</span>
        ${starsHtml(lessonStars(l.id))}
      </span>
    </button>`).join("");

  // Les 3 niveaux : cartes avec scène illustrée.
  $("#levels-grid").innerHTML = state.content.levels.map((lv, i) => {
    const unlocked = isUnlocked(lv);
    const r = levelRatio(lv);
    const isCurrent = lv.id === state.progress.currentLevel;
    return `
      <article class="level-card pop-in grid content-start" style="--i:${i}; --fill: var(--l${lv.id})" data-locked="${!unlocked}">
        <div class="relative">
          ${levelScene(lv.id)}
          <span class="absolute top-3 left-3 bg-surface text-ink text-xs font-bold px-2 py-1 rounded-full tabular" title="Cadre européen (CECRL)">${esc(lv.cefr)}</span>
          ${unlocked ? "" : `<span class="absolute inset-0 grid place-items-center text-4xl" style="background: color-mix(in srgb, var(--bg) 55%, transparent)" aria-hidden="true">🔒</span>`}
        </div>
        <div class="grid gap-3 p-5">
          <div>
            <p class="eyebrow">Niveau ${lv.id} · ${esc(lv.audience)}</p>
            <h3 class="font-display text-2xl font-bold">${esc(lv.title)}</h3>
          </div>
          <p class="text-muted">${esc(lv.description)}</p>
          <div class="grid gap-1">
            <div class="meter"><span style="width:${r * 100}%"></span></div>
            <p class="text-sm text-muted tabular">${lv.lessons.filter((l) => isDone(l.id)).length} / ${lv.lessons.length} leçons · ${pct(r)}</p>
          </div>
          <button class="btn ${isCurrent ? "btn-primary" : ""} justify-center" data-action="open-level" data-level="${lv.id}" ${unlocked ? "" : "disabled"}>
            ${unlocked ? (r > 0 ? "Continuer" : "Commencer") : `Valide ${Math.round(UNLOCK_RATIO * 100)} % du niveau ${lv.id - 1}`}
          </button>
        </div>
      </article>`;
  }).join("");
}

/* ---------------------------------------------------------------------------
 * 7. Zone d'apprentissage
 * ------------------------------------------------------------------------ */
function renderLearn() {
  const lesson = currentLesson();
  const level = findLevel(lesson.levelId);
  const panel = $("#panel-learn");

  // Sélecteur de leçons du niveau courant
  const picker = level.lessons.map((l) =>
    `<button class="btn !py-1.5 !px-3 text-sm ${l.id === lesson.id ? "btn-primary" : ""}" data-action="pick-lesson" data-lesson="${l.id}">
       ${isDone(l.id) ? "✓ " : ""}${esc(l.title)}</button>`).join("");

  let body = "";
  if (lesson.type === "vocab") {
    // Niveau 1 : flashcards à retourner (image → mot anglais → traduction)
    body = `
      <p class="text-muted">Touche une carte pour la retourner, puis écoute le mot.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        ${lesson.words.map((w, i) => `
          <button class="flash" data-action="flip" data-index="${i}" data-flipped="false" aria-label="Carte ${i + 1} : ${esc(w.fr)}">
            <span class="flash-inner">
              <span class="flash-face text-5xl">${esc(w.pic)}</span>
              <span class="flash-face back"><span><strong class="block text-2xl font-display">${esc(w.en)}</strong><span class="text-sm opacity-80">${esc(w.fr)}</span></span></span>
            </span>
          </button>`).join("")}
      </div>`;
  } else {
    // Niveaux 2-3 : article + encadré de grammaire + éventuelle consigne d'expression
    body = `
      <div class="grid gap-3 max-w-[65ch] text-lg">${lesson.text.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      ${lesson.grammar ? `
        <aside class="max-w-[65ch] border-l-4 pl-4 py-1" style="border-color: var(--l${level.id})">
          <p class="eyebrow">Grammaire en contexte</p>
          <p class="font-bold">${esc(lesson.grammar.title)}</p>
          <p class="text-muted">${esc(lesson.grammar.rule)}</p>
        </aside>` : ""}
      ${lesson.prompt ? `
        <div class="grid gap-2 max-w-[65ch]">
          <label for="writing" class="eyebrow">Expression écrite</label>
          <p>${esc(lesson.prompt)}</p>
          <textarea id="writing" rows="4" class="w-full rounded-xl border border-line bg-surface p-3" placeholder="Write your answer in English…">${esc(readPref(`eq:draft:${lesson.id}`) || "")}</textarea>
          <p class="text-sm text-muted">Brouillon enregistré automatiquement sur cet appareil.</p>
        </div>` : ""}`;
  }

  panel.innerHTML = `
    <div class="grid gap-6">
      <div class="grid gap-2">
        <div class="lesson-card !shadow-none flex items-center gap-4 p-4 pop-in" style="background:${esc(lesson.tint || "var(--hero)")}; color:#1b2a4a">
          <span class="lesson-art !p-0 !text-4xl">${(lesson.scene || ["📘"]).map((e, j) => `<span style="--j:${j}" aria-hidden="true">${esc(e)}</span>`).join("")}</span>
          <span class="grid min-w-0">
            <span class="text-xs font-bold uppercase tracking-wider">Niveau ${level.id} · ${esc(level.cefr)}</span>
            <h1 class="font-display text-3xl md:text-4xl font-bold">${esc(lesson.title)}</h1>
          </span>
        </div>
        <div class="flex flex-wrap gap-2">${picker}</div>
      </div>
      ${audioPlayerHtml(lesson)}
      ${body}
      <div><button class="btn btn-primary" data-action="go-quiz">Passer au quiz →</button></div>
    </div>`;
}

/* ---------- Voix de lecture : fille, anglais britannique ---------- */
/*
 * La synthèse vocale du navigateur ne propose pas toujours de voix d'enfant.
 * Stratégie : 1) une vraie voix d'enfant si l'appareil en a une (Edge : Maisie) ;
 * 2) sinon une voix féminine adulte, rendue plus jeune en montant la hauteur
 * (pitch). Anglais britannique uniquement (en-GB) ; une autre voix anglaise
 * n'est utilisée que si l'appareil n'a aucune voix britannique.
 */
const VOICE = {
  child: [/maisie/i],
  adult: [/libby/i, /sonia/i, /hazel/i, /kate/i, /serena/i, /susan/i, /bella/i, /female/i],
  pitch: 1.5,
};

let voicesCache = [];
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voicesCache = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
}
if ("speechSynthesis" in window) {
  loadVoices();
  // La liste des voix arrive souvent en différé (Chrome) : on la recharge à sa disponibilité.
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

/** Choisit la meilleure voix disponible. Renvoie { voice, pitch }. */
function pickVoice() {
  // Voix britanniques uniquement ; repli sur l'anglais seulement si aucune n'existe.
  const british = voicesCache.filter((v) => /^en[-_]GB/i.test(v.lang));
  const ordered = british.length ? british : voicesCache;
  const find = (patterns) => patterns.map((re) => ordered.find((v) => re.test(v.name))).find(Boolean);

  const child = find(VOICE.child);
  if (child) return { voice: child, pitch: 1.1 };         // déjà une voix d'enfant
  const adult = find(VOICE.adult);
  return { voice: adult || ordered[0] || null, pitch: VOICE.pitch };
}

/** Lit un texte en anglais britannique avec la voix de fille. */
function speak(text, { slow = false } = {}) {
  if (!("speechSynthesis" in window)) return;
  const { voice, pitch } = pickVoice();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  utter.lang = "en-GB"; // prononciation britannique demandée même en repli
  utter.pitch = pitch;
  utter.rate = slow ? 0.85 : 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/* ---------- Lecteur audio simulé ---------- */
function audioPlayerHtml(lesson) {
  const duration = lesson.audio?.duration ?? 30;
  return `
    <div class="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 max-w-xl" id="player" data-duration="${duration}">
      <button class="btn btn-primary !p-0 w-11 h-11 justify-center shrink-0" data-action="toggle-audio" aria-label="Lire l'audio" id="audio-btn">
        <svg id="audio-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <div class="grid gap-1 flex-1 min-w-0">
        <div class="meter"><span id="audio-bar" style="width:0%"></span></div>
        <div class="flex justify-between text-xs text-muted tabular"><span id="audio-time">0:00</span><span>${fmtTime(duration)}</span></div>
      </div>
    </div>`;
}

function toggleAudio() {
  if (state.audio?.playing) return stopAudio(true);
  const lesson = currentLesson();
  const duration = Number($("#player").dataset.duration);
  const resumeAt = state.audio?.lessonId === lesson.id ? state.audio.elapsed : 0;
  state.audio = { lessonId: lesson.id, elapsed: resumeAt >= duration ? 0 : resumeAt, duration, playing: true, timer: null };

  // Bonus : lecture réelle par synthèse vocale anglaise (fonctionne hors ligne sur la plupart des appareils).
  const text = lesson.type === "vocab" ? lesson.words.map((w) => w.en).join(". ") : lesson.text.join(" ");
  speak(text, { slow: lesson.levelId === 1 });

  setAudioIcon(true);
  state.audio.timer = setInterval(() => {
    state.audio.elapsed += 0.25;
    const ratio = Math.min(state.audio.elapsed / duration, 1);
    const bar = $("#audio-bar");
    if (bar) bar.style.width = `${ratio * 100}%`;
    const time = $("#audio-time");
    if (time) time.textContent = fmtTime(state.audio.elapsed);
    if (ratio >= 1) stopAudio(true);
  }, 250);
}

/** Arrête l'audio. keepPosition = pause (on garde la position pour reprendre). */
function stopAudio(keepPosition = false) {
  if (!state.audio) return;
  clearInterval(state.audio.timer);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  state.audio.playing = false;
  if (!keepPosition) state.audio = null;
  setAudioIcon(false);
}

function setAudioIcon(playing) {
  const icon = $("#audio-icon");
  if (!icon) return;
  icon.innerHTML = playing ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  $("#audio-btn").setAttribute("aria-label", playing ? "Mettre en pause" : "Lire l'audio");
}

/* ---------------------------------------------------------------------------
 * 8. Zone de quiz
 * ------------------------------------------------------------------------ */
function startQuiz(lessonId) {
  state.quiz = { lessonId, index: 0, correct: 0, answered: false };
}

function renderQuiz() {
  const lesson = currentLesson();
  if (!state.quiz || state.quiz.lessonId !== lesson.id) startQuiz(lesson.id);
  const quiz = state.quiz;
  const panel = $("#panel-quiz");
  const total = lesson.quiz.length;

  // Écran de résultat
  if (quiz.index >= total) {
    const ratio = quiz.correct / total;
    const passed = ratio >= PASS_SCORE;
    panel.innerHTML = `
      <div class="grid gap-4 max-w-xl pop-in">
        <div class="flex items-center gap-4">
          ${mascotSvg(passed ? "wow" : "sad", 96)}
          <p class="bubble">${passed ? (ratio === 1 ? "Perfect! Sans faute !" : "Well done!") : "Oops! On réessaie ensemble ?"}</p>
        </div>
        <p class="eyebrow">Résultat · ${esc(lesson.title)}</p>
        <h1 class="font-display text-5xl font-bold tabular">${quiz.correct} / ${total}</h1>
        <p class="text-3xl">${starsHtml(lessonStars(lesson.id))}</p>
        <p class="text-lg ${passed ? "text-ok" : "text-ko"} font-bold">
          ${passed ? "Leçon validée, bravo !" : `Il faut ${Math.round(PASS_SCORE * 100)} % pour valider. Relis la leçon et réessaie.`}
        </p>
        <p class="text-muted tabular">Meilleur score : ${pct(state.progress.quizScores[lesson.id]?.best ?? 0)} · Tentatives : ${state.progress.quizScores[lesson.id]?.attempts ?? 0}</p>
        <div class="flex flex-wrap gap-2">
          <button class="btn" data-action="retry-quiz">Recommencer</button>
          ${passed ? `<button class="btn btn-primary" data-action="next-lesson">Leçon suivante →</button>`
                   : `<button class="btn btn-primary" data-action="go-learn">Revoir la leçon</button>`}
        </div>
      </div>`;
    if (passed && quiz.celebrate) { quiz.celebrate = false; launchConfetti(); }
    return;
  }

  const q = lesson.quiz[quiz.index];
  panel.innerHTML = `
    <div class="grid gap-5 max-w-xl">
      <div class="grid gap-2">
        <div class="flex justify-between text-sm text-muted tabular">
          <span>${esc(lesson.title)}</span><span>Question ${quiz.index + 1} / ${total}</span>
        </div>
        <div class="meter"><span style="width:${(quiz.index / total) * 100}%"></span></div>
      </div>
      <div class="flex items-center gap-3">
        <span id="quiz-mascot">${mascotSvg("happy", 64)}</span>
        <h1 class="font-display text-2xl md:text-3xl font-bold min-w-0">${esc(q.q)}</h1>
      </div>
      <div class="grid gap-2" role="group" aria-label="Réponses">
        ${q.choices.map((c, i) => `<button class="choice pop-in font-bold" style="--i:${i}" data-action="answer" data-index="${i}">${esc(c)}</button>`).join("")}
      </div>
      <p id="feedback" class="font-bold min-h-[1.6em]" aria-live="polite"></p>
      <div><button class="btn btn-primary" data-action="next-question" id="next-btn" disabled>
        ${quiz.index + 1 === total ? "Voir le résultat" : "Question suivante →"}</button></div>
    </div>`;
}

function answerQuestion(choiceIndex) {
  const quiz = state.quiz;
  if (!quiz || quiz.answered) return;
  const lesson = findLesson(quiz.lessonId);
  const q = lesson.quiz[quiz.index];
  const good = choiceIndex === q.answer;
  quiz.answered = true;
  if (good) quiz.correct += 1;

  // Feedback visuel : bonne réponse en vert, mauvais choix en orange, boutons figés.
  document.querySelectorAll("#panel-quiz .choice").forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.dataset.state = "correct";
    else if (i === choiceIndex) btn.dataset.state = "wrong";
  });
  const feedback = $("#feedback");
  feedback.textContent = good ? "Great job! C'est correct." : `Pas tout à fait : « ${q.choices[q.answer]} ».`;
  $("#quiz-mascot").innerHTML = mascotSvg(good ? "wow" : "sad", 64);
  feedback.className = `font-bold min-h-[1.6em] ${good ? "text-ok" : "text-ko"}`;
  $("#next-btn").disabled = false;
}

function nextQuestion() {
  const quiz = state.quiz;
  quiz.index += 1;
  quiz.answered = false;
  const lesson = findLesson(quiz.lessonId);
  if (quiz.index >= lesson.quiz.length) {
    recordQuizResult(lesson, quiz.correct / lesson.quiz.length);
    quiz.celebrate = true;
  }
  renderQuiz();
}

/** Enregistre le score et met à jour la progression (leçon validée, niveau courant). */
function recordQuizResult(lesson, ratio) {
  const p = state.progress;
  const prev = p.quizScores[lesson.id] || { best: 0, last: 0, attempts: 0 };
  p.quizScores[lesson.id] = { best: Math.max(prev.best, ratio), last: ratio, attempts: prev.attempts + 1 };

  if (ratio >= PASS_SCORE && !isDone(lesson.id)) {
    p.completedLessons.push(lesson.id);
    // Niveau suivant débloqué ? On y fait avancer l'élève automatiquement.
    const next = findLevel(lesson.levelId + 1);
    if (next && isUnlocked(next) && levelRatio(findLevel(lesson.levelId)) === 1) {
      showToast(`Niveau ${next.id} débloqué : ${next.title} !`);
    }
  }
  saveProgress();
}

/** Leçon suivante : prochaine leçon non terminée du niveau, sinon niveau suivant débloqué. */
function goToNextLesson() {
  const lessons = allLessons();
  const start = lessons.findIndex((l) => l.id === currentLesson().id);
  const next = lessons.slice(start + 1).find((l) => !isDone(l.id) && isUnlocked(findLevel(l.levelId)));
  if (!next) { showToast("Toutes les leçons disponibles sont terminées !"); return switchTab("levels"); }
  selectLesson(next.id);
  switchTab("learn");
}

function selectLesson(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return;
  state.progress.currentLesson = lesson.id;
  state.progress.currentLevel = lesson.levelId;
  state.quiz = null;
  saveProgress();
}

/* ---------------------------------------------------------------------------
 * 9. Événements (délégation : un seul écouteur pour toute l'interface)
 * ------------------------------------------------------------------------ */
document.addEventListener("click", (event) => {
  const tabBtn = event.target.closest("[data-tab]");
  if (tabBtn) return switchTab(tabBtn.dataset.tab);

  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;

  switch (el.dataset.action) {
    case "open-level": {
      const level = findLevel(Number(el.dataset.level));
      const lesson = level.lessons.find((l) => !isDone(l.id)) || level.lessons[0];
      selectLesson(lesson.id);
      switchTab("learn");
      break;
    }
    case "pick-and-learn": selectLesson(el.dataset.lesson); switchTab("learn"); break;
    case "pick-lesson": stopAudio(); selectLesson(el.dataset.lesson); renderLearn(); break;
    case "flip": {
      el.dataset.flipped = el.dataset.flipped === "true" ? "false" : "true";
      // Prononce le mot quand la carte montre la face anglaise.
      const word = currentLesson().words[Number(el.dataset.index)];
      if (el.dataset.flipped === "true") speak(word.en, { slow: true });
      break;
    }
    case "toggle-audio": toggleAudio(); break;
    case "go-quiz": state.quiz = null; switchTab("quiz"); break;
    case "go-learn": switchTab("learn"); break;
    case "answer": answerQuestion(Number(el.dataset.index)); break;
    case "next-question": nextQuestion(); break;
    case "retry-quiz": state.quiz = null; renderQuiz(); break;
    case "next-lesson": goToNextLesson(); break;
  }
});

// Navigation clavier entre onglets (flèches gauche/droite), conforme au motif ARIA « tabs ».
$("[role=tablist]").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const i = TABS.indexOf(state.tab);
  const next = TABS[(i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
  switchTab(next);
  $(`#tab-${next}`).focus();
});

// Brouillon d'expression écrite : sauvegardé à la frappe.
document.addEventListener("input", (event) => {
  if (event.target.id === "writing") writePref(`eq:draft:${currentLesson().id}`, event.target.value);
});

// Thème clair / sombre (préférence mémorisée, sinon système).
$("#theme-btn").addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = isDark ? "light" : "dark";
  writePref(THEME_KEY, root.dataset.theme);
});

// Bandeau hors ligne.
const updateOnline = () => ($("#offline-banner").hidden = navigator.onLine);
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);

// Autre onglet du navigateur : on resynchronise la progression.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !state.content) return;
  state.progress = loadProgress();
  switchTab(state.tab);
});

/* ---------------------------------------------------------------------------
 * 10. Démarrage
 * ------------------------------------------------------------------------ */
async function init() {
  state.progress = loadProgress();
  updateOnline();
  try {
    // Network-First côté Service Worker : contenu frais en ligne, dernière version hors ligne.
    const res = await fetch("data/lessons.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.content = await res.json();
  } catch (err) {
    console.error("[Contenu] Chargement impossible :", err);
    $("#levels-grid").innerHTML =
      `<p class="text-ko font-bold">Impossible de charger les leçons. Vérifie ta connexion puis recharge la page.</p>`;
    return;
  }
  // Onglet initial : ?tab=… (raccourcis du manifest), sinon dernier onglet utilisé.
  const fromUrl = new URLSearchParams(location.search).get("tab");
  switchTab(fromUrl || readPref(TAB_KEY) || "levels");
}

init();
