// Usage: BROWSER_PATH=/path/to/chromium node scripts/build-reaction-assets.mjs /path/to/spine-demo
// Offline conversion only: the shipped client does not load Spine or the demo scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import sharp from 'sharp';
const source=process.argv[2];
if(!source)throw Error('Pass the spine-demo directory');
const output=path.resolve('public/player-reactions');
await fs.mkdir(output,{recursive:true});
const sandbox={window:{}};
vm.runInNewContext(await fs.readFile(path.join(source,'assets.js'),'utf8'),sandbox);
const assets=sandbox.window.DEMO_ASSETS;
const decode=url=>Buffer.from(url.split(',')[1],'base64');
const manifest={sprites:{},animations:{},audio:{}};
const composites=[];let x=0,y=0,rowHeight=0;
for(const [name,url] of Object.entries(assets.sprites)){
  const input=decode(url),info=await sharp(input).metadata();
  const scale=Math.min(1,128/Math.max(info.width,info.height));
  const width=Math.round(info.width*scale),height=Math.round(info.height*scale);
  if(x+width>512){x=0;y+=rowHeight+2;rowHeight=0;}
  composites.push({input:await sharp(input).resize(width,height).png().toBuffer(),left:x,top:y});
  manifest.sprites[name]={x,y,width,height,displayWidth:info.width,displayHeight:info.height};
  x+=width+2;rowHeight=Math.max(rowHeight,height);
}
await sharp({create:{width:512,height:y+rowHeight,channels:4,background:'#00000000'}}).composite(composites).webp({quality:48,alphaQuality:75,effort:6}).toFile(path.join(output,'sprites.webp'));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
try{
  const page=await browser.newPage();
  await page.setContent('<canvas id="canvas"></canvas>');
  await page.addScriptTag({path:path.join(source,'vendor/spine.js')});
  for(const [name,data] of Object.entries(assets.models)){
    const rendered=await page.evaluate(async({data})=>{
      const canvas=document.querySelector('canvas');
      const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
      const context=new spine.webgl.ManagedWebGLRenderingContext(gl);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      const image=new Image();image.src=data.image;await image.decode();
      const texture=new spine.webgl.GLTexture(context,image);
      const atlas=new spine.TextureAtlas(data.atlas,()=>texture);
      const model=new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(Uint8Array.from(atob(data.skel),c=>c.charCodeAt(0)));
      const renderer=new spine.webgl.SceneRenderer(canvas,context,true);
      const result={};
      for(const animation of model.animations){
        const sk=new spine.Skeleton(model),fps=16,count=Math.ceil(animation.duration*fps)+1;
        sk.opacity=1;
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        const pose=t=>{sk.setToSetupPose();animation.apply(sk,0,Math.min(t,animation.duration),false,[],1,spine.MixPose.setup,spine.MixDirection.mixIn);sk.updateWorldTransform();};
        for(let i=0;i<count;i++){
          pose(i/fps);const offset=new spine.Vector2(),size=new spine.Vector2();sk.getBounds(offset,size,[]);
          if(Number.isFinite(offset.x)&&Number.isFinite(offset.y)){minX=Math.min(minX,offset.x);minY=Math.min(minY,offset.y);maxX=Math.max(maxX,offset.x+size.x);maxY=Math.max(maxY,offset.y+size.y);}
        }
        minX-=4;minY-=4;maxX+=4;maxY+=4;
        const scale=Math.min(1,160/Math.max(maxX-minX,maxY-minY));
        const width=Math.ceil((maxX-minX)*scale),height=Math.ceil((maxY-minY)*scale);
        canvas.width=width;canvas.height=height;
        renderer.camera.viewportWidth=width/scale;renderer.camera.viewportHeight=height/scale;
        renderer.camera.position.set(minX+width/scale/2,maxY-height/scale/2,0);
        const frames=[];
        for(let i=0;i<count;i++){
          pose(i/fps);gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
          renderer.begin();renderer.drawSkeleton(sk,true);renderer.end();frames.push(canvas.toDataURL('image/png'));
        }
        result[animation.name]={frames,width,height,fps,duration:animation.duration,originX:-minX*scale,originY:maxY*scale,scale};
      }
      renderer.dispose();texture.dispose();return result;
    },{data});
    for(const [animation,{frames,...meta}] of Object.entries(rendered)){
      const key=name+'-'+animation,columns=8,rows=Math.ceil(frames.length/columns);
      await sharp({create:{width:meta.width*columns,height:meta.height*rows,channels:4,background:'#00000000'}}).composite(frames.map((url,i)=>({input:decode(url),left:i%columns*meta.width,top:Math.floor(i/columns)*meta.height}))).webp({quality:42,alphaQuality:70,effort:6}).toFile(path.join(output,key+'.webp'));
      manifest.animations[key]={...meta,columns,frames:frames.length};
      console.log(key,meta.width,meta.height,frames.length);
    }
  }
}finally{await browser.close();}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ygo-reaction-audio-'));
try{
  for(const [name,url] of Object.entries(assets.audio)){
    const input=path.join(temp,name+'.mp3');await fs.writeFile(input,decode(url));
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-vn','-ac','1','-ar','22050','-b:a','32k','-map_metadata','-1',path.join(output,name+'.mp3')]);
    manifest.audio[name]=name+'.mp3';
  }
}finally{await fs.rm(temp,{recursive:true,force:true});}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest));
await fs.copyFile(path.join(source,'vendor/LICENSE.noname'),path.join(output,'LICENSE.noname'));
console.log('Generated',output);
