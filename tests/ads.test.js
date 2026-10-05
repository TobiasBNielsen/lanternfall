'use strict';

// Runs web/js/ads.js the way the page does, against a fake page, a fake Sound and a fake ad network.
// Run with: node --test "tests/*.test.js"

const { test, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'ads.js'), 'utf8');

function element(tagName) {
  const classes = new Set();
  return {
    tagName, dataset: {}, style: {}, attrs: {}, children: [],
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
  };
}

function load(config, { crazy, hidden = false, search = '' } = {}) {
  const sound = { suspended: 0, resumed: 0, suspend() { this.suspended++; }, resume() { this.resumed++; } };
  const byId = { adBanner: element('aside'), adSlot: element('div') };
  byId.adBanner.classList.add('hidden');
  const document = { hidden, head: element('head'), createElement: element, getElementById: id => byId[id] || null };
  const window = crazy ? { CrazyGames: { SDK: crazy } } : {};
  const ctx = vm.createContext({
    CONFIG: config, Sound: sound, document, window, location: { hostname: 'example.com', search },
    // looked up at call time so mock.timers can take over
    setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a),
  });
  vm.runInContext(SOURCE, ctx);
  return { Ads: vm.runInContext('Ads', ctx), sound, document, window, byId };
}

// outcome: 'finish' | 'error' | 'startThenError' | 'silent'
function fakeCrazy({ environment = 'crazygames', adblock = false, outcome = 'finish', bannerFails = false } = {}) {
  const calls = [];
  return {
    calls, environment,
    init: async () => {},
    ad: {
      hasAdblock: async () => adblock,
      requestAd(type, cb) {
        calls.push(type);
        if (outcome === 'finish') { cb.adStarted(); cb.adFinished(); }
        if (outcome === 'error') cb.adError('unfilled');
        if (outcome === 'startThenError') { cb.adStarted(); cb.adError('other'); }
      },
    },
    banner: {
      requestResponsiveBanner: async id => { calls.push('banner:' + id); if (bannerFails) throw new Error('bannerError'); },
      clearAllBanners() { calls.push('clear'); },
    },
    game: { gameplayStart() { calls.push('start'); }, gameplayStop() { calls.push('stop'); } },
  };
}

const google = (over = {}) => ({ ads: 'google', api: 'api/', google: { client: 'ca-pub-1', h5: false, bannerSlot: null, ...over } });

test('none: nothing to show, and every call settles at once', async () => {
  const { Ads, byId, sound } = load({ ads: 'none', api: 'api/' });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), false);
  assert.strictEqual(await Ads.rewarded(), false);
  assert.strictEqual(await Ads.interstitial(), undefined);
  Ads.showBanner();
  assert.ok(byId.adBanner.classList.contains('hidden'));
  assert.strictEqual(sound.suspended, 0);
});

test('an unknown network behaves like none', async () => {
  const { Ads } = load({ ads: 'somethingelse', api: 'api/' });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), false);
  assert.strictEqual(await Ads.rewarded(), false);
});

test('crazygames: a rewarded advert watched to the end pays, with the sound off meanwhile', async () => {
  const sdk = fakeCrazy();
  const { Ads, sound } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), true);
  assert.strictEqual(await Ads.rewarded(), true);
  assert.deepStrictEqual(sdk.calls, ['rewarded']);
  assert.strictEqual(sound.suspended, 1);
  assert.strictEqual(sound.resumed, 1);
  assert.strictEqual(Ads.busy, false);
});

test('crazygames: no advert to show pays nothing and leaves the sound alone', async () => {
  const { Ads, sound } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy({ outcome: 'error' }) });
  await Ads.init();
  assert.strictEqual(await Ads.rewarded(), false);
  assert.strictEqual(sound.suspended, 0);
  assert.strictEqual(sound.resumed, 0);
});

test('crazygames: an advert that breaks off pays nothing and gives the sound back', async () => {
  const { Ads, sound } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy({ outcome: 'startThenError' }) });
  await Ads.init();
  assert.strictEqual(await Ads.rewarded(), false);
  assert.strictEqual(sound.resumed, 1);
});

test('crazygames: the interstitial is a midgame advert', async () => {
  const sdk = fakeCrazy();
  const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
  await Ads.init();
  await Ads.interstitial();
  assert.deepStrictEqual(sdk.calls, ['midgame']);
});

test('crazygames: outside CrazyGames the SDK is disabled and nothing is asked for', async () => {
  const sdk = fakeCrazy({ environment: 'disabled' });
  const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), false);
  assert.strictEqual(await Ads.rewarded(), false);
  await Ads.interstitial();
  Ads.gameplay(true);
  assert.deepStrictEqual(sdk.calls, []);
});

test('crazygames: with an ad blocker there is no reward on offer', async () => {
  const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy({ adblock: true }) });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), false);
});

test('crazygames: the SDK script did not load at all', async () => {
  const { Ads } = load({ ads: 'crazygames', api: 'x' });
  await Ads.init();
  assert.strictEqual(Ads.canReward(), false);
  assert.strictEqual(await Ads.rewarded(), false);
});

test('crazygames: banner shows in the slot, and goes away again', async () => {
  const sdk = fakeCrazy();
  const { Ads, byId } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
  await Ads.init();
  Ads.showBanner();
  assert.ok(!byId.adBanner.classList.contains('hidden'));
  assert.deepStrictEqual(sdk.calls, ['banner:adSlot']);
  Ads.hideBanner();
  assert.ok(byId.adBanner.classList.contains('hidden'));
  assert.deepStrictEqual(sdk.calls, ['banner:adSlot', 'clear']);
});

test('crazygames: a banner that fails hides its frame', async () => {
  const { Ads, byId } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy({ bannerFails: true }) });
  await Ads.init();
  Ads.showBanner();
  await new Promise(r => setImmediate(r));
  assert.ok(byId.adBanner.classList.contains('hidden'));
});

test('crazygames: gameplay start and stop are passed on', async () => {
  const sdk = fakeCrazy();
  const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
  await Ads.init();
  Ads.gameplay(true);
  Ads.gameplay(false);
  assert.deepStrictEqual(sdk.calls, ['start', 'stop']);
});

test('an advert that never starts gives up after 8 seconds', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy({ outcome: 'silent' }) });
    await Ads.init();
    const reward = Ads.rewarded();
    assert.strictEqual(Ads.busy, true);
    mock.timers.tick(7999);
    assert.strictEqual(Ads.busy, true);
    mock.timers.tick(1);
    assert.strictEqual(await reward, false);
    assert.strictEqual(Ads.busy, false);
  } finally {
    mock.timers.reset();
  }
});

test('a second advert while one runs is refused', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const sdk = fakeCrazy({ outcome: 'silent' });
    const { Ads } = load({ ads: 'crazygames', api: 'x' }, { crazy: sdk });
    await Ads.init();
    const first = Ads.rewarded();
    assert.strictEqual(await Ads.rewarded(), false);
    assert.deepStrictEqual(sdk.calls, ['rewarded']);
    mock.timers.tick(8000);
    await first;
  } finally {
    mock.timers.reset();
  }
});

test('sound stays off when the page is hidden as the advert ends', async () => {
  const { Ads, sound } = load({ ads: 'crazygames', api: 'x' }, { crazy: fakeCrazy(), hidden: true });
  await Ads.init();
  await Ads.rewarded();
  assert.strictEqual(sound.suspended, 1);
  assert.strictEqual(sound.resumed, 0);
});

test('google: loads AdSense once, with the client id', async () => {
  const { Ads, document } = load(google());
  await Ads.init();
  const [script] = document.head.children;
  assert.match(script.src, /adsbygoogle\.js\?client=ca-pub-1$/);
  assert.strictEqual(script.attrs['data-ad-client'], 'ca-pub-1');
  assert.strictEqual(script.attrs['data-adbreak-test'], undefined);
});

test('google: ?adtest=1 turns on test adverts', async () => {
  const { Ads, document } = load(google(), { search: '?adtest=1' });
  await Ads.init();
  assert.strictEqual(document.head.children[0].attrs['data-adbreak-test'], 'on');
});

test('google: before H5 Games Ads is approved there are no game adverts', async () => {
  const { Ads, window } = load(google());
  await Ads.init();
  let asked = 0;
  window.adsbygoogle = { push: () => { asked++; } };
  Ads.offerReward(() => {});
  assert.strictEqual(Ads.canReward(), false);
  await Ads.interstitial();
  assert.strictEqual(asked, 0);
});

test('google: without a banner slot the banner frame stays hidden', async () => {
  const { Ads, byId } = load(google());
  await Ads.init();
  Ads.showBanner();
  assert.ok(byId.adBanner.classList.contains('hidden'));
});

test('google: with a banner slot one AdSense unit is placed in the slot', async () => {
  const { Ads, byId, window } = load(google({ bannerSlot: '123' }));
  await Ads.init();
  const pushed = [];
  window.adsbygoogle = { push: o => pushed.push(o) };
  Ads.showBanner();
  Ads.hideBanner();
  Ads.showBanner();
  assert.ok(!byId.adBanner.classList.contains('hidden'));
  assert.strictEqual(byId.adSlot.children.length, 1);
  assert.strictEqual(byId.adSlot.children[0].dataset.adSlot, '123');
  assert.strictEqual(pushed.length, 1);
});

test('google: a rewarded advert is offered first, then shown, and pays only when viewed', async () => {
  const { Ads, window, sound } = load(google({ h5: true }));
  await Ads.init();
  let placement;
  window.adsbygoogle = { push: o => { placement = o; } };
  let readyCalls = 0;
  Ads.offerReward(() => { readyCalls++; });
  assert.strictEqual(placement.type, 'reward');
  assert.strictEqual(Ads.canReward(), false);
  let shown = 0;
  placement.beforeReward(() => { shown++; });
  assert.strictEqual(readyCalls, 1);
  assert.strictEqual(Ads.canReward(), true);
  const reward = Ads.rewarded();
  assert.strictEqual(shown, 1);
  placement.beforeAd();
  placement.adViewed();
  placement.adBreakDone({ breakStatus: 'viewed' });
  assert.strictEqual(await reward, true);
  assert.strictEqual(sound.suspended, 1);
  assert.strictEqual(sound.resumed, 1);
  assert.strictEqual(Ads.canReward(), false);
});

test('google: a dismissed rewarded advert pays nothing', async () => {
  const { Ads, window } = load(google({ h5: true }));
  await Ads.init();
  let placement;
  window.adsbygoogle = { push: o => { placement = o; } };
  Ads.offerReward(() => {});
  placement.beforeReward(() => {});
  const reward = Ads.rewarded();
  placement.beforeAd();
  placement.adDismissed();
  placement.adBreakDone({ breakStatus: 'dismissed' });
  assert.strictEqual(await reward, false);
});

test('google: the interstitial is a "next" break that settles when done', async () => {
  const { Ads, window } = load(google({ h5: true }));
  await Ads.init();
  let placement;
  window.adsbygoogle = { push: o => { placement = o; } };
  const shown = Ads.interstitial();
  assert.strictEqual(placement.type, 'next');
  placement.adBreakDone({ breakStatus: 'frequencyCapped' });
  await shown;
});

test('google: a blocked script means no adverts, at once', async () => {
  const { Ads, document } = load(google({ h5: true }));
  await Ads.init();
  document.head.children[0].onerror();
  Ads.offerReward(() => {});
  assert.strictEqual(Ads.canReward(), false);
  assert.strictEqual(Ads.busy, false);
  await Ads.interstitial();
  assert.strictEqual(Ads.busy, false);
});
