// SPDX-License-Identifier: MIT
import {viewport} from './coordinates.js';
import {validFaceResult} from './face-tracker.js';
import {feverStage} from './fever.js';
export class SafeScene {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.layer=document.createElement('canvas');this.mask=document.createElement('canvas');this.lastSafeAt=-Infinity;this.valid=false;}
  fallback(level=0){const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.fillStyle='#102c29';c.fillRect(0,0,w,h);c.fillStyle=level?feverStage(level).color:'#85d9c0';c.globalAlpha=.15;c.beginPath();c.arc(w/2,h*.42,w*.4,0,Math.PI*2);c.fill();c.globalAlpha=1;this.valid=false;}
  compose(result,{background='MY_ROOM',level=0,fit='cover'},now=performance.now()){
    this.fallback(level);
    try {
      if(!validFaceResult(result,now))return false;
      const {bitmap,faces,segmentation}=result,w=this.canvas.width,h=this.canvas.height;
      const rect=viewport(bitmap.width,bitmap.height,w,h,fit),c=this.ctx;
      if(background!=='MY_ROOM'&&(!segmentation||!segmentation.data?.length))return false;
      this.layer.width=bitmap.width;this.layer.height=bitmap.height;
      const l=this.layer.getContext('2d');l.drawImage(bitmap,0,0);
      // Always hide the face BEFORE this private layer can reach the visible canvas.
      const f=faces[0];this.cover(l,{x:f.x*bitmap.width,y:f.y*bitmap.height,width:f.width*bitmap.width,height:f.height*bitmap.height,roll:f.roll},level);
      if(background!=='MY_ROOM'){
        if(background==='BLUR_ROOM'){c.save();c.translate(w,0);c.scale(-1,1);c.filter='blur(28px)';c.drawImage(this.layer,rect.x-20,rect.y-20,rect.width+40,rect.height+40);c.restore();}
        this.mask.width=segmentation.width;this.mask.height=segmentation.height;const mc=this.mask.getContext('2d'),image=mc.createImageData(this.mask.width,this.mask.height);
        let foreground=0;
        for(let i=0;i<segmentation.data.length;i++){const a=segmentation.data[i]===1?255:0;image.data[i*4+3]=a;foreground+=a?1:0;}
        if(foreground<segmentation.data.length*.01||foreground>segmentation.data.length*.97){this.fallback(level);return false;}
        mc.putImageData(image,0,0);l.globalCompositeOperation='destination-in';l.drawImage(this.mask,0,0,bitmap.width,bitmap.height);l.globalCompositeOperation='source-over';
        if(background==='BLUR_ROOM'){

          // The blur pass includes a face, so replace the entire head area with an opaque shield too.
          const mirrored={x:w-rect.x-(f.x+f.width)*rect.width,y:rect.y+f.y*rect.height,width:f.width*rect.width,height:f.height*rect.height,roll:-f.roll};this.cover(c,mirrored,level);
        }
      }
      c.save();c.translate(w,0);c.scale(-1,1);c.drawImage(this.layer,rect.x,rect.y,rect.width,rect.height);c.restore();
      if(performance.now()-result.capturedAt>200){this.fallback(level);return false;}
      this.faceBox={x:w-rect.x-(f.x+f.width)*rect.width,y:rect.y+f.y*rect.height,width:f.width*rect.width,height:f.height*rect.height,roll:-f.roll};
      this.level=level;this.valid=true;this.lastSafeAt=result.capturedAt;return true;
    }finally{result?.bitmap?.close();}
  }
  cover(c,f,level){
    const color=level?feverStage(level).color:'#85d9c0',cx=f.x+f.width/2,cy=f.y+f.height*.4;
    // Cover stays axis-aligned and fully opaque. Rotating decorations never opens holes.
    c.fillStyle='#152e36';c.fillRect(f.x-f.width*.4,f.y-f.height*.6,f.width*1.8,f.height*2);
    c.save();c.translate(cx,cy);c.rotate(f.roll);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=Math.max(2,f.width*.035);
    c.strokeRect(-f.width*.6,-f.height*.6,f.width*1.2,f.height*1.25);
    c.fillRect(-f.width*.4,-f.height*.05,f.width*.23,f.height*.1);c.fillRect(f.width*.17,-f.height*.05,f.width*.23,f.height*.1);
    if(level>=2){for(const side of [-1,1])c.fillRect(side*f.width*.65-f.width*.06,-f.height*.2,f.width*.12,f.height*.45);}
    if(level>=3){c.globalAlpha=.5;c.fillRect(-f.width*.5,-f.height*.15,f.width,f.height*.3);c.globalAlpha=1;}
    if(level>=4){c.beginPath();c.moveTo(-f.width*.5,-f.height*.7);c.lineTo(-f.width*.3,-f.height);c.lineTo(0,-f.height*.75);c.lineTo(f.width*.3,-f.height);c.lineTo(f.width*.5,-f.height*.7);c.stroke();}
    if(level===5){c.strokeStyle='#ffe486';c.beginPath();c.ellipse(0,-f.height*.75,f.width*.65,f.height*.12,0,0,Math.PI*2);c.stroke();}
    c.restore();
  }
  check(now,level){if(now-this.lastSafeAt>200)this.fallback(level);return this.valid;}
  present(level){if(this.valid&&this.faceBox&&level!==this.level){this.cover(this.ctx,this.faceBox,level);this.level=level;}}
  clear(){this.lastSafeAt=-Infinity;this.faceBox=null;this.level=0;this.fallback();this.layer.width=this.mask.width=1;}
}
