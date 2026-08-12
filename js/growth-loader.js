(function(global) {
  'use strict';

  var loadPromise = null;
  var VERSION = '1';

  function status(message) {
    var node = global.document && global.document.getElementById('growth-live-status');
    if (node) node.textContent = message || '';
  }

  function addStyles() {
    if (!global.document || global.document.querySelector('link[data-ridehero-growth],link[href*="css/growth-engine.css"]')) return;
    var link = global.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/growth-engine.css?v=' + VERSION;
    link.dataset.rideheroGrowth = 'true';
    global.document.head.appendChild(link);
  }

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var existing = global.document.querySelector('script[data-growth-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.growthFailed === 'true') {
          existing.remove();
          existing = null;
        }
      }
      if (existing) {
        if (existing.dataset.growthLoaded === 'true' && !ready()) {
          existing.remove();
          existing = null;
        }
      }
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var script = global.document.createElement('script');
      script.src = '/' + src.replace(/^\//, '') + '?v=' + VERSION;
      script.async = true;
      script.dataset.growthSrc = src;
      script.onload = function() {
        script.dataset.growthLoaded = 'true';
        if (ready()) resolve();
        else {
          script.remove();
          reject(new Error('RideHero sharing loaded without its expected module.'));
        }
      };
      script.onerror = function() {
        script.dataset.growthFailed = 'true';
        script.remove();
        reject(new Error('Could not load RideHero sharing.'));
      };
      global.document.head.appendChild(script);
    });
  }

  function ensure() {
    if (global.RideHeroGrowth) return Promise.resolve(global.RideHeroGrowth);
    if (loadPromise) return loadPromise;
    status('Loading RideHero sharing…');
    addStyles();
    loadPromise = loadScript('js/share-model.js', function(){ return !!global.RideHeroShareModel; })
      .then(function(){ return loadScript('js/growth-analytics.js', function(){ return !!global.RideHeroAnalytics; }); })
      .then(function(){ return loadScript('js/share-actions.js', function(){ return !!global.RideHeroShareActions; }); })
      .then(function(){ return loadScript('js/growth-engine.js', function(){ return !!global.RideHeroGrowth; }); })
      .then(function(){ return global.RideHeroGrowth; })
      .catch(function(error) {
        loadPromise = null;
        status('Sharing is temporarily unavailable. Please try again.');
        if (hasSharedRouteUrl()) renderLoaderState('error');
        throw error;
      });
    return loadPromise;
  }

  function invoke(method, args) {
    return ensure().then(function(api) {
      if (!api || typeof api[method] !== 'function') throw new Error('Sharing action unavailable.');
      return api[method].apply(api, args || []);
    }).catch(function(error) {
      console.error(error);
      status('That sharing action could not be completed. Please try again.');
      return null;
    });
  }

  function hasSharedRouteUrl() {
    var pathname = String(global.location && global.location.pathname || '');
    var params = new URLSearchParams(global.location && global.location.search || '');
    return /\/r\/[A-Za-z0-9_-]+\/?$/.test(pathname) || params.has('s') || /^#\/(?:shared|r)\//.test(String(global.location && global.location.hash || ''));
  }

  function clearSharedUrl(targetHash) {
    var hash = String(targetHash || '');
    if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
    var target = '/' + hash;
    if (global.history && typeof global.history.replaceState === 'function') global.history.replaceState(null, '', target);
    return target;
  }

  function renderLoaderState(state) {
    if (!global.document) return;
    if (typeof global.showScreen === 'function') global.showScreen('shared-route');
    var appNav = global.document.getElementById('app-nav');
    if (appNav) appNav.hidden = true;
    var root = global.document.getElementById('shared-route-root');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var shell = global.document.createElement('div'); shell.className = 'growth-shell';
    var main = global.document.createElement('main'); main.className = 'growth-main';
    var box = global.document.createElement('section'); box.className = 'shared-route-message';
    var heading = global.document.createElement('h1'); heading.tabIndex = -1;
    var copy = global.document.createElement('p');
    if (state === 'error') {
      heading.textContent = "We couldn't load this RideHero route.";
      copy.textContent = 'Check your connection and try again, or plan your own route.';
      var actions = global.document.createElement('div'); actions.className = 'growth-actions';
      var retry = global.document.createElement('button'); retry.type = 'button'; retry.className = 'growth-primary'; retry.textContent = 'Retry';
      retry.addEventListener('click', function(){ renderLoaderState('loading'); global.RideHeroGrowthLoader.openSharedRouteFromUrl(); });
      var own = global.document.createElement('button'); own.type = 'button'; own.className = 'growth-secondary'; own.textContent = 'Plan My Own Route';
      own.addEventListener('click', function(){ clearSharedUrl('#/brands'); if (typeof global.showScreen === 'function') global.showScreen('setup'); });
      actions.appendChild(retry); actions.appendChild(own); box.appendChild(heading); box.appendChild(copy); box.appendChild(actions);
    } else {
      box.setAttribute('aria-busy', 'true');
      heading.textContent = 'Loading shared route…';
      copy.textContent = 'Checking the saved itinerary and current park information.';
      box.appendChild(heading); box.appendChild(copy);
    }
    main.appendChild(box); shell.appendChild(main); root.appendChild(shell);
    heading.focus({ preventScroll:true });
  }

  global.RideHeroGrowthLoader = {
    ensure: ensure,
    openRouteShare: function(){ return invoke('openRouteShare'); },
    openDaySummary: function(reason){ return invoke('openDaySummary', [reason]); },
    endActiveRoute: function(){ return invoke('endActiveRoute'); },
    openSharedRouteFromUrl: function(){ return invoke('openSharedRouteFromUrl'); },
    clearSharedUrl: clearSharedUrl
  };
  global.openRouteShare = function(){ return global.RideHeroGrowthLoader.openRouteShare(); };
  global.endRideHeroRoute = function(){ return global.RideHeroGrowthLoader.endActiveRoute(); };

  function bootSharedRoute() {
    if (!hasSharedRouteUrl()) return;
    if (typeof global.finishSplash === 'function') global.finishSplash(true);
    renderLoaderState('loading');
    global.RideHeroGrowthLoader.openSharedRouteFromUrl();
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', bootSharedRoute, { once: true });
  else bootSharedRoute();
})(window);
