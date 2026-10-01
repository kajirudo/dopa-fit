// SPDX-License-Identifier: MIT
import { feverStage } from './fever.js';
// One-shot celebrations follow cumulative rewards; rest never resets a streak.
export class FeedbackDirector {
  constructor() { this.reset(); }
  reset() { this.layer = 0; this.cycle = 'BUILD'; this.nextRally = 5; this.nearCycle = null; }
  update(state) {
    const cues = [];
    if (state.layer > this.layer) cues.push({ kind: 'unlock', title: 'NEW SOUND!', subtitle: `${['Kick', 'Hi-hat', 'Snare', 'Bass', 'Synth', 'Melody'][state.layer]} が仲間入り`, duration: 2100, priority: 3 });
    if (state.hits >= this.nextRally) {
      cues.push({ kind: 'rally', title: `${state.hits} HITS!`, subtitle: 'いい動き！音がどんどん育ってる', duration: 1800, priority: 2 });
      while (this.nextRally <= state.hits) this.nextRally += this.nextRally === 5 ? 5 : this.nextRally < 50 ? 10 : 25;
    }
    if (state.cycle === 'FEVER' && this.cycle !== 'FEVER') { const stage=feverStage(state.feverLevel);cues.push({ kind: 'fever', level: stage.level, title: `${stage.name}!`, subtitle: `FEVER ${stage.level} / 5 · ${stage.level===5?'最高のビート！':'音と光が、もう一段育った！'}`, duration: 3000, priority: 5 }); }
    if (state.cycle === 'REST' && this.cycle !== 'REST') cues.push({ kind: 'rest', title: 'NICE FLOW', subtitle: 'ひと息ついても、成果はそのまま', duration: 2000, priority: 4 });
    if (state.energy - state.lastFeverEnergy >= 75 && state.cycle !== 'FEVER' && this.nearCycle !== state.lastFeverEnergy) {
      this.nearCycle = state.lastFeverEnergy;
      cues.push({ kind: 'near', title: `${feverStage(state.nextFeverLevel).name} IS COMING`, subtitle: `次はFEVER ${state.nextFeverLevel || 1} / 5`, duration: 1900, priority: 1 });
    }
    this.layer = state.layer; this.cycle = state.cycle;
    const cue = cues.sort((a, b) => b.priority - a.priority)[0] || null;
    if (cue && cue.kind !== 'rally' && cues.some(item => item.kind === 'rally')) cue.subtitle += ` · ${state.hits} HITS`;
    return cue;
  }
}
