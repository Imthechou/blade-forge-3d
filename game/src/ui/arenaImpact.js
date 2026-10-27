/**
 * 切割冲击视觉/音效参数：只读 core 接触判定，不更改 45 秒游戏时钟或伤害。
 * 顿帧采用短时间「物体压缩保持」，不是阻塞 JS/RAF，更不会卡住触控输入。
 */
export const IMPACT_PRESETS=Object.freeze({
  foam:   Object.freeze({weight:.20,hold:16,recoil:1.6,shake:.24,particles:3,sound:'soft'}),
  rope:   Object.freeze({weight:.31,hold:22,recoil:2.0,shake:.38,particles:5,sound:'fiber'}),
  wood:   Object.freeze({weight:.59,hold:36,recoil:3.4,shake:.65,particles:8,sound:'wood'}),
  plastic:Object.freeze({weight:.69,hold:41,recoil:4.0,shake:.80,particles:9,sound:'plastic'}),
  ice:    Object.freeze({weight:.77,hold:44,recoil:4.8,shake:.92,particles:11,sound:'ice'}),
  metal:  Object.freeze({weight:1.00,hold:58,recoil:5.8,shake:1.0,particles:13,sound:'metal'}),
});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function cutImpact(hit,{reducedMotion=false}={}) {
  const material=hit?.target?.type || hit?.type || 'rope';
  const preset=IMPACT_PRESETS[material]||IMPACT_PRESETS.rope;
  const event=hit?.contactEvent || (hit?.complete?'kill':'cut');
  const completed=!!hit?.complete;
  const blocked=event==='blocked'||event==='deflect';
  const power=completed?1.2:blocked?.75:.87;
  const quality=hit?.quality==='PERFECT'?1.08:hit?.quality==='ANGLE'?.83:1;
  const factor=power*quality;
  const angle=Number.isFinite(hit?.angle)?hit.angle:0;
  return {
    material,event,completed,angle,
    weight:preset.weight, sound:preset.sound,
    holdMs:reducedMotion?0:Math.round(preset.hold*factor),
    recoilPx:reducedMotion?0:Number((preset.recoil*factor).toFixed(2)),
    shakePx:reducedMotion?0:Number((2.8*preset.shake*factor).toFixed(2)),
    particleCount:reducedMotion?0:clamp(Math.round(preset.particles*factor),2,16),
    flashMs:reducedMotion?55:clamp(Math.round(80+45*preset.weight),70,130),
    hapticMs:clamp(Math.round((completed?9:4)+(preset.weight*(completed?19:9))),4,28),
  };
}
export function impactMotion(event,now) {
  if(!event || !Number.isFinite(now)||!Number.isFinite(event.at))return null;
  const age=now-event.at;
  if(age<0||age>Math.max(event.holdMs+150,155))return null;
  const hold=event.holdMs||0;
  const settle=clamp((age-hold)/120,0,1);
  // 第一段短促压缩 + 定格，第二段迅速回弹；不修改任何实际靶具坐标。
  return {compress:age<hold?1:Math.max(0,1-settle)**2,
    recoil:age<hold?0:Math.sin(settle*Math.PI)*Math.max(0,1-settle),
    age};
}
