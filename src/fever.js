// SPDX-License-Identifier: MIT
export const FEVER_STAGES = [
  { level: 1, bpm:120, targets:4, respawnBeats:1, name: 'SPARK', color: '#ffe486', rgb: '255,228,134', notes: [72,76,79,84] },
  { level: 2, bpm:128, targets:6, respawnBeats:1, name: 'GROOVE', color: '#8af4bf', rgb: '138,244,191', notes: [72,74,76,79,84] },
  { level: 3, bpm:138, targets:8, respawnBeats:.5, name: 'RUSH', color: '#88caff', rgb: '136,202,255', notes: [76,79,81,84,88] },
  { level: 4, bpm:148, targets:10, respawnBeats:.5, name: 'HYPER', color: '#dba3ff', rgb: '219,163,255', notes: [79,81,84,88,91] },
  { level: 5, bpm:160, targets:12, respawnBeats:.5, name: 'SUPERNOVA', color: '#ff9ecb', rgb: '255,158,203', notes: [72,76,79,84,88,91,96] }
];
export const BASE_BPM=112, REST_BPM=100;
export const feverStage = level => FEVER_STAGES[Math.min(4,Math.max(0,Math.floor(Number(level)||1)-1))];
