'use strict';

// Adverts, from the network this copy of the game was built for (CONFIG.ads). Nothing in here may hold the
// game up: every call settles by itself, and with no network, an ad blocker or no advert to show, play goes on.
const Ads = (() => {
  // how long an advert may take to begin before we stop waiting; the full-screen one is optional, so it waits less
  const REWARD_WAIT = 8000;
  const BREAK_WAIT = 2000;

  const none = {
    init() {},
    canReward: () => false,
    offerReward() {},
    rewarded(started, done) { done(false); },
    interstitial(started, done) { done(false); },
    showBanner: () => false,
    hideBanner() {},
    gameplay() {},
  };

  // CrazyGames SDK v3. Their rules: only their adverts, sound off while one plays, no banners during play.
  function crazyGames() {
    const sdk = () => window.CrazyGames && window.CrazyGames.SDK;
    let on = false, blocked = true;
    function request(type, started, done) {
      if (!on) return done(false);
      sdk().ad.requestAd(type, { adStarted: started, adFinished: () => done(true), adError: () => done(false) });
    }
    return {
      async init() {
        const s = sdk();
        if (!s) return; // the SDK script did not load
        await s.init();
        if (s.environment === 'disabled') return; // not on CrazyGames
        on = true;
        blocked = await s.ad.hasAdblock().catch(() => true);
      },
      canReward: () => on && !blocked,
      offerReward() {},
      rewarded(started, done) { request('rewarded', started, done); },
      interstitial(started, done) { request('midgame', started, done); },
      showBanner(id, failed) {
        if (!on) return false;
        sdk().banner.requestResponsiveBanner(id).catch(failed);
        return true;
      },
      hideBanner() { if (on) sdk().banner.clearAllBanners(); },
      gameplay(playing) {
        if (!on) return;
        if (playing) sdk().game.gameplayStart(); else sdk().game.gameplayStop();
      },
    };
  }

  // Google: AdSense for the banner, and H5 Games Ads (the Ad Placement API) for the rest once it is approved.
  function google(cfg) {
    let failed = false;   // the script was blocked
    let offer = null;     // a rewarded advert Google has ready: { show, started, done, viewed }
    let banner = null;    // the AdSense unit, once placed
    let hideBox = null;   // hides the banner frame again
    const h5 = () => cfg.h5 && !failed;
    return {
      init() {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = o => window.adsbygoogle.push(o);
        const s = document.createElement('script');
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.client}`;
        s.setAttribute('data-ad-client', cfg.client);
        s.setAttribute('data-ad-frequency-hint', '120s');
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]adtest=1\b/.test(location.search)) {
          s.setAttribute('data-adbreak-test', 'on');
        }
        s.onerror = () => { failed = true; offer = null; if (hideBox) hideBox(); };
        document.head.appendChild(s);
        if (cfg.h5) window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
      },
      canReward: () => h5() && !!offer,
      // Google says whether a rewarded advert is ready by calling beforeReward; only then may we offer it.
      offerReward(ready) {
        if (!h5()) return;
        offer = null; // an offer from an earlier stop may have lapsed, so ask again every time
        const o = { show: null, started: null, done: null, viewed: false };
        window.adBreak({
          type: 'reward',
          name: 'dock-pearls',
          beforeReward(show) { o.show = show; offer = o; ready(); },
          beforeAd() { if (o.started) o.started(); },
          adViewed() { o.viewed = true; },
          adDismissed() {},
          adBreakDone() {
            const lapsed = offer === o;
            if (lapsed) offer = null;
            if (o.done) o.done(o.viewed);
            else if (lapsed) ready(); // Google withdrew it unused: take the button away
          },
        });
      },
      rewarded(started, done) {
        const o = h5() && offer;
        if (!o) return done(false);
        offer = null; // one advert per offer, whatever Google answers
        o.started = started;
        o.done = done;
        o.show();
      },
      interstitial(started, done) {
        if (!h5()) return done(false);
        window.adBreak({ type: 'next', name: 'game-over', beforeAd: started, afterAd() {}, adBreakDone: () => done(true) });
      },
      showBanner(id, hide) {
        hideBox = hide;
        if (!cfg.bannerSlot || failed) return false;
        if (banner) return banner.getAttribute('data-ad-status') !== 'unfilled';
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.dataset.adClient = cfg.client;
        ins.dataset.adSlot = cfg.bannerSlot;
        ins.dataset.adFormat = 'auto';
        ins.dataset.fullWidthResponsive = 'true';
        document.getElementById(id).appendChild(ins);
        window.adsbygoogle.push({});
        banner = ins;
        // AdSense marks a unit it had nothing for; an empty frame must not stay on the title page
        if (typeof MutationObserver !== 'undefined') {
          new MutationObserver(() => {
            if (ins.getAttribute('data-ad-status') === 'unfilled' && hideBox) hideBox();
          }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
        }
        return true;
      },
      hideBanner() {},
      gameplay() {},
    };
  }

  const networks = { crazygames: crazyGames, google: () => google(CONFIG.google || {}), none: () => none };
  let net = none; // until init() has run
  let busy = false;
  let onLateAdvert = null;

  // Runs one advert. run(started, done) asks the network, which calls started() as the advert begins and
  // done(viewed) when it is over or did not happen. Settles with whether it was watched to the end.
  function play(run, wait) {
    if (busy) return Promise.resolve(false);
    busy = true;
    return new Promise(resolve => {
      let begun = false, over = false, late = false;
      const done = viewed => {
        if (late) {
          late = false;
          busy = false;
          if (!document.hidden) Sound.resume();
          return;
        }
        if (over) return;
        over = true;
        clearTimeout(timer);
        busy = false;
        // a hidden page keeps its sound off; the game turns it back on when the page shows again
        if (begun && !document.hidden) Sound.resume();
        resolve(!!viewed);
      };
      const started = () => {
        if (begun) return;
        begun = true;
        Sound.suspend();
        if (over) {
          // the advert came after we stopped waiting: hold the game until it is gone (it pays nothing now)
          late = true;
          busy = true;
          try { if (onLateAdvert) onLateAdvert(); } catch (e) { /* the game goes on under it */ }
        }
      };
      const timer = setTimeout(() => { if (!begun) done(false); }, wait);
      try { run(started, done); } catch (e) { done(false); }
    });
  }

  function banner() { return document.getElementById('adBanner'); }

  return {
    get busy() { return busy; },
    // called when an advert turns up after we stopped waiting for it, so the game can pause
    set onLateAdvert(fn) { onLateAdvert = fn; },
    async init() {
      const n = (networks[CONFIG.ads] || networks.none)();
      try { await n.init(); net = n; } catch (e) { net = none; }
    },
    canReward() { try { return net.canReward(); } catch (e) { return false; } },
    offerReward(ready) { try { net.offerReward(ready); } catch (e) { /* no reward this time */ } },
    rewarded() { return play((started, done) => net.rewarded(started, done), REWARD_WAIT); },
    interstitial() { return play((started, done) => net.interstitial(started, done), BREAK_WAIT).then(() => {}); },
    // the game's own way back to sound (a tab shown again) must not play over an advert
    resumeSound() { if (!busy) Sound.resume(); },
    showBanner() {
      const box = banner();
      if (!box) return;
      const hide = () => box.classList.add('hidden');
      box.classList.remove('hidden'); // the slot has to have a size before an advert is asked for
      try { if (!net.showBanner('adSlot', hide)) hide(); } catch (e) { hide(); }
    },
    hideBanner() {
      const box = banner();
      if (box) box.classList.add('hidden');
      try { net.hideBanner(); } catch (e) { /* nothing to clear */ }
    },
    gameplay(playing) { try { net.gameplay(playing); } catch (e) { /* not reported */ } },
  };
})();
