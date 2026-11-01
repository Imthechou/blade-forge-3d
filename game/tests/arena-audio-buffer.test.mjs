import test from 'node:test';
import assert from 'node:assert/strict';

/** Tiny WebAudio API recording double: we count actual audio buffers allocated
 * by the production synthesis function, rather than mocking its implementation. */
test('30 consecutive real synthesis calls share one PCM noise buffer',async()=>{
  const before=globalThis.AudioContext;
  const stats={buffers:0,noiseSources:0,oscillators:0,disconnects:0};
  class Param {
    value=0;
    setValueAtTime(x){this.value=x;}
    linearRampToValueAtTime(x){this.value=x;}
    exponentialRampToValueAtTime(x){this.value=x;}
  }
  class Node {
    connect(){return this;}
    disconnect(){stats.disconnects++;}
    start(){}
    stop(){}
  }
  class Oscillator extends Node {frequency=new Param();}
  class Gain extends Node {gain=new Param();}
  class Filter extends Node {frequency=new Param();}
  class Source extends Node {buffer=null;}
  class AudioContext {
    currentTime=1;
    sampleRate=48000;
    state='running';
    destination=new Node();
    createGain(){return new Gain();}
    createOscillator(){stats.oscillators++;return new Oscillator();}
    createBuffer(_channels,size){stats.buffers++;const data=new Float32Array(size);return {getChannelData(){return data;}};}
    createBufferSource(){stats.noiseSources++;return new Source();}
    createBiquadFilter(){return new Filter();}
  }
  try{
    globalThis.AudioContext=AudioContext;
    const audio=await import('../src/platform/audio.js?arena-noise-buffer-qa');
    for(let n=0;n<30;n++){
      audio.playCutImpact({sound:['soft','fiber','wood','plastic','ice','metal'][n%6],
        weight:.45+n%5*.1,completed:n%3===0,event:n%3===0?'kill':'cut'});
    }
    assert.equal(stats.buffers,1,'noise texture must not regenerate per cut');
    assert.equal(stats.noiseSources,30,'each hit retains independent envelope');
    assert.ok(stats.oscillators>=60);
    audio.setEnabled(false);
    for(let n=0;n<10;n++)audio.playCutImpact({sound:'metal',weight:1});
    assert.equal(stats.buffers,1,'muted impacts allocate nothing');
    assert.equal(stats.noiseSources,30);
    assert.equal(audio.settings().enabled,false);
  }finally{
    if(before===undefined)delete globalThis.AudioContext;
    else globalThis.AudioContext=before;
  }
});
