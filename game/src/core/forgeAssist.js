/**
 * Five-screen assisted craft: four subordinate operations resolve through the
 * existing card/risk/tag/PBR engine, instead of four extra manual card dialogs.
 * Player still chooses material, smelting craft, blade shape, quench and handle.
 * S4 hammer and S7 contour tracing remain fully manual.
 */
export const ASSISTED_STAGES=Object.freeze({
  S3:'系统预锻',
  S6:'系统回火',
  S7:'刃口准备',
  S9:'系统调校',
});
export const MANUAL_STAGES=Object.freeze(['S1','S2','S4','S5','S8']);
export const isAssistedStage=id=>Object.hasOwn(ASSISTED_STAGES,id);

/**
 * Prefer the safest of the three actually rolled cards, while giving small
 * preference to craft tags built by the player. No new cards are minted and no
 * attributes/risk are altered: the regular confirmCard transaction resolves it.
 */
export function assistedCard(run) {
  const cards=(run?.candidates||[]).filter(c=>c?.stage===run?.stageId);
  if(!cards.length)return null;
  const owned=new Set((run.ledger?.entries||[]).flatMap(x=>x.tags||[]));
  const score=(card)=>{
    const danger=Math.max(-25,Math.min(40,Number(card.riskDeltaPoints)||0));
    const synergy=(card.tags||[]).filter(t=>owned.has(t)).length;
    // Safety is dominant: use 3 points of affinity per 1 matching tag.
    return danger*3 - synergy*2;
  };
  return cards.reduce((best,c)=>score(c)<score(best)?c:best,cards[0]);
}
