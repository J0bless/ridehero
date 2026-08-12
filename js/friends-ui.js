(function(global) {
  'use strict';

  var activeDialog = null;
  var previousFocus = null;
  var loadedAccountUserId = '';

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

  function removeChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function getAuthState() {
    try {
      return global.RideHeroAuth && typeof global.RideHeroAuth.getState === 'function'
        ? global.RideHeroAuth.getState()
        : null;
    } catch (error) { return null; }
  }

  function currentAccountId() {
    var state = getAuthState();
    return state && state.authenticated && state.profileComplete && state.user
      ? String(state.user.id || '')
      : '';
  }

  function legacyFriends() {
    try {
      return global.RideHeroFriendsStore && typeof global.RideHeroFriendsStore.listFriends === 'function'
        ? global.RideHeroFriendsStore.listFriends()
        : [];
    } catch (error) { return []; }
  }

  function connectedAccountCount() {
    var accountId = currentAccountId();
    if (!accountId || loadedAccountUserId !== accountId) return 0;
    try {
      var state = global.RideHeroAccountFriends && global.RideHeroAccountFriends.getState();
      return state && Array.isArray(state.rows) ? state.rows.filter(function(row) {
        return row && row.state === 'friend';
      }).length : 0;
    } catch (error) { return 0; }
  }

  function syncTriggers() {
    if (!global.document) return;
    var count = connectedAccountCount() + legacyFriends().length;
    global.document.querySelectorAll('.friends-trigger').forEach(function(button) {
      button.setAttribute('aria-label', count ? 'Friends, ' + count + ' connected or saved' : 'Friends and route sharing');
      button.setAttribute('aria-haspopup', 'dialog');
      var badge = button.querySelector('[data-friends-count]');
      if (!badge) return;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  function announceLegacyChange() {
    if (!global.document || typeof global.CustomEvent !== 'function') return;
    syncTriggers();
    global.document.dispatchEvent(new global.CustomEvent('ridehero:friends-changed', {
      detail: { count: legacyFriends().length }
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

  function openAccountAuth() {
    closeDialog();
    if (typeof global.openRideHeroAccount === 'function') {
      global.openRideHeroAccount();
      return null;
    }
    if (global.RideHeroAuthUI && typeof global.RideHeroAuthUI.open === 'function') {
      return global.RideHeroAuthUI.open();
    }
    if (typeof global.openRideHeroAuth === 'function') return global.openRideHeroAuth();
    return null;
  }

  function safeFriendsMessage(error) {
    var code = error && error.code;
    if (code === 'AUTH_REQUIRED') return 'Sign in to manage account friends.';
    if (code === 'HANDLE_INVALID') return 'Enter an exact RideHero handle using 3-24 lowercase letters, numbers, or underscores.';
    if (code === 'FRIEND_ID_INVALID' || code === 'RESPONSE_INVALID') return 'That friend request is no longer available.';
    return 'Account friends are temporarily unavailable. Please try again.';
  }

  function openRouteShare(status) {
    var loader = global.RideHeroGrowthLoader;
    if (!loader || typeof loader.openRouteShare !== 'function') {
      status.textContent = 'Route sharing is temporarily unavailable.';
      return;
    }
    status.textContent = 'Opening RideHero route sharing...';
    closeDialog();
    // Account and legacy friend identities never enter the share payload.
    loader.openRouteShare();
  }

  function hasShareableRoute() {
    try {
      return !!(global.RideHeroGrowthBridge
        && typeof global.RideHeroGrowthBridge.hasActiveRoute === 'function'
        && global.RideHeroGrowthBridge.hasActiveRoute());
    } catch (error) { return false; }
  }

  function setBusy(dialog, busy) {
    if (!dialog) return;
    var panel = dialog.querySelector('.friends-panel');
    if (panel) panel.setAttribute('aria-busy', busy ? 'true' : 'false');
    dialog.querySelectorAll('[data-friends-action]').forEach(function(control) {
      control.disabled = busy || control.dataset.baseDisabled === 'true';
    });
  }

  function relationshipSection(titleText, emptyText) {
    var section = element('section', 'friends-relationship-section');
    var heading = element('h3', 'friends-section-title', titleText);
    var empty = element('p', 'friends-empty', emptyText);
    var list = element('ul', 'friends-list');
    append(section, heading, empty, list);
    return { section: section, empty: empty, list: list };
  }

  function relationshipIdentity(row) {
    var identity = element('span', 'friends-identity');
    var marker = row.displayName || row.handle || '?';
    var avatar = element('span', 'friends-avatar', Array.from(marker)[0].toLocaleUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    var copy = element('span', 'friends-identity-copy');
    var name = element('strong', 'friends-name', row.displayName || '@' + row.handle);
    var handle = element('span', 'friends-handle', '@' + row.handle);
    append(copy, name, handle);
    append(identity, avatar, copy);
    return identity;
  }

  function openFriends() {
    var document = global.document;
    var authState = getAuthState();
    var account = global.RideHeroAccountFriends;
    if (!document || !document.body) return null;

    // The account screen owns sign-in, unconfigured messaging, and profile setup.
    if (!authState || !authState.configured || !authState.authenticated || !authState.profileComplete) {
      return openAccountAuth();
    }
    if (!account || typeof account.load !== 'function') return openAccountAuth();

    if (activeDialog) {
      var existingInput = activeDialog.querySelector('[data-friend-handle]');
      if (existingInput) existingInput.focus({ preventScroll: true });
      return activeDialog;
    }

    var actorId = String(authState.user && authState.user.id || '');
    previousFocus = document.activeElement;
    var dialog = element('dialog', 'friends-dialog');
    dialog.id = 'ridehero-friends-dialog';
    dialog.setAttribute('aria-labelledby', 'ridehero-friends-title');
    dialog.setAttribute('aria-describedby', 'ridehero-friends-privacy');

    var panel = element('div', 'friends-panel');
    var headingRow = element('div', 'friends-heading-row');
    var headingCopy = element('div', 'friends-heading-copy');
    var eyebrow = element('span', 'friends-eyebrow', 'ACCOUNT FRIENDS');
    var title = element('h2', 'friends-title', 'Friends & route sharing');
    title.id = 'ridehero-friends-title';
    append(headingCopy, eyebrow, title);
    var close = element('button', 'friends-close', 'x');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close friends');
    close.addEventListener('click', closeDialog);
    append(headingRow, headingCopy, close);

    var privacy = element('p', 'friends-privacy', 'Add friends by their exact RideHero handle. RideHero never exposes friend email addresses or includes friend identity in route links or analytics.');
    privacy.id = 'ridehero-friends-privacy';

    var form = element('form', 'friends-add-form');
    var label = element('label', 'friends-label', 'Exact RideHero handle');
    label.htmlFor = 'ridehero-friend-handle';
    var fieldRow = element('div', 'friends-field-row');
    var handleField = element('div', 'friends-handle-field');
    var prefix = element('span', 'friends-handle-prefix', '@');
    prefix.setAttribute('aria-hidden', 'true');
    var input = element('input', 'friends-input friends-handle-input');
    input.id = 'ridehero-friend-handle';
    input.type = 'text';
    input.minLength = 3;
    input.maxLength = 24;
    input.pattern = '[a-z][a-z0-9_]{2,23}';
    input.required = true;
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.dataset.friendHandle = 'true';
    input.dataset.friendsAction = 'true';
    input.setAttribute('enterkeyhint', 'send');
    append(handleField, prefix, input);
    var add = element('button', 'friends-add', 'Add friend');
    add.type = 'submit';
    add.dataset.friendsAction = 'true';
    append(fieldRow, handleField, add);
    var addHelp = element('p', 'friends-help', 'Use the complete handle. For privacy, RideHero does not provide an account directory.');
    append(form, label, fieldRow, addHelp);

    var incoming = relationshipSection('Friend requests', 'No incoming requests.');
    var accepted = relationshipSection('Friends', 'No account friends yet. Add someone by their exact handle.');
    var outgoing = relationshipSection('Sent requests', 'No pending sent requests.');

    var legacySection = element('section', 'friends-legacy-section');
    var legacyHeading = element('h3', 'friends-section-title', 'Saved on this device');
    var legacyCopy = element('p', 'friends-legacy-copy', 'These are older local labels, not RideHero accounts. They were not uploaded, matched, or converted into friends.');
    var legacyEmpty = element('p', 'friends-empty', 'No legacy device-only names saved.');
    var legacyList = element('ul', 'friends-list friends-legacy-list');
    append(legacySection, legacyHeading, legacyCopy, legacyEmpty, legacyList);

    var status = element('div', 'friends-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');

    var shareCard = element('section', 'friends-share-card');
    shareCard.setAttribute('aria-labelledby', 'friends-share-heading');
    var shareHeading = element('h3', 'friends-section-title', 'Share your current route');
    shareHeading.id = 'friends-share-heading';
    var routeAvailable = hasShareableRoute();
    var shareCopy = element('p', 'friends-share-copy', routeAvailable
      ? 'Open RideHero sharing and choose how to send the private route link.'
      : 'Build an active route first, then return here to share its private RideHero link.');
    var share = element('button', 'friends-share-action', 'Share Route');
    share.type = 'button';
    share.disabled = !routeAvailable;
    share.dataset.baseDisabled = routeAvailable ? 'false' : 'true';
    share.dataset.friendsAction = 'true';
    share.addEventListener('click', function() { openRouteShare(status); });
    append(shareCard, shareHeading, shareCopy, share);

    function actorIsCurrent() {
      return !!actorId && actorId === currentAccountId() && activeDialog === dialog;
    }

    function accountAction(actionFactory, pendingCopy, completedCopy) {
      var promise;
      setBusy(dialog, true);
      status.textContent = pendingCopy;
      try { promise = actionFactory(); }
      catch (error) { promise = Promise.reject(error); }
      return Promise.resolve(promise).then(function(state) {
        if (!actorIsCurrent()) return false;
        loadedAccountUserId = actorId;
        renderAccountState(state);
        status.textContent = completedCopy;
        syncTriggers();
        return true;
      }).catch(function(error) {
        if (!actorIsCurrent()) return false;
        status.textContent = safeFriendsMessage(error);
        return false;
      }).then(function(succeeded) {
        if (actorIsCurrent()) setBusy(dialog, false);
        return succeeded;
      });
    }

    function actionButton(className, copy, labelText, handler) {
      var button = element('button', className, copy);
      button.type = 'button';
      button.dataset.friendsAction = 'true';
      if (labelText) button.setAttribute('aria-label', labelText);
      button.addEventListener('click', handler);
      return button;
    }

    function renderAccountState(state) {
      var rows = state && Array.isArray(state.rows) ? state.rows : [];
      var incomingRows = rows.filter(function(row) { return row.state === 'incoming_request'; });
      var friendRows = rows.filter(function(row) { return row.state === 'friend'; });
      var outgoingRows = rows.filter(function(row) { return row.state === 'outgoing_request'; });
      removeChildren(incoming.list);
      removeChildren(accepted.list);
      removeChildren(outgoing.list);
      incoming.empty.hidden = incomingRows.length !== 0;
      accepted.empty.hidden = friendRows.length !== 0;
      outgoing.empty.hidden = outgoingRows.length !== 0;

      incomingRows.forEach(function(row) {
        var item = element('li', 'friends-list-item');
        var actions = element('span', 'friends-row-actions');
        var accept = actionButton('friends-accept', 'Accept', 'Accept friend request', function() {
          accountAction(function() { return account.acceptRequest(row.relationshipId); }, 'Updating friend request...', 'Friend request updated.');
        });
        var decline = actionButton('friends-decline', 'Decline', 'Decline friend request', function() {
          accountAction(function() { return account.declineRequest(row.relationshipId); }, 'Updating friend request...', 'Friend request updated.');
        });
        append(actions, accept, decline);
        append(item, relationshipIdentity(row), actions);
        incoming.list.appendChild(item);
      });

      friendRows.forEach(function(row) {
        var item = element('li', 'friends-list-item');
        var actions = element('span', 'friends-row-actions');
        var send = actionButton('friends-send', 'Share', 'Share the current route using your device share sheet', function() {
          openRouteShare(status);
        });
        send.disabled = !routeAvailable;
        send.dataset.baseDisabled = routeAvailable ? 'false' : 'true';
        var remove = actionButton('friends-remove', 'Remove', 'Remove friend', function() {
          accountAction(function() { return account.removeFriend(row.userId); }, 'Removing friend...', 'Friend removed.');
        });
        append(actions, send, remove);
        append(item, relationshipIdentity(row), actions);
        accepted.list.appendChild(item);
      });

      outgoingRows.forEach(function(row) {
        var item = element('li', 'friends-list-item');
        var pending = element('span', 'friends-state-pill', 'Pending');
        append(item, relationshipIdentity(row), pending);
        outgoing.list.appendChild(item);
      });
    }

    function renderLegacyFriends() {
      removeChildren(legacyList);
      var names = legacyFriends();
      legacyEmpty.hidden = names.length !== 0;
      names.forEach(function(displayName) {
        var item = element('li', 'friends-list-item friends-legacy-item');
        var nameWrap = element('span', 'friends-identity');
        var avatar = element('span', 'friends-avatar friends-legacy-avatar', Array.from(displayName)[0] || '?');
        avatar.setAttribute('aria-hidden', 'true');
        var name = element('span', 'friends-name', displayName);
        var local = element('span', 'friends-state-pill friends-local-pill', 'Local only');
        append(nameWrap, avatar, name, local);
        var remove = actionButton('friends-remove', 'Remove', 'Remove local name ' + displayName, function() {
          var store = global.RideHeroFriendsStore;
          if (!store || !store.removeFriend(displayName)) return;
          renderLegacyFriends();
          status.textContent = displayName + ' removed from this device.';
          announceLegacyChange();
        });
        append(item, nameWrap, remove);
        legacyList.appendChild(item);
      });
    }

    form.addEventListener('submit', function(event) {
      event.preventDefault();
      var requestedHandle = input.value;
      accountAction(function() { return account.sendRequest(requestedHandle); }, 'Processing friend request...', 'Request processed.').then(function(succeeded) {
        if (!succeeded || !actorIsCurrent()) return;
        input.value = '';
        input.focus({ preventScroll: true });
      });
    });

    append(panel,
      headingRow,
      privacy,
      form,
      incoming.section,
      accepted.section,
      outgoing.section,
      legacySection,
      shareCard,
      status
    );
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
    renderAccountState({ rows: [] });
    renderLegacyFriends();
    setBusy(dialog, true);
    status.textContent = 'Loading account friends...';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
    }
    input.focus({ preventScroll: true });

    Promise.resolve().then(function() { return account.load(); }).then(function(state) {
      if (!actorIsCurrent()) return;
      loadedAccountUserId = actorId;
      renderAccountState(state);
      status.textContent = '';
      setBusy(dialog, false);
      syncTriggers();
    }).catch(function(error) {
      if (!actorIsCurrent()) return;
      status.textContent = safeFriendsMessage(error);
      setBusy(dialog, false);
    });
    return dialog;
  }

  global.RideHeroFriendsUI = Object.freeze({
    open: openFriends,
    close: closeDialog,
    syncTriggers: syncTriggers
  });
  global.openRideHeroFriends = openFriends;

  if (global.RideHeroAuth && typeof global.RideHeroAuth.subscribe === 'function') {
    global.RideHeroAuth.subscribe(function(state) {
      var accountId = state && state.authenticated && state.profileComplete && state.user
        ? String(state.user.id || '')
        : '';
      if (!accountId || accountId !== loadedAccountUserId) loadedAccountUserId = '';
      if (activeDialog && (!state.authenticated || !state.profileComplete)) closeDialog();
      syncTriggers();
    });
  }
  if (global.document) {
    global.document.addEventListener('ridehero:account-friends-changed', syncTriggers);
    global.document.addEventListener('ridehero:friends-changed', syncTriggers);
  }
  syncTriggers();
})(window);
