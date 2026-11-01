import test from 'node:test';
import assert from 'node:assert/strict';
import {CUT_SOUND_MATERIALS,cutSoundProfile} from '../src/platform/audio.js';
import {IMPACT_PRESETS,cutImpact} from '../src/ui/arenaImpact.js';
test('all six contact types have bounded, distinct sound fingerprints',()=>{
 const signatures=new Set();
 for(const [type,cut] of Object.entries(IMPACT_PRESETS)){
   const profile=cutSoundProfile(cutImpact({type,complete:true,contactEvent:'kill'}));
   assert.ok(profile.low>=90&&profile.low<=350);
   assert.ok(profile.mid>=350&&profile.mid<=1150);
   assert.ok(profile.noise>.01&&profile.noise<.1);
   assert.ok(profile.lowpass>=1000&&profile.lowpass<=7000);
   assert.ok(profile.duration<.16&&profile.noiseGain<.12);
   signatures.add(profile.kind+':'+profile.lowpass+':'+profile.low);
 }
 assert.equal(signatures.size,6);
 assert.equal(Object.keys(CUT_SOUND_MATERIALS).length,6);
});
test('deflection is quieter and shorter than a clean break; impact data never changes',()=>{
 const hit={sound:'metal',weight:.95,event:'blocked',completed:false};
 const before=JSON.stringify(hit),a=cutSoundProfile(hit);
 const b=cutSoundProfile({...hit,event:'kill',completed:true});
 assert.equal(JSON.stringify(hit),before);
 assert.ok(a.noiseGain<b.noiseGain&&a.duration<b.duration);
 assert.equal(a.completed,false);
 assert.equal(b.completed,true);
 assert.equal(cutSoundProfile({sound:'unknown'}).kind,'unknown');
});


test('five authentic CC0 Ogg cuts are locally vendored with stable semantics',async()=>{
 const {CUT_SAMPLE_ASSETS,cutSampleStatus}=await import('../src/platform/audio.js');
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 assert.equal(Object.keys(CUT_SAMPLE_ASSETS).length,5);
 assert.equal(CUT_SAMPLE_ASSETS.ice,'impactGlass_heavy_000.ogg');
 assert.equal(CUT_SAMPLE_ASSETS.metal,'impactMetal_medium_000.ogg');
 assert.ok(!('fiber' in CUT_SAMPLE_ASSETS),'rope should not sound like a punch');
 for(const file of Object.values(CUT_SAMPLE_ASSETS)){
   const bytes=readFileSync(fileURLToPath(new URL('../assets/audio/kenney/'+file,import.meta.url)));
   assert.equal(bytes.subarray(0,4).toString('ascii'),'OggS',file+' must be real Ogg Vorbis');
   assert.ok(bytes.length>1000&&bytes.length<32000,file);
 }
 assert.equal(cutSampleStatus().files,5);
});
