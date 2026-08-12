(function(global) {
  'use strict';

  var activeDialog = null;
  var previousFocus = null;

  function syncTriggers() {
    if (!global.document || !global.RideHeroFriendsStore) return;
    var count = global.RideHeroFriendsStore.listFriends().length;
    global.document.querySelectorAll('.friends-trigger').forEach(function(button) {
      button.setAttribute('aria-label', count ? 'Friends, ' + count + ' saved' : 'Friends and route sharing');
      button.setAttribute('aria-haspopup', 'dialog');
      var badge = button.querySelector('[data-friends-count]');
      if (!badge) return;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  function element(tagName, className, text) {
    var node = global.document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function append(parent) {
    for (var index = 1; index < arguments.length; index += 1) {
      if (arguments[index]) parent.appendChild(arguments[index]);
    }
    return parent;
  }

  function announceChange(count) {
    if (!global.document || typeof global.CustomEvent !== 'function') return;
    syncTriggers();
    global.document.dispatchEvent(new global.CustomEvent('ridehero:friends-changed', {
      detail: { count: count }
    }));
  }

  function closeDialog() {
    if (!activeDialog) return;
    var dialog = activeDialog;
    activeDialog = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus({ preventScroll: true }); } catch (error) { previousFocus.focus(); }
    }
    previousFocus = null;
  }

  function openRouteShare(status) {
    var loader = global.RideHeroGrowthLoader;
    if (!loader || typeof loader.openRouteShare !== 'function') {
      status.textContent = 'Route sharing is temporarily unavailable.';
      return;
    }
    status.textContent = 'Opening RideHero route sharing…';
    closeDialog();
    // Friend records are intentionally not supplied to the share payload.
    loader.openRouteShare();
  }

  function hasShareableRoute() {
    try {
      return !!(global.RideHeroGrowthBridge && typeof global.RideHeroGrowthBridge.hasActiveRoute === 'function' && global.RideHeroGrowthBridge.hasActiveRoute());
    } catch (error) { return false; }
  }

  function openFriends() {
    var document = global.document;
    var store = global.RideHeroFriendsStore;
    if (!document || !document.body || !store) return null;
    if (activeDialog) {
      var existingInput = activeDialog.querySelector('[data-friend-name]');
      if (existingInput) existingInput.focus({ preventScroll: true });
      return activeDialog;
    }

    previousFocus = document.activeElement;
    var dialog = element('dialog', 'friends-dialog');
    dialog.id = 'ridehero-friends-dialog';
    dialog.setAttribute('aria-labelledby', 'ridehero-friends-title');
    dialog.setAttribute('aria-describedby', 'ridehero-friends-privacy');

    var panel = element('div', 'friends-panel');
    var headingRow = element('div', 'friends-heading-row');
    var headingCopy = element('div', 'friends-heading-copy');
    var eyebrow = element('span', 'friends-eyebrow', 'DEVICE-ONLY FRIENDS');
    var title = element('h2', 'friends-title', 'Friends & route sharing');
    title.id = 'ridehero-friends-title';
    append(headingCopy, eyebrow, title);
    var close = element('button', 'friends-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close friends');
    close.addEventListener('click', closeDialog);
    append(headingRow, headingCopy, close);

    var privacy = element('p', 'friends-privacy', "Display names stay on this device. RideHero doesn't create friend accounts, access contacts, send invitations, or sync routes in real time.");
    privacy.id = 'ridehero-friends-privacy';

    var form = element('form', 'friends-add-form');
    var label = element('label', 'friends-label', 'Friend display name');
    label.htmlFor = 'ridehero-friend-name';
    var fieldRow = element('div', 'friends-field-row');
    var input = element('input', 'friends-input');
    input.id = 'ridehero-friend-name';
    input.type = 'text';
    input.maxLength = store.MAX_DISPLAY_NAME_LENGTH || 40;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.friendName = 'true';
    input.setAttribute('enterkeyhint', 'done');
    var add = element('button', 'friends-add', 'Add');
    add.type = 'submit';
    append(fieldRow, input, add);
    append(form, label, fieldRow);

    var savedHeading = element('h3', 'friends-section-title', 'Saved on this device');
    var list = element('ul', 'friends-list');
    var empty = element('p', 'friends-empty', 'No friends added yet. Add a display name to keep it handy while planning.');
    var status = element('div', 'friends-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');

    var shareCard = element('section', 'friends-share-card');
    shareCard.setAttribute('aria-labelledby', 'friends-share-heading');
    var shareHeading = element('h3', 'friends-section-title', 'Share your current route');
    shareHeading.id = 'friends-share-heading';
    var routeAvailable = hasShareableRoute();
    var shareCopy = element('p', 'friends-share-copy', routeAvailable ? 'Share Route opens RideHero sharing so you can choose how to send the link. Adding a friend here does not send anything or create a live group route.' : 'Build an active route first, then return here to share its private RideHero link.');
    var share = element('button', 'friends-share-action', 'Share Route');
    share.type = 'button';
    share.disabled = !routeAvailable;
    share.addEventListener('click', function() { openRouteShare(status); });
    append(shareCard, shareHeading, shareCopy, share);

    function renderFriends() {
      while (list.firstChild) list.removeChild(list.firstChild);
      var friends = store.listFriends();
      empty.hidden = friends.length !== 0;
      friends.forEach(function(displayName) {
        var item = element('li', 'friends-list-item');
        var avatar = element('span', 'friends-avatar', Array.from(displayName)[0] || '?');
        avatar.setAttribute('aria-hidden', 'true');
        var name = element('span', 'friends-name', displayName);
        var actions = element('span', 'friends-row-actions');
        var send = element('button', 'friends-send', 'Share');
        send.type = 'button';
        send.disabled = !routeAvailable;
        send.setAttribute('aria-label', 'Share the current route with ' + displayName + ' using your device share sheet');
        send.addEventListener('click', function() { openRouteShare(status); });
        var remove = element('button', 'friends-remove', 'Remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + displayName);
        remove.addEventListener('click', function() {
          if (!store.removeFriend(displayName)) return;
          renderFriends();
          status.textContent = displayName + ' removed from this device.';
          announceChange(store.listFriends().length);
          input.focus({ preventScroll: true });
        });
        append(actions, send, remove);
        append(item, avatar, name, actions);
        list.appendChild(item);
      });
    }

    form.addEventListener('submit', function(event) {
      event.preventDefault();
      try {
        var displayName = store.addFriend(input.value);
        input.value = '';
        renderFriends();
        status.textContent = displayName + ' saved on this device.';
        announceChange(store.listFriends().length);
        input.focus({ preventScroll: true });
      } catch (error) {
        status.textContent = error && error.message ? error.message : 'That display name could not be added.';
        input.focus({ preventScroll: true });
      }
    });

    append(panel, headingRow, privacy, form, savedHeading, empty, list, shareCard, status);
    dialog.appendChild(panel);
    dialog.addEventListener('cancel', function(event) {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('click', function(event) {
      if (event.target === dialog) closeDialog();
    });
    document.body.appendChild(dialog);
    activeDialog = dialog;
    renderFriends();
    if (!store.isPersistent()) {
      status.textContent = 'This browser cannot save friend names right now; changes will last only for this page.';
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
    }
    input.focus({ preventScroll: true });
    return dialog;
  }

  global.RideHeroFriendsUI = Object.freeze({
    open: openFriends,
    close: closeDialog,
    syncTriggers: syncTriggers
  });
  global.openRideHeroFriends = openFriends;
  syncTriggers();
})(window);
