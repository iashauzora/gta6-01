// The HUD is plain DOM over the canvas: health bar, cash, wanted stars, the objective
// line, a dialogue box for story beats, centre prompts ("Press E to steal"), big centre
// titles (mission names, BUSTED, WASTED), and the damage vignette. game.js feeds it state
// every frame; this module only paints.

import { money } from './util.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const cashEl = el('cash');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const promptEl = el('prompt');
  const dialogueEl = el('dialogue');
  const dialogueWho = el('dialogue-who');
  const dialogueText = el('dialogue-text');
  const titleEl = el('big-title');
  const subtitleEl = el('big-subtitle');
  const vignetteEl = el('vignette');
  const toastEl = el('toast');
  let toastT = 0;
  let lastStars = -1;

  return {
    update(state, dt) {
      healthFill.style.width = `${Math.max(0, state.health)}%`;
      healthFill.style.background = state.health > 30 ? '#59d669' : '#e64545';
      cashEl.textContent = money(state.money);
      if (state.stars !== lastStars) {
        lastStars = state.stars;
        starsEl.textContent = '★★★★★'.slice(0, state.stars) + '☆☆☆☆☆'.slice(0, 5 - state.stars);
        starsEl.style.color = state.stars > 0 ? '#ffd94d' : 'rgba(255,255,255,0.25)';
      }
      vignetteEl.style.opacity = state.health < 45 ? String((45 - state.health) / 45 * 0.75) : '0';
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) toastEl.style.opacity = '0';
      }
    },
    setObjective(text) {
      objectiveEl.textContent = text || '';
      objectiveEl.style.opacity = text ? '1' : '0';
    },
    prompt(text) {
      promptEl.textContent = text || '';
      promptEl.style.opacity = text ? '1' : '0';
    },
    dialogue(who, text) {
      if (!text) {
        dialogueEl.style.opacity = '0';
        return;
      }
      dialogueWho.textContent = who;
      dialogueText.textContent = text;
      dialogueEl.style.opacity = '1';
    },
    /** A big centre title with a subtitle, fading after `seconds`. */
    bigTitle(title, subtitle = '', seconds = 2.6) {
      titleEl.textContent = title;
      subtitleEl.textContent = subtitle;
      titleEl.style.opacity = '1';
      subtitleEl.style.opacity = '1';
      setTimeout(() => {
        titleEl.style.opacity = '0';
        subtitleEl.style.opacity = '0';
      }, seconds * 1000);
    },
    toast(text, seconds = 2.2) {
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      toastT = seconds;
    },
  };
}
