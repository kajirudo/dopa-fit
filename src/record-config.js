// SPDX-License-Identifier: MIT
export const MiB = 1024 * 1024;
export const RECORD_CONFIG = Object.freeze({targetDuration:45, outroDuration:3, crossfadeDuration:.04,
  storyWeights:Object.freeze({beginning:.15,growth:.35,peak:.50}),
  anchorBytes:12*MiB, maxCandidates:48, maxMetadataBytes:4096,
  clipSeconds:4, reservationBytes:1.5*MiB, maxOutputBytes:20*MiB});
export const BUDGETS = Object.freeze({LOW:24*MiB,NORMAL:48*MiB,HIGH:64*MiB});
export const BACKGROUNDS = Object.freeze(['MY_ROOM','BLUR_ROOM','DOPA_STAGE']);
export const recordQuality = profile => profile === 'LOW'
  ? {width:540,height:960,fps:24,bitrate:1_200_000}
  : {width:720,height:1280,fps:30,bitrate:2_000_000};
export const STAGE_NAMES = ['DOPA','SPARK','GROOVE','RUSH','HYPER','SUPERNOVA'];
export const VARIANTS = ['meteor','rings','waves','star-rain'];
