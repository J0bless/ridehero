const assert = require('node:assert/strict');
const actions = require('../js/share-actions.js');

(async function() {
  const nativeCalls = [];
  let imageCalls = 0;
  const nativeFile = await actions.share({
    navigator:{ canShare(value) { return value.files.length === 1; }, async share(value) { nativeCalls.push(value); } },
    title:'RideHero', text:'A route', url:'https://ridehero.example/r/one',
    async imageFactory() { imageCalls += 1; return { type:'image/png' }; },
    fileFactory(blob) { return { name:'ridehero-day.png', blob }; },
    async copyLink() { throw new Error('copy should not run'); }
  });
  assert.equal(nativeFile.method, 'native-file');
  assert.equal(nativeCalls.length, 1);
  assert.equal(nativeCalls[0].files[0].name, 'ridehero-day.png');
  assert.equal(imageCalls, 1, 'result images must be generated only after a share action');

  const nativeLink = await actions.share({
    navigator:{ canShare() { return false; }, async share(value) { nativeCalls.push(value); } },
    title:'RideHero', text:'A route', url:'https://ridehero.example/r/two',
    async imageFactory() { imageCalls += 1; return {}; }, fileFactory() { return {}; }
  });
  assert.equal(nativeLink.method, 'native-link');
  assert.equal(Object.hasOwn(nativeCalls[1], 'files'), false);

  const nativeAfterImageFailure = await actions.share({
    navigator:{ canShare() { return true; }, async share(value) { nativeCalls.push(value); } },
    title:'RideHero', text:'A route', url:'https://ridehero.example/r/image-failure',
    async imageFactory() { throw new Error('canvas failed'); }, fileFactory() { return {}; },
    async copyLink() { throw new Error('native link should still run'); }
  });
  assert.equal(nativeAfterImageFailure.method, 'native-link', 'optional card export failure must not block native link sharing');
  assert.equal(Object.hasOwn(nativeCalls[2], 'files'), false);

  let copied = null;
  const fallback = await actions.share({
    navigator:{}, title:'RideHero', text:'A route', url:'https://ridehero.example/r/three',
    async copyLink(value) { copied = value; }
  });
  assert.equal(fallback.method, 'copied-link');
  assert.equal(copied, 'https://ridehero.example/r/three');

  const failedNativeFallback = await actions.share({
    navigator:{ async share() { throw new Error('not supported'); } }, url:'https://ridehero.example/r/four',
    async copyLink(value) { copied = value; }
  });
  assert.equal(failedNativeFallback.method, 'copied-link');
  assert.equal(copied, 'https://ridehero.example/r/four');

  const cancelled = await actions.share({
    navigator:{ async share() { const error = new Error('cancel'); error.name = 'AbortError'; throw error; } },
    url:'https://ridehero.example/r/five', async copyLink() { throw new Error('cancel must not copy'); }
  });
  assert.equal(cancelled.cancelled, true);

  const unavailable = await actions.share({ navigator:{}, url:'https://ridehero.example/r/six' });
  assert.deepEqual(unavailable, { ok:false, method:'unavailable' });
  console.log('Web Share, file share, cancellation, and copy fallback validation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
