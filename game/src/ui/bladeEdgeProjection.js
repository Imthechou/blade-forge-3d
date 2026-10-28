/** Project the active GLB blade-region silhouette into the actual stage canvas.
 * Shared 3D camera & matrices; no texture or GLB modifications.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function bladeEdgeProjection(stage,width,height) {
  const viewer=stage?.viewer,info=stage?.engine?.loaded?.get(stage.modelId);
  const camera=viewer?.camera,root=info?.root,THREE=globalThis.THREE||globalThis.__THREE__;
  if(!camera||!root||!THREE)return null;
  root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const pts=[],v=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
    const pos=mesh.geometry.attributes.position,reg=mesh.geometry.attributes.aRegion;
    if(!reg)return;
    const stride=Math.max(1,Math.floor(pos.count/3200));
    for(let i=0;i<pos.count;i+=stride){
      if(reg.getX(i)<.6)continue;
      v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(camera);
      if(Number.isFinite(v.x)&&Number.isFinite(v.y))
        pts.push({x:(v.x+1)*width/2,y:(1-v.y)*height/2});
    }
  });
  if(pts.length<50)return null;
  const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
  const y0=clamp(minY+5,88,height-95),y1=clamp(maxY-5,125,height-54);
  if(y1-y0<85)return null;
  const path=[];
  for(let i=0;i<24;i++){
    const y=y0+(y1-y0)*i/23,delta=(y1-y0)/24*1.9;
    const local=pts.filter(p=>Math.abs(p.y-y)<delta);
    const nearby=local.length?local:pts.slice().sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y)).slice(0,24);
    path.push({x:clamp(Math.min(...nearby.map(p=>p.x)),21,width-21),y});
  }
  for(let i=1;i<23;i++)path[i].x=(path[i-1].x+path[i].x*2+path[i+1].x)/4;
  return path;
}
