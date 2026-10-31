/**
 * Copy-on-write blade edge deformation for the currently displayed GLB.
 * The renderer keeps geometry in engine.loaded, so NEVER mutate that cached mesh.
 * Each viewer owns at most one set of temporary clones; replacing/removing a model
 * restores and disposes only these clones, leaving PBR materials and GPU programs intact.
 */
import { normalizedShapeProfile } from '../core/forgeShape.js';
const owned=new WeakMap();
function restore(viewer) {
  const state=owned.get(viewer);
  if(!state)return;
  for(const item of state.items){
    if(item.mesh.geometry===item.copy)item.mesh.geometry=item.original;
    item.copy.dispose();
  }
  owned.delete(viewer);
  if(!viewer.disposed)viewer.needsRender=true;
}
export function clearBladeShape(viewer){if(viewer)restore(viewer);}
function candidate(mesh, original=null){
  const geometry=original||mesh.geometry,pos=geometry?.getAttribute?.('position'),region=geometry?.getAttribute?.('aRegion');
  return mesh.isMesh&&pos&&region&&pos.itemSize===3&&region.count>=pos.count?{geometry,pos,region}:null;
}
function deform(mesh,profile,reuse=null) {
  // Deform from immutable cached GLB coordinates, never the preceding blow.
  const source=candidate(mesh,reuse?.original);if(!source)return null;
  const {geometry,pos,region}=source;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let n=0;
  for(let i=0;i<pos.count;i++) {
    if(region.getX(i)<=.55)continue;
    n++;
    const xyz=[pos.getX(i),pos.getY(i),pos.getZ(i)];
    for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],xyz[axis]);max[axis]=Math.max(max[axis],xyz[axis]);}
  }
  if(n<12)return null;
  const axes=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]));
  const lengthAxis=axes[0],widthAxis=axes[1];
  const length=max[lengthAxis]-min[lengthAxis],width=max[widthAxis]-min[widthAxis];
  if(!Number.isFinite(length)||!Number.isFinite(width)||length<=0||width<=0||length<width*1.1)return null;
  const mid=(max[widthAxis]+min[widthAxis])*.5;
  const copy=reuse?.copy||geometry.clone(),p=copy.getAttribute('position');
  // Keep one viewer-owned GPU buffer across blows; reset unaffected vertices too.
  if(reuse){
    if(pos.array&&p.array&&pos.array.length===p.array.length&&!pos.isInterleavedBufferAttribute)
      p.array.set(pos.array);
    else for(let i=0;i<pos.count;i++)p.setXYZ(i,pos.getX(i),pos.getY(i),pos.getZ(i));
  }
  let changed=0;
  for(let i=0;i<p.count;i++) {
    if(region.getX(i)<=.55)continue;
    const coords=[pos.getX(i),pos.getY(i),pos.getZ(i)];
    const w=(coords[widthAxis]-mid)/(width*.5);
    const edge=Math.min(1,Math.max(0,(Math.abs(w)-.56)/.44));
    if(edge<=0)continue;
    const t=(coords[lengthAxis]-min[lengthAxis])/length;
    const taper=Math.max(0,Math.sin(Math.PI*t));
    let strength=0;
    for(const mark of profile.marks) {
      const side=mark.x>=.5?1:-1;
      if(Math.sign(w)!==side)continue;
      /* 落点沿刀身长度方向的影响半径：小一点让每一锤更像「局部压痕」，
         而不是整条刃线一起位移。 */
      const delta=(t-(1-mark.y))/.115;
      strength+=.0082*Math.exp(-delta*delta*1.35);
    }
    /* ★ 上限从 .07 提到 .17，单锤系数相应下调：
       实测 10 锤约到上限 40%、20 锤约 80%，形变随锤数**持续加深**
       （基线 0/10/20 锤最大位移为 0 / 0.00096 / 0.00176，肉眼不可辨）。
       仍受 edge*taper*width 约束，只在刃口一侧、首尾自动衰减。 */
    const dx=Math.min(.17,strength)*edge*taper*width;
    if(dx<=1e-9)continue;
    coords[widthAxis]-=Math.sign(w)*dx;
    p.setXYZ(i,coords[0],coords[1],coords[2]);changed++;
  }
  if(!changed){if(!reuse)copy.dispose();return null;}
  p.needsUpdate=true;
  copy.computeVertexNormals();
  copy.computeBoundingBox();
  copy.computeBoundingSphere();
  return {mesh,original:geometry,copy,vertices:changed};
}
/** Returns the number of model vertices affected, without altering cached geometry. */
export function applyBladeShape(viewer,input) {
  if(!viewer)return {ok:false,vertices:0};
  const profile=normalizedShapeProfile(input);
  if(!profile){restore(viewer);return {ok:true,vertices:0};}
  const key=JSON.stringify(profile),old=owned.get(viewer);
  if(old?.root===viewer.root&&old.key===key)return {ok:true,vertices:old.vertices};
  // A strike only changes the contents of the existing transient geometry.
  // Re-cloning/re-uploading the whole mesh on every tap caused GPU churn.
  if(old?.root===viewer.root&&old.items.every(x=>x.mesh.geometry===x.copy)){
    const items=[];
    for(const item of old.items){
      const updated=deform(item.mesh,profile,item);
      if(updated)items.push(updated);
      else {item.mesh.geometry=item.original;item.copy.dispose();}
    }
    if(items.length){
      const vertices=items.reduce((n,x)=>n+x.vertices,0);
      owned.set(viewer,{root:viewer.root,key,vertices,items});
      viewer.needsRender=true;
      return {ok:true,vertices};
    }
    owned.delete(viewer);
    viewer.needsRender=true;
    return {ok:false,vertices:0,reason:'unsupported-geometry'};
  }
  restore(viewer);
  if(!viewer.root)return {ok:false,vertices:0};
  const items=[];
  viewer.root.traverse(mesh=>{const entry=deform(mesh,profile);if(entry)items.push(entry);});
  if(!items.length)return {ok:false,vertices:0,reason:'unsupported-geometry'};
  for(const entry of items)entry.mesh.geometry=entry.copy;
  const vertices=items.reduce((n,x)=>n+x.vertices,0);
  owned.set(viewer,{root:viewer.root,key,vertices,items});
  viewer.needsRender=true;
  return {ok:true,vertices};
}
