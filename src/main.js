import './style.css';
import { World } from './world.js';

const loadingScreen = document.getElementById('loading-screen');
const startScreen = document.getElementById('start-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingLabel = document.getElementById('loading-label');
const startButton = document.getElementById('start-button');
const canvas = document.getElementById('experience-canvas');
const hud = document.getElementById('hud');
const prompt = document.getElementById('prompt');
const infoPanel = document.getElementById('info-panel');
const infoBody = document.getElementById('info-body');
const infoClose = document.getElementById('info-close');
const touchControls = document.getElementById('touch-controls');
const touchInteract = document.getElementById('touch-interact');

let world = null;

function showPrompt(label) {
  if (label) {
    prompt.textContent = '';
    const kbd = document.createElement('kbd');
    kbd.textContent = 'E';
    prompt.append(`press `, kbd, ` to view ${label}`);
    prompt.classList.remove('hidden');
  } else {
    prompt.classList.add('hidden');
  }
}

function openInfo(_key, data) {
  if (!data) return;
  infoBody.innerHTML = `<h2>${data.title}</h2>${data.html}`;
  infoPanel.classList.remove('hidden');
}

function closeInfo() {
  infoPanel.classList.add('hidden');
}

infoClose.addEventListener('click', closeInfo);
infoPanel.addEventListener('click', (e) => {
  if (e.target === infoPanel) closeInfo();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') closeInfo();
});

// Touch controls
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) touchControls.classList.remove('hidden');

for (const btn of document.querySelectorAll('.touch-btn[data-key]')) {
  const key = btn.dataset.key;
  const press = (e) => {
    e.preventDefault();
    world?.setTouchKey(key, true);
  };
  const release = (e) => {
    e.preventDefault();
    world?.setTouchKey(key, false);
  };
  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('touchend', release, { passive: false });
  btn.addEventListener('touchcancel', release, { passive: false });
  btn.addEventListener('mousedown', press);
  btn.addEventListener('mouseup', release);
  btn.addEventListener('mouseleave', release);
}
touchInteract.addEventListener('click', () => world?.triggerInteract());

// Simulated loading sequence (everything is procedural — no external assets
// to fetch — but a short progress beat keeps the intro feeling intentional).
function runLoadingSequence() {
  const steps = [
    'tuning suspension…',
    'painting the grid…',
    'planting trees…',
    'placing kiosks…',
    'ready!',
  ];
  let progress = 0;
  let stepIndex = 0;

  const interval = setInterval(() => {
    progress += 8 + Math.random() * 14;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
    }
    loadingBarFill.style.width = `${progress}%`;
    const nextStep = Math.floor((progress / 100) * (steps.length - 1));
    if (nextStep !== stepIndex) {
      stepIndex = nextStep;
      loadingLabel.textContent = steps[stepIndex];
    }
    if (progress >= 100) {
      loadingLabel.textContent = steps[steps.length - 1];
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
      }, 350);
    }
  }, 180);
}

startButton.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  if (!world) {
    world = new World(canvas, {
      onPrompt: showPrompt,
      onInteract: openInfo,
    });
    world.start();
  }
});

runLoadingSequence();
