/* V15 asset authority cleanup: current project has exactly 12 3D knife models. */
(function(){
  const D=window.FORGE_DATA;
  if(!D)return;
  const allowed=new Set((D.BLADE_TYPES_3D||[]).map(x=>x.id));
  const aliases={
    uchigatana:'knife_folding', shamshir:'knife_saber', saber:'knife_saber',
    tanto:'knife_gladius', rapier:'knife_kris', huntsman:'knife_survival',
    tangdao:'knife_tangdao', karambit:'knife_karambit', bayonet:'knife_bayonet', butterfly:'knife_balisong'
  };
  (D.CARDS||[]).forEach(c=>{if(c.blade&&!allowed.has(c.blade))c.blade=aliases[c.blade]||null;});
  const invalid=(D.CARDS||[]).filter(c=>c.blade&&!allowed.has(c.blade));
  if(invalid.length) console.warn('[BladeForge] invalid knife references remain',invalid.map(x=>x.id));
  window.__BLADE_ASSET_AUDIT__={count:allowed.size,ids:[...allowed],invalidCardRefs:invalid.length};
})();