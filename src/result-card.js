// SPDX-License-Identifier: MIT
import { t } from './i18n.js';
import { feverStage } from './fever.js';
const finite=value=>Math.max(0,Math.floor(Number.isFinite(value)?value:0));
export function resultSummary(record) {
  const seconds=finite(record.seconds),level=Math.min(5,finite(record.feverLevel));
  return {energy:finite(record.energy),hits:finite(record.hits),time:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,level,stage:level?feverStage(level).name:t('cardBuild')};
}
// Only session totals and independent art are drawn. Never pass camera frames.
export function drawResultCard(canvas,record,mascot) {
  canvas.width=720;canvas.height=900;const ctx=canvas.getContext('2d'),s=resultSummary(record),color=s.level?feverStage(s.level).color:'#85d9c0';
  const background=ctx.createLinearGradient(0,0,720,900);background.addColorStop(0,'#193d34');background.addColorStop(1,'#0f211f');ctx.fillStyle=background;ctx.fillRect(0,0,720,900);
  ctx.strokeStyle=color;ctx.globalAlpha=.2;ctx.lineWidth=2;for(const r of [150,235,325]){ctx.beginPath();ctx.arc(550,155,r,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
  ctx.textAlign='left';ctx.fillStyle='#e2f1e9';ctx.font='800 42px system-ui';ctx.fillText('✳ dopa fit',48,76);ctx.font='500 17px system-ui';ctx.fillStyle='#b4d0c5';ctx.fillText('Move your body. Build the beat.',48,110);
  ctx.fillStyle=color;ctx.font='800 26px system-ui';ctx.fillText(t('cardTitle'),48,192);ctx.font='500 17px system-ui';ctx.fillStyle='#e2f1e9';ctx.fillText(t(record.input==='demo'?'cardDemo':'cardSession'),48,226);
  if(mascot?.complete&&mascot.naturalWidth)ctx.drawImage(mascot,480,124,175,175);
  ctx.fillStyle='#ffffff10';ctx.beginPath();ctx.roundRect(40,325,640,180,26);ctx.fill();ctx.fillStyle='#b4d0c5';ctx.font='650 18px system-ui';ctx.fillText(t('cardFever'),68,364);ctx.fillStyle=color;ctx.font='900 48px system-ui';ctx.fillText(s.stage,68,429);ctx.font='750 22px system-ui';ctx.fillText(`${s.level} / 5`,552,430);
  for(let n=0;n<5;n++){ctx.fillStyle=n<s.level?color:'#ffffff20';ctx.beginPath();ctx.roundRect(68+n*120,456,108,9,5);ctx.fill();}
  const stats=[['HITS',s.hits],['ENERGY',s.energy],[t('cardTime'),s.time]];
  for(let i=0;i<3;i++){const x=48+i*220;ctx.fillStyle='#b4d0c5';ctx.font='650 16px system-ui';ctx.fillText(stats[i][0],x,564);ctx.fillStyle='#e2f1e9';ctx.font='800 44px system-ui';ctx.fillText(String(stats[i][1]),x,625);}
  ctx.fillStyle=color;ctx.font='750 23px system-ui';ctx.fillText(t('cardThanks'),48,736);ctx.fillStyle='#b4d0c5';ctx.font='500 16px system-ui';ctx.fillText(t('cardPositive'),48,777);ctx.font='600 17px system-ui';ctx.fillText('dopa-fit.vercel.app',48,846);
  return s;
}
export async function downloadResultCard(canvas) {
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG unavailable');
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='dopa-fit-session.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
