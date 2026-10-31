import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBladeShape,clearBladeShape} from '../src/render/bladeShape.js';

function geometry(values,track=[]) {
  const array=new Float32Array(values);
  const position={
    count:array.length/3,itemSize:3,array,
    getX:i=>array[i*3],getY:i=>array[i*3+1],getZ:i=>array[i*3+2],
    setXYZ:(i,x,y,z)=>{array.set([x,y,z],i*3);},
    needsUpdate:false,
  };
  const region={count:position.count,getX:()=>1};
  return {
    position,disposed:false,
    getAttribute:k=>k==='position'?position:k==='aRegion'?region:null,
    clone(){return geometry(Array.from(array),track);},
    computeVertexNormals(){},computeBoundingBox(){},computeBoundingSphere(){},
    dispose(){this.disposed=true;track.push(this);},
  };
}
function sample(){
 const points=[];
 for(let x=-2;x<=2;x++)for(let y=-.5;y<=.5;y+=.25)points.push(x,y,0);
 const releases=[],original=geometry(points,releases),mesh={isMesh:true,geometry:original};
 const root={traverse:fn=>fn(mesh)},viewer={root,needsRender:false,disposed:false};
 return {viewer,mesh,original,releases,originalValues:Array.from(original.position.array)};
}
const profile={version:1,marks:Array.from({length:20},()=>({x:.86,y:.5}))};
test('real S4 geometry is per-viewer copy-on-write and cached blade vertex buffers never change',()=>{
 const a=sample();
 const result=applyBladeShape(a.viewer,profile);
 assert.equal(result.ok,true);assert.ok(result.vertices>0);
 assert.notEqual(a.mesh.geometry,a.original);
 assert.deepEqual(Array.from(a.original.position.array),a.originalValues);
 assert.notDeepEqual(Array.from(a.mesh.geometry.position.array),a.originalValues);
 const clone=a.mesh.geometry;
 assert.equal(applyBladeShape(a.viewer,profile).vertices,result.vertices);
 assert.equal(a.mesh.geometry,clone,'unchanged profile must reuse the same transient geometry');
 clearBladeShape(a.viewer);
 assert.equal(a.mesh.geometry,a.original);
 assert.equal(clone.disposed,true);
 assert.equal(a.original.disposed,false);
 assert.deepEqual(Array.from(a.original.position.array),a.originalValues);
});
test('updating a shape reuses its owned clone and clearing it is idempotent',()=>{
 const a=sample(),b=sample();
 applyBladeShape(a.viewer,profile);
 applyBladeShape(b.viewer,{version:1,marks:[{x:.1,y:.3}]});
 assert.equal(b.mesh.geometry===b.original,false);
 applyBladeShape(a.viewer,{version:1,marks:[{x:.1,y:.7}]});
 assert.equal(a.releases.length,0,'updating a shape must not free/reallocate its clone');
 clearBladeShape(a.viewer);clearBladeShape(a.viewer);
 assert.equal(a.mesh.geometry,a.original);
 assert.notEqual(b.mesh.geometry,b.original,'independent viewer is unaffected');
 clearBladeShape(b.viewer);
 assert.equal(b.mesh.geometry,b.original);
});
test('malformed and unsupported recipes are safe no-ops',()=>{
 const a=sample();
 assert.equal(applyBladeShape(a.viewer,{version:999,marks:[{x:.5,y:.5}]}).vertices,0);
 assert.equal(a.mesh.geometry,a.original);
});

test('S4 24 hits reuse one geometry, respect original GLB and roll back exactly',()=>{
 const a=sample(),base=a.originalValues;
 const saved={version:1,marks:[{x:.94,y:.5}]};
 assert.ok(applyBladeShape(a.viewer,saved).vertices>0);
 const clone=a.mesh.geometry,one=Array.from(clone.position.array);
 for(let n=2;n<=24;n++){
   const marks=Array.from({length:n},()=>({x:.94,y:.5}));
   assert.ok(applyBladeShape(a.viewer,{version:1,marks}).vertices>0);
   assert.equal(a.mesh.geometry,clone,'realloc on impact '+n);
   assert.equal(a.releases.length,0);
   assert.deepEqual(Array.from(a.original.position.array),base);
 }
 const twentyFour=Array.from(clone.position.array);
 const delta=a=>Math.max(...a.map((v,i)=>Math.abs(v-base[i])));
 assert.ok(delta(twentyFour)>delta(one)*1.2,'later blows deepen a local correction');
 applyBladeShape(a.viewer,{version:1,marks:[{x:.08,y:.5}]});
 assert.equal(a.mesh.geometry,clone,'switching sides also reuses geometry');
 applyBladeShape(a.viewer,saved);
 assert.deepEqual(Array.from(clone.position.array),one,'source-based refresh must not drift');
 clearBladeShape(a.viewer);
 assert.equal(a.mesh.geometry,a.original);
 assert.equal(a.releases.length,1);
 assert.deepEqual(Array.from(a.original.position.array),base);
});
