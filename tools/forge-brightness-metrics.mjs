/** Mobile screenshots are captured by s5-optical-acceptance.mjs. Analyze the
 * same physical screen rectangle at the same seed/camera/resolution, not CSS
 * thumbnails; metrics are supporting evidence, not a semantic art judgment.
 * Run from repo root: node tools/forge-brightness-metrics.mjs */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { PNG }=require('../game/node_modules/pngjs');
const root=path.resolve(process.env.S5_QA_OUT||'forge-glare-review');
const stages=['flow-S1','flow-S2','flow-S3','flow-S4','S5-unselected','S5_20',
  'flow-S6-enter','flow-S6-selected','flow-S8-enter','flow-S8-grip','flow-S9-enter'];
async function measure(folder,tag) {
  const fn=path.join(root,folder,tag+'.png');
  try {
    const png=PNG.sync.read(await fs.readFile(fn));
    const sx=png.width/390,sy=png.height/844;
    const a=[];
    // Fixed central blade display crop: excludes the bottom card selector and
    // banner. It includes some background; do not call this a segmentation mask.
    for(let y=Math.round(135*sy);y<Math.min(png.height,Math.round(410*sy));y++)
      for(let x=Math.round(104*sx);x<Math.min(png.width,Math.round(287*sx));x++) {
        const k=(y*png.width+x)*4, d=png.data;
        const lum=.2126*d[k]+.7152*d[k+1]+.0722*d[k+2];
        a.push(lum);
      }
    a.sort((x,y)=>x-y);
    const mean=a.reduce((s,n)=>s+n,0)/a.length;
    const std=Math.sqrt(a.reduce((s,n)=>s+(n-mean)**2,0)/a.length);
    const pct=(p)=>Math.round(a[Math.min(a.length-1,Math.floor((a.length-1)*p))]*10)/10;
    return {count:a.length,mean:+mean.toFixed(2),std:+std.toFixed(2),
      p10:pct(.1),p50:pct(.5),p90:pct(.9),p99:pct(.99),
      nearWhitePct:+(100*a.filter(n=>n>245).length/a.length).toFixed(2)};
  } catch(e) {
    if(e.code==='ENOENT')return null;
    throw e;
  }
}
const results={note:'Fixed mobile ROI; not isolated blade pixels. Compare only identical tags/seeds.',
  stages:{},regressions:[],passed:true};
for(const tag of stages) {
  const [before,after]=await Promise.all([measure('before',tag),measure('after',tag)]);
  if(!after) {results.regressions.push('Missing candidate '+tag);continue;}
  const delta=before?{mean:+(after.mean-before.mean).toFixed(2),
    p90:+(after.p90-before.p90).toFixed(2),
    nearWhitePct:+(after.nearWhitePct-before.nearWhitePct).toFixed(2)}:null;
  results.stages[tag]={before,after,delta};
  // Candidate must not be materially more clipped than current production;
  // allow a narrow tolerance for small camera/driver non-determinism.
  if(before&&delta.mean>12&&delta.nearWhitePct>2)
    results.regressions.push(tag+': ROI mean and clipped whites increased');
}
results.passed=results.regressions.length===0;
await fs.writeFile(path.join(root,'brightness-report.json'),JSON.stringify(results,null,2));
console.log('BRIGHTNESS_QA',JSON.stringify(results));
if(!results.passed)process.exitCode=1;
