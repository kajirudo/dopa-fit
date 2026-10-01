// SPDX-License-Identifier: MIT
// Classic worker permits the pinned Emscripten loader to use importScripts.
const vision=import('../optional/vision/vision_bundle.mjs');
const root=new URL('../',self.location.href);
let tracker,segmenter,provider;
self.onmessage=async event=>{
  const m=event.data;
  try {
    if(m.type==='init'){
      const {FilesetResolver,FaceDetector,FaceLandmarker}=await vision;provider=m.provider;
      const files=await FilesetResolver.forVisionTasks(new URL('optional/vision/wasm',root).href);
      const baseOptions={delegate:'CPU',modelAssetPath:new URL(`optional/models/face-${provider==='landmarker'?'landmarker.task':'detector.tflite'}`,root).href};
      tracker=provider==='landmarker'?await FaceLandmarker.createFromOptions(files,{baseOptions,runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:.65,minTrackingConfidence:.65,outputFacialTransformationMatrixes:true})
        :await FaceDetector.createFromOptions(files,{baseOptions,runningMode:'VIDEO',minDetectionConfidence:.65});
      self.postMessage({type:'ready'});return;
    }
    const {bitmap,capturedAt}=m;let faces=[];
    if(provider==='landmarker'){
      const r=tracker.detectForVideo(bitmap,capturedAt);
      faces=r.faceLandmarks.map(points=>{
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y),a=points[33],b=points[263];
        return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),roll:Math.atan2((b.y-a.y)*bitmap.height,(b.x-a.x)*bitmap.width)};
      });
    } else {
      faces=tracker.detectForVideo(bitmap,capturedAt).detections.map(d=>{
        const b=d.boundingBox,a=d.keypoints[0],c=d.keypoints[1];
        return {x:b.originX/bitmap.width,y:b.originY/bitmap.height,width:b.width/bitmap.width,height:b.height/bitmap.height,roll:Math.atan2((c.y-a.y)*bitmap.height,(c.x-a.x)*bitmap.width)};
      });
    }
    let segmentation=null;
    if(m.background!=='MY_ROOM'){
      const {FilesetResolver,ImageSegmenter}=await vision;segmenter??=await ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks(new URL('optional/vision/wasm',root).href),{
        baseOptions:{delegate:'CPU',modelAssetPath:new URL('optional/models/selfie-segmenter.tflite',root).href},runningMode:'VIDEO',outputCategoryMask:false,outputConfidenceMasks:true});
      segmenter.segmentForVideo(bitmap,capturedAt,r=>{// Pinned v1 model has a single 'selfie' sigmoid output, not a two-class argmax.
        const masks=r.confidenceMasks,mask=masks?.length===1?masks[0]:masks?.[1];if(!mask)return;const confidence=mask.getAsFloat32Array(),data=new Uint8Array(confidence.length);for(let i=0;i<data.length;i++)data[i]=confidence[i]>=.65?1:0;segmentation={width:mask.width,height:mask.height,data};});
    }
    self.postMessage({type:'frame',id:m.id,capturedAt,faces,bitmap,segmentation,provider},[bitmap,...(segmentation?[segmentation.data.buffer]:[])]);
  }catch(error){m.bitmap?.close();self.postMessage({type:'error',id:m.id,message:String(error.message||error)});}
};
