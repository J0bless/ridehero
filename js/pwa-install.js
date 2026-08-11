(function(global) {
  'use strict';
  var deferredPrompt = null;
  var button = document.getElementById('pwa-install-button');
  var status = document.getElementById('pwa-install-status');
  var standalone = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
  var ios = /iphone|ipad|ipod/i.test(global.navigator.userAgent || '');

  function announce(message) { if (status) status.textContent = message; }
  function hideButton() { if (button) button.hidden = true; }
  function showButton(label) {
    if (!button || standalone) return;
    button.textContent = label || 'Install RideHero';
    button.hidden = false;
  }

  if ('serviceWorker' in global.navigator) {
    global.addEventListener('load', function() {
      global.navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(function(error) {
        console.warn('RideHero offline support could not start.', error);
      });
    });
  }

  global.addEventListener('beforeinstallprompt', function(event) {
    event.preventDefault();
    deferredPrompt = event;
    showButton('Install RideHero');
  });

  global.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    standalone = true;
    hideButton();
    announce('RideHero was installed.');
  });

  if (ios && !global.navigator.standalone) showButton('Add RideHero to Home');

  if (button) button.addEventListener('click', async function() {
    if (deferredPrompt) {
      button.disabled = true;
      deferredPrompt.prompt();
      var choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      button.disabled = false;
      if (choice && choice.outcome === 'accepted') hideButton();
      announce(choice && choice.outcome === 'accepted' ? 'RideHero installation accepted.' : 'RideHero installation dismissed.');
      return;
    }
    if (ios && !global.navigator.standalone) {
      global.alert('To install RideHero, open the Share menu and choose Add to Home Screen.');
    }
  });
})(window);
