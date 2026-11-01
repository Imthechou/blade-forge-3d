import test from 'node:test';
import assert from 'node:assert/strict';
import { posterInfo } from '../src/ui/bladeCardExport.js';

test('poster colors exactly follow collectible rarity keys, including fine and legend',()=>{
  const common=posterInfo({rarityTone:'common'}).tone;
  for(const tier of ['fine','rare','epic','legend','mythic']){
    const tone=posterInfo({rarityTone:tier}).tone;
    assert.equal(tone.length,2);
    assert.notDeepEqual(tone,common,tier+' must not silently fall back to common grey');
  }
  assert.deepEqual(posterInfo({rarityTone:'uncommon'}).tone,posterInfo({rarityTone:'fine'}).tone);
  assert.deepEqual(posterInfo({rarityTone:'legendary'}).tone,posterInfo({rarityTone:'legend'}).tone);
});
