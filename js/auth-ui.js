(function(global) {
  'use strict';

  var activeDialog = null;
  var activeUnsubscribe = null;
  var mountedPages = [];
  var previousFocus = null;
  var notice = '';

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

  function safeMessage(error) {
    var code = error && error.code;
    switch (code) {
      case 'AUTH_NOT_CONFIGURED': return 'RideHero accounts are not available here yet.';
      case 'AUTH_REQUIRED': return 'Sign in to continue.';
      case 'EMAIL_INVALID': return 'Enter a valid email address.';
      case 'HANDLE_INVALID': return 'Use 3-24 lowercase letters, numbers, or underscores.';
      case 'RATE_LIMITED': return 'Please wait a moment before trying again.';
      case 'PROFILE_UNAVAILABLE': return 'That handle could not be saved. It may already be in use.';
      case 'DELETE_UNAVAILABLE': return 'Account deletion is temporarily unavailable.';
      default: return 'We could not complete that sign-in request. Please try again.';
    }
  }

  function setBusy(node, busy) {
    if (!node) return;
    node.setAttribute('aria-busy', busy ? 'true' : 'false');
    node.querySelectorAll('button,input').forEach(function(control) {
      if (busy) {
        control.dataset.authWasDisabled = control.disabled ? 'true' : 'false';
        control.disabled = true;
      } else if (control.dataset.authWasDisabled !== 'true') {
        control.disabled = false;
        delete control.dataset.authWasDisabled;
      }
    });
  }

  function announce(message) {
    notice = String(message || '');
    var surfaces = [];
    if (activeDialog) surfaces.push(activeDialog);
    mountedPages.forEach(function(page) {
      if (page && page.surface) surfaces.push(page.surface);
    });
    surfaces.forEach(function(surface) {
      var status = surface.querySelector('[data-auth-status]');
      if (status) status.textContent = notice;
    });
  }

  function syncTriggers(state) {
    if (!global.document || !global.RideHeroAuth) return;
    var current = state || global.RideHeroAuth.getState();
    global.document.querySelectorAll('.auth-trigger').forEach(function(button) {
      button.setAttribute('aria-haspopup', 'dialog');
      var label = 'Sign in or create a RideHero account';
      if (current.authenticated) {
        label = current.user && current.user.handle ? 'RideHero account for @' + current.user.handle : 'Complete your RideHero account';
      }
      button.setAttribute('aria-label', label);
      button.dataset.authenticated = current.authenticated ? 'true' : 'false';
      var badge = button.querySelector('[data-auth-avatar]');
      if (badge) {
        var marker = current.user && (current.user.handle || current.user.displayName);
        badge.textContent = marker ? Array.from(marker)[0].toLocaleUpperCase() : '';
        badge.hidden = !marker;
      }
    });
  }

  function closeDialog() {
    if (!activeDialog) return;
    var dialog = activeDialog;
    activeDialog = null;
    if (activeUnsubscribe) activeUnsubscribe();
    activeUnsubscribe = null;
    notice = '';
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus({ preventScroll: true }); } catch (error) { previousFocus.focus(); }
    }
    previousFocus = null;
  }

  function providerButton(provider, enabled, content, status) {
    var label = provider === 'google' ? 'Continue with Google' : 'Continue with Facebook';
    var button = element('button', 'auth-provider auth-provider-' + provider);
    button.type = 'button';
    button.disabled = !enabled;
    var icon = element('span', 'auth-provider-icon', provider === 'google' ? 'G' : 'f');
    icon.setAttribute('aria-hidden', 'true');
    var copy = element('span', '', label);
    append(button, icon, copy);
    button.addEventListener('click', function() {
      setBusy(content, true);
      status.textContent = 'Opening ' + (provider === 'google' ? 'Google' : 'Facebook') + ' sign-in...';
      global.RideHeroAuth.signInWithOAuth(provider).then(function() {
        status.textContent = 'Continue sign-in in the provider window.';
      }).catch(function(error) {
        setBusy(content, false);
        status.textContent = safeMessage(error);
      });
    });
    return button;
  }

  function renderSignedOut(content, status, state) {
    var config = global.RideHeroAuth.getConfiguration();
    var configured = !!state.configured;
    var intro = element('p', 'auth-intro', 'Create an account to connect with friends and share RideHero routes across devices.');
    var form = element('form', 'auth-email-form');
    var label = element('label', 'auth-label', 'Email address');
    label.htmlFor = 'ridehero-auth-email';
    var input = element('input', 'auth-input');
    input.id = 'ridehero-auth-email';
    input.type = 'email';
    input.inputMode = 'email';
    input.autocomplete = 'email';
    input.maxLength = 254;
    input.required = true;
    input.disabled = !configured || !config.emailEnabled;
    input.placeholder = 'you@example.com';
    var submit = element('button', 'auth-primary', 'Email me a sign-in link');
    submit.type = 'submit';
    submit.disabled = input.disabled;
    append(form, label, input, submit);
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      setBusy(content, true);
      status.textContent = 'Sending a secure sign-in link...';
      global.RideHeroAuth.signInWithEmail(input.value).then(function() {
        setBusy(content, false);
        input.value = '';
        status.textContent = 'Check your email for a secure RideHero sign-in link.';
      }).catch(function(error) {
        setBusy(content, false);
        status.textContent = safeMessage(error);
        input.focus({ preventScroll: true });
      });
    });

    var divider = element('div', 'auth-divider');
    divider.setAttribute('aria-hidden', 'true');
    append(divider, element('span'), element('b', '', 'or'), element('span'));

    var providers = element('div', 'auth-providers');
    var googleEnabled = configured && config.enabledProviders.indexOf('google') !== -1;
    var facebookEnabled = configured && config.enabledProviders.indexOf('facebook') !== -1;
    append(providers,
      providerButton('google', googleEnabled, content, status),
      providerButton('facebook', facebookEnabled, content, status)
    );

    var privacy = element('p', 'auth-privacy', 'RideHero uses your account for sign-in, friends, and routes you choose to share. Precise GPS history is not stored in your account.');
    privacy.id = 'ridehero-auth-privacy';
    append(content, intro, form, divider, providers, privacy);
    if (!configured) {
      var unavailable = element('div', 'auth-unavailable', 'Account setup is not connected in this environment yet. You can keep planning without signing in.');
      unavailable.setAttribute('role', 'note');
      content.insertBefore(unavailable, form);
      status.textContent = 'RideHero accounts are not available here yet.';
    }
  }

  function renderProfileForm(content, status, state) {
    var intro = element('p', 'auth-intro', 'Choose how friends will find and recognize you in RideHero.');
    var form = element('form', 'auth-profile-form');
    var displayLabel = element('label', 'auth-label', 'Display name');
    displayLabel.htmlFor = 'ridehero-auth-display-name';
    var display = element('input', 'auth-input');
    display.id = 'ridehero-auth-display-name';
    display.type = 'text';
    display.autocomplete = 'name';
    display.maxLength = 40;
    display.required = true;
    display.value = state.user && state.user.displayName || '';
    var handleLabel = element('label', 'auth-label auth-label-spaced', 'RideHero handle');
    handleLabel.htmlFor = 'ridehero-auth-handle';
    var handleField = element('div', 'auth-handle-field');
    var prefix = element('span', 'auth-handle-prefix', '@');
    prefix.setAttribute('aria-hidden', 'true');
    var handle = element('input', 'auth-input auth-handle-input');
    handle.id = 'ridehero-auth-handle';
    handle.type = 'text';
    handle.autocomplete = 'nickname';
    handle.autocapitalize = 'none';
    handle.spellcheck = false;
    handle.inputMode = 'text';
    handle.minLength = 3;
    handle.maxLength = 24;
    handle.pattern = '[a-z][a-z0-9_]{2,23}';
    handle.required = true;
    handle.setAttribute('aria-describedby', 'ridehero-auth-handle-help');
    append(handleField, prefix, handle);
    var help = element('p', 'auth-help', '3-24 characters. Begins with a letter; numbers and underscores are allowed after it. Your handle will be visible to friends.');
    help.id = 'ridehero-auth-handle-help';
    var submit = element('button', 'auth-primary', 'Finish account setup');
    submit.type = 'submit';
    append(form, displayLabel, display, handleLabel, handleField, help, submit);
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      setBusy(content, true);
      status.textContent = 'Saving your RideHero profile...';
      global.RideHeroAuth.completeProfile(handle.value, display.value).then(function() {
        announce('Your RideHero account is ready.');
      }).catch(function(error) {
        setBusy(content, false);
        status.textContent = safeMessage(error);
        handle.focus({ preventScroll: true });
      });
    });
    append(content, intro, form);
  }

  function renderDeleteConfirmation(content, status) {
    var box = element('section', 'auth-delete-confirm');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-labelledby', 'ridehero-delete-title');
    box.setAttribute('aria-describedby', 'ridehero-delete-copy');
    var title = element('h3', '', 'Delete your RideHero account?');
    title.id = 'ridehero-delete-title';
    var copy = element('p', '', 'This permanently removes your account-backed profile and friendships. Your current local plan is not deleted by this action.');
    copy.id = 'ridehero-delete-copy';
    var actions = element('div', 'auth-delete-actions');
    var cancel = element('button', 'auth-secondary', 'Cancel');
    cancel.type = 'button';
    var confirm = element('button', 'auth-danger', 'Delete account');
    confirm.type = 'button';
    cancel.addEventListener('click', function() {
      box.remove();
      cancel.focus({ preventScroll: true });
    });
    confirm.addEventListener('click', function() {
      setBusy(content, true);
      status.textContent = 'Deleting your RideHero account...';
      global.RideHeroAuth.requestAccountDeletion().then(function() {
        announce('Your RideHero account was deleted.');
      }).catch(function(error) {
        setBusy(content, false);
        status.textContent = safeMessage(error);
      });
    });
    append(actions, cancel, confirm);
    append(box, title, copy, actions);
    content.appendChild(box);
    cancel.focus({ preventScroll: true });
  }

  function renderAccount(content, status, state) {
    var identity = element('section', 'auth-identity');
    var markerText = state.user && (state.user.handle || state.user.displayName || state.user.email) || 'R';
    var avatar = element('span', 'auth-avatar', Array.from(markerText)[0].toLocaleUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    var copy = element('div', 'auth-identity-copy');
    var displayName = state.user && state.user.displayName || 'RideHero member';
    var name = element('strong', '', displayName);
    var handle = state.user && state.user.handle ? element('span', '', '@' + state.user.handle) : null;
    var email = state.user && state.user.email ? element('span', 'auth-email', state.user.email) : null;
    append(copy, name, handle, email);
    append(identity, avatar, copy);

    var ready = element('p', 'auth-ready', 'Your account is ready for account-backed friends and route sharing.');
    var friends = element('button', 'auth-primary auth-friends-open', 'Manage Friends');
    friends.type = 'button';
    friends.addEventListener('click', function() {
      if (typeof global.openRideHeroFriends === 'function') global.openRideHeroFriends();
    });
    var signOut = element('button', 'auth-secondary auth-signout', 'Sign out on this device');
    signOut.type = 'button';
    signOut.addEventListener('click', function() {
      setBusy(content, true);
      status.textContent = 'Signing out...';
      global.RideHeroAuth.signOut().then(function() {
        announce('You are signed out.');
      }).catch(function(error) {
        setBusy(content, false);
        status.textContent = safeMessage(error);
      });
    });
    append(content, identity, ready, friends, signOut);

    if (global.RideHeroAuth.canRequestAccountDeletion()) {
      var deleteButton = element('button', 'auth-delete-open', 'Delete account');
      deleteButton.type = 'button';
      deleteButton.addEventListener('click', function() {
        if (!content.querySelector('.auth-delete-confirm')) renderDeleteConfirmation(content, status);
      });
      content.appendChild(deleteButton);
    }
  }

  function renderState(dialog, state) {
    if (!dialog) return;
    syncTriggers(state);
    var title = dialog.querySelector('[data-auth-title]');
    var content = dialog.querySelector('[data-auth-content]');
    var status = dialog.querySelector('[data-auth-status]');
    if (!title || !content || !status) return;
    removeChildren(content);
    content.removeAttribute('aria-busy');
    title.textContent = state.authenticated ? (state.profileComplete ? 'Your RideHero account' : 'Finish your account') : 'Welcome to RideHero';

    if (state.status === 'loading' || state.status === 'idle') {
      content.setAttribute('aria-busy', 'true');
      append(content,
        element('div', 'auth-loading-mark', 'RH'),
        element('p', 'auth-loading-copy', 'Checking your RideHero account...')
      );
    } else if (state.authenticated && !state.profileComplete) {
      renderProfileForm(content, status, state);
    } else if (state.authenticated) {
      renderAccount(content, status, state);
    } else {
      renderSignedOut(content, status, state);
    }
    if (notice) status.textContent = notice;
  }

  function createSurface(kind) {
    var isDialog = kind === 'dialog';
    var surface = element(isDialog ? 'dialog' : 'section', isDialog ? 'auth-dialog' : 'auth-page');
    var titleId = isDialog ? 'ridehero-auth-title' : 'ridehero-auth-page-title';
    surface.setAttribute('aria-labelledby', titleId);
    var panel = element('div', 'auth-panel');
    if (!isDialog) {
      var brand = element('img', 'auth-wordmark');
      brand.src = '/icons/ridehero-wordmark.png';
      brand.alt = 'RideHero';
      brand.width = 280;
      brand.height = 50;
      panel.appendChild(brand);
    }
    var header = element('header', 'auth-header');
    var headingCopy = element('div', 'auth-heading-copy');
    var eyebrow = element('span', 'auth-eyebrow', 'RIDEHERO ACCOUNT');
    var title = element(isDialog ? 'h2' : 'h1', 'auth-title', 'Welcome to RideHero');
    title.id = titleId;
    title.dataset.authTitle = 'true';
    if (!isDialog) title.tabIndex = -1;
    append(headingCopy, eyebrow, title);
    var close = null;
    if (isDialog) {
      close = element('button', 'auth-close', 'x');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close account');
      close.addEventListener('click', closeDialog);
    }
    append(header, headingCopy, close);
    var content = element('div', 'auth-content');
    content.dataset.authContent = 'true';
    var status = element('div', 'auth-status');
    status.dataset.authStatus = 'true';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    append(panel, header, content, status);
    surface.appendChild(panel);
    return { surface: surface, title: title, content: content, status: status, close: close };
  }

  function openAuth() {
    var document = global.document;
    var auth = global.RideHeroAuth;
    if (!document || !document.body || !auth) return null;
    if (activeDialog) {
      var existingFocus = activeDialog.querySelector('input:not(:disabled),button:not(:disabled)');
      if (existingFocus) existingFocus.focus({ preventScroll: true });
      return activeDialog;
    }

    previousFocus = document.activeElement;
    var built = createSurface('dialog');
    var dialog = built.surface;
    dialog.id = 'ridehero-auth-dialog';
    dialog.addEventListener('cancel', function(event) {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('click', function(event) {
      if (event.target === dialog) closeDialog();
    });
    document.body.appendChild(dialog);
    activeDialog = dialog;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
    }

    activeUnsubscribe = auth.subscribe(function(state) { renderState(dialog, state); });
    auth.initialize().catch(function(error) {
      announce(safeMessage(error));
      renderState(dialog, auth.getState());
    });
    built.close.focus({ preventScroll: true });
    return dialog;
  }

  function renderPage(container) {
    var document = global.document;
    var auth = global.RideHeroAuth;
    if (!document || !container || !auth || typeof container.appendChild !== 'function') return null;
    if (typeof container.__rideHeroAuthCleanup === 'function') container.__rideHeroAuthCleanup();
    removeChildren(container);
    var built = createSurface('page');
    container.appendChild(built.surface);
    var unsubscribe = auth.subscribe(function(state) { renderState(built.surface, state); });
    var pageRecord = { container: container, surface: built.surface, unsubscribe: unsubscribe };
    mountedPages.push(pageRecord);
    container.__rideHeroAuthCleanup = function() {
      if (pageRecord.unsubscribe) pageRecord.unsubscribe();
      pageRecord.unsubscribe = null;
      mountedPages = mountedPages.filter(function(saved) { return saved !== pageRecord; });
      if (built.surface.parentNode === container) container.removeChild(built.surface);
      container.__rideHeroAuthCleanup = null;
    };
    auth.initialize().catch(function(error) {
      built.status.textContent = safeMessage(error);
      renderState(built.surface, auth.getState());
      built.status.textContent = safeMessage(error);
    });
    try { built.title.focus({ preventScroll: true }); } catch (error) { built.title.focus(); }
    return built.surface;
  }

  function initialize() {
    if (!global.RideHeroAuth) return Promise.reject(new Error('RideHero authentication is unavailable.'));
    return global.RideHeroAuth.initialize().then(function(state) {
      syncTriggers(state);
      return state;
    }).catch(function(error) {
      syncTriggers(global.RideHeroAuth.getState());
      throw error;
    });
  }

  global.RideHeroAuthUI = Object.freeze({
    render: renderPage,
    open: openAuth,
    close: closeDialog,
    initialize: initialize,
    syncTriggers: syncTriggers
  });
  global.openRideHeroAuth = openAuth;
  if (global.document && global.RideHeroAuth) syncTriggers(global.RideHeroAuth.getState());
})(window);
