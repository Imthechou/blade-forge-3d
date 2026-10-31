/**
 * S4 blade shaping: compact, deterministic geometry recipe.
 * This is deliberately separate from hammer risk/strength RNG and saved per blade.
 * One mark is a local, bounded edge correction, never an edit to a cached GLB.
 */
export const SHAPE_VERSION=1;
export const MAX_SHAPE_MARKS=24;
const clamp01=v=>Math.min(1,Math.max(0,Number.isFinite(Number(v))?Number(v):.5));
export function normalizedShapeProfile(input) {
  if(!input||input.version!==SHAPE_VERSION||!Array.isArray(input.marks))return null;
  const marks=input.marks.slice(0,MAX_SHAPE_MARKS).filter(m=>m&&
    Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y)))
    .map(m=>({x:Math.round(clamp01(m.x)*1000)/1000,y:Math.round(clamp01(m.y)*1000)/1000}));
  return marks.length?{version:SHAPE_VERSION,marks}:null;
}
export function noteHammerShape(run,point) {
  if(!run||run.flowVersion!=='five-screen-v1'||run.phase==='fractured')return false;
  const current=normalizedShapeProfile(run.shapeProfile);
  const marks=current?.marks||[];
  if(marks.length>=MAX_SHAPE_MARKS)return false;
  const x=clamp01(point?.x),y=clamp01(point?.y);
  run.shapeProfile={version:SHAPE_VERSION,marks:[...marks,{
    x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000
  }]};
  return true;
}
