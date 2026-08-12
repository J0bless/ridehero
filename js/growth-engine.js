(function(global) {
  'use strict';

  var model = global.RideHeroShareModel;
  var analytics = global.RideHeroAnalytics;
  var shareActions = global.RideHeroShareActions;
  var bridge = global.RideHeroGrowthBridge;
  var currentSharedPayload = null;
  var currentSharedPreview = null;
  var DEFAULT_META = {
    title: document.title,
    description: metaContent('seo-description'),
    robots: metaContent('seo-robots') || 'index, follow'
  };

  function metaContent(id) {
    var node = document.getElementById(id);
    return node ? node.getAttribute('content') || '' : '';
  }

  function setMeta(id, value) {
    var node = document.getElementById(id);
    if (node) node.setAttribute('content', value);
  }

  function setCanonical(value) {
    var node = document.getElementById('seo-canonical');
    if (node) node.setAttribute('href', value);
  }

  function absoluteUrl(value) {
    try { return new URL(value, global.location.href).toString(); } catch (error) { return value; }
  }

  function applySharedMetadata(parkName, count) {
    var title = parkName + ' ' + (currentSharedPayload && currentSharedPayload.planningMode === 'quick' ? 'Quick Route' : 'Full-Day Route') + ' | RideHero';
    var unit = currentSharedPayload && currentSharedPayload.planningMode === 'quick' ? 'ride' : 'stop';
    var description = 'Explore a ' + count + '-' + unit + ' ' + parkName + ' plan created with RideHero.';
    document.title = title;
    setMeta('seo-description', description);
    setMeta('seo-robots', 'noindex, follow');
    setMeta('seo-og-title', title);
    setMeta('seo-og-description', description);
    setMeta('seo-og-image', absoluteUrl('/icons/ridehero-512.png'));
    setMeta('seo-og-type', 'website');
    setMeta('seo-og-url', global.location.href.split('#')[0]);
    setCanonical(global.location.href.split('#')[0]);
    setMeta('seo-twitter-title', title);
    setMeta('seo-twitter-description', description);
    setMeta('seo-twitter-image', absoluteUrl('/icons/ridehero-512.png'));
  }

  function resetMetadata() {
    document.title = DEFAULT_META.title;
    setMeta('seo-description', DEFAULT_META.description);
    setMeta('seo-robots', DEFAULT_META.robots);
    setMeta('seo-og-title', 'RideHero — Plan smart. Ride more.');
    setMeta('seo-og-description', 'Build practical theme park routes with RideHero.');
    setMeta('seo-og-url', global.location.origin + global.location.pathname.replace(/\/r\/[^/]+\/?$/, '/'));
    setMeta('seo-twitter-title', 'RideHero — Plan smart. Ride more.');
    setMeta('seo-twitter-description', 'Build practical theme park routes with RideHero.');
    setCanonical(global.location.origin + '/');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function append(parent) {
    for (var index = 1; index < arguments.length; index += 1) {
      if (arguments[index]) parent.appendChild(arguments[index]);
    }
    return parent;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function announce(message) {
    if (bridge && bridge.status) bridge.status(message);
    global.setTimeout(function(){ if (bridge && bridge.status) bridge.status(''); }, 3200);
  }

  function announceInContext(message, localStatus) {
    if (localStatus) localStatus.textContent = message || '';
    announce(message);
    global.setTimeout(function(){ if (localStatus) localStatus.textContent = ''; }, 3200);
  }

  function clearSharedRouteUrl(targetHash) {
    if (global.RideHeroGrowthLoader && typeof global.RideHeroGrowthLoader.clearSharedUrl === 'function') {
      return global.RideHeroGrowthLoader.clearSharedUrl(targetHash || '');
    }
    var hash = String(targetHash || '');
    if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
    var target = '/' + hash;
    if (global.history && typeof global.history.replaceState === 'function') global.history.replaceState(null, '', target);
    return target;
  }

  function track(name, properties) {
    return analytics && analytics.track ? analytics.track(name, properties || {}) : null;
  }

  function modeLabel(mode) { return mode === 'full' ? 'Maximize My Day' : 'Quick Route'; }

  function catalogOptions() {
    var catalog = bridge.catalog();
    return { allowedParkIds: catalog && catalog.parks ? catalog.parks : {} };
  }

  function shell(options) {
    var wrap = el('div', 'growth-shell');
    var header = el('header', 'growth-header');
    var back = el('button', 'growth-back', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', options.backLabel || 'Go back');
    back.addEventListener('click', options.onBack || function(){ bridge.openRoute(); });
    var mark = el('div', 'growth-wordmark');
    append(mark, document.createTextNode('Ride'), el('strong', '', 'Hero'));
    append(header, back, mark, el('span', 'growth-header-spacer'));
    append(wrap, header);
    return wrap;
  }

  function showGrowthScreen(id) {
    bridge.showScreen(id);
    var appNav = document.getElementById('app-nav');
    if (appNav) appNav.hidden = id === 'shared-route' || id === 'day-summary';
  }

  function restoreAppNav() {
    var appNav = document.getElementById('app-nav');
    if (appNav) appNav.hidden = false;
  }

  function routeDescriptor(source) {
    var parkName = bridge.parkName(source.parkId);
    return {
      title: parkName + ' ' + modeLabel(source.planningMode),
      text: 'Explore a ' + source.totalStops + '-' + (source.planningMode === 'quick' ? 'ride' : 'stop') + ' ' + parkName + ' ' + modeLabel(source.planningMode) + ' created with RideHero.'
    };
  }

  function createPayload(source, settings) {
    settings = settings || {};
    var completedRideIds = source.completedRideIds || [];
    var input = {
      routeId:source.routeId,
      parkId:source.parkId,
      planningMode:source.planningMode,
      createdAt:new Date().toISOString(),
      ownerDisplayName:settings.ownerDisplayName || '',
      progressSharingEnabled:settings.progressSharingEnabled === true,
      joinEnabled:settings.joinEnabled !== false,
      status:source.status || 'active',
      routeSnapshot:{
        parkId:source.parkId,
        planningMode:source.planningMode,
        rideIds:source.rideIds,
        routeStyle:source.routeStyle || 'balanced',
        createdAt:source.createdAt
      }
    };
    if (input.progressSharingEnabled) {
      input.progress = {
        completedRideIds:completedRideIds,
        completedCount:source.completedCount || completedRideIds.length,
        totalStops:source.totalStops,
        updatedAt:new Date().toISOString()
      };
    }
    var payload = model.createSharePayload(input, catalogOptions());
    track('route_share_created', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, status:payload.status, routeCount:payload.routeSnapshot.rideIds.length });
    return payload;
  }

  function shareUrl(payload) {
    return model.buildShareUrl(global.location.origin + '/', payload, catalogOptions());
  }

  function summaryText(source, summary) {
    var heading = summary && summary.meaningfulProgress ? 'RideHero Day Complete' : (source.status === 'active' ? 'RideHero Active Route' : 'RideHero Route Recap');
    var lines = [heading, bridge.parkName(source.parkId)];
    if (summary && summary.completedRides > 0) lines.push(summary.completedRides + ' rides completed');
    else if (summary && summary.completedStops > 0) lines.push(summary.completedStops + ' route stops completed');
    else lines.push(source.totalStops + ' planned stops');
    if (summary && summary.walkingMetres != null) {
      lines.push('Estimated walking: ' + (summary.walkingMetres / 1609.344).toFixed(1) + ' mi');
    }
    if (summary && summary.longestPostedWaitMinutes != null) lines.push('Longest posted wait: ' + Math.round(summary.longestPostedWaitMinutes) + ' min');
    lines.push(modeLabel(source.planningMode));
    lines.push('Plan smart. Ride more.');
    return lines.join('\n');
  }

  function copyText(value, successMessage, localStatus) {
    function fallback() {
      var textarea = el('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      var copyHost = document.querySelector('dialog.growth-dialog[open]') || document.body;
      copyHost.appendChild(textarea);
      textarea.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (error) {}
      textarea.remove();
      if (!copied) throw new Error('Copy unavailable');
    }
    var operation = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(value).catch(function(){ fallback(); }) : Promise.resolve().then(fallback);
    return operation.then(function(){ announceInContext(successMessage, localStatus); return true; });
  }

  function canvasBlob(source, summary) {
    return new Promise(function(resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      var context = canvas.getContext('2d');
      if (!context) { reject(new Error('Canvas unavailable')); return; }
      var gradient = context.createLinearGradient(0, 0, 1080, 1080);
      gradient.addColorStop(0, '#0D1B4C'); gradient.addColorStop(.68, '#24476f'); gradient.addColorStop(1, '#334E68');
      context.fillStyle = gradient; context.fillRect(0, 0, 1080, 1080);
      context.strokeStyle = 'rgba(90,152,217,.45)'; context.lineWidth = 24; context.beginPath(); context.arc(960, 90, 285, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = '#D62828'; context.lineWidth = 8; context.beginPath(); context.moveTo(60, 760); context.bezierCurveTo(300, 630, 640, 900, 1030, 670); context.stroke();
      context.fillStyle = '#fff'; context.font = '900 58px system-ui, sans-serif'; context.fillText('RIDE', 70, 105);
      context.fillStyle = '#ff6262'; context.fillText('HERO', 232, 105);
      var cardHeading = summary && summary.meaningfulProgress ? 'RIDEHERO DAY COMPLETE' : (source.status === 'active' ? 'RIDEHERO ACTIVE ROUTE' : 'RIDEHERO ROUTE RECAP');
      context.fillStyle = '#cbd9ea'; context.font = '800 27px system-ui, sans-serif'; context.fillText(cardHeading, 70, 198);
      context.fillStyle = '#fff'; context.font = '900 72px system-ui, sans-serif';
      var park = bridge.parkName(source.parkId).slice(0, 28);
      context.fillText(park, 70, 292, 930);
      var metricY = 465;
      var metric = summary && summary.completedRides > 0 ? summary.completedRides + ' RIDES COMPLETED' : (summary && summary.completedStops > 0 ? summary.completedStops + ' STOPS COMPLETED' : source.totalStops + ' PLANNED STOPS');
      context.fillStyle = '#fff'; context.font = '900 54px system-ui, sans-serif'; context.fillText(metric, 70, metricY, 930);
      context.fillStyle = '#cbd9ea'; context.font = '700 34px system-ui, sans-serif';
      var nextY = metricY + 78;
      if (summary && summary.walkingMetres != null) { context.fillText('Estimated walking · ' + (summary.walkingMetres / 1609.344).toFixed(1) + ' mi', 70, nextY); nextY += 58; }
      if (summary && summary.longestPostedWaitMinutes != null) { context.fillText('Longest posted wait · ' + Math.round(summary.longestPostedWaitMinutes) + ' min', 70, nextY); nextY += 58; }
      context.fillStyle = '#fff'; context.font = '850 39px system-ui, sans-serif'; context.fillText(modeLabel(source.planningMode), 70, 900);
      context.fillStyle = '#cbd9ea'; context.font = '700 28px system-ui, sans-serif'; context.fillText('Plan smart. Ride more.', 70, 962);
      canvas.toBlob(function(blob){ if (blob) resolve(blob); else reject(new Error('Image export unavailable')); }, 'image/png', .94);
    });
  }

  function downloadCard(source, summary, localStatus) {
    return canvasBlob(source, summary).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var link = el('a');
      link.href = url;
      link.download = 'ridehero-' + (summary ? 'day-' : 'route-') + source.parkId + '.png';
      document.body.appendChild(link); link.click(); link.remove();
      global.setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      announceInContext('RideHero card saved.', localStatus);
    });
  }

  async function nativeShare(payload, source, summary, includeDaySummary, localStatus) {
    var url = shareUrl(payload);
    var descriptor = routeDescriptor(source);
    var options = {
      navigator:navigator,
      title:descriptor.title,
      text:includeDaySummary ? summaryText(source, summary) : descriptor.text,
      url:url,
      copyLink:function(value){ return copyText(value, 'Route link copied.', localStatus); }
    };
    if (includeDaySummary && typeof File === 'function') {
      options.imageFactory = function(){ return canvasBlob(source, summary); };
      options.fileFactory = function(blob){ return new File([blob], 'ridehero-day.png', { type:'image/png' }); };
    }
    var result = await shareActions.share(options);
    if (!result.ok) return false;
    if (result.method === 'native-file' || result.method === 'native-link') {
      track('route_share_native', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:result.method });
      announceInContext('Shared with RideHero.', localStatus);
    } else if (result.method === 'copied-link') {
      track('route_share_copied', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'link' });
    }
    if (includeDaySummary) track('day_summary_shared', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:result.method });
    return true;
  }

  function createShareDialog(source, options) {
    options = options || {};
    var dialog = el('dialog', 'growth-dialog');
    dialog.setAttribute('aria-labelledby', 'growth-share-title');
    var panel = el('div', 'growth-dialog-panel');
    var head = el('div', 'growth-dialog-head');
    var headingWrap = el('div');
    var heading = el('h2', '', options.daySummary ? 'Share My Day' : 'Share Route');
    heading.id = 'growth-share-title';
    append(headingWrap, heading, el('p', '', 'Create a private, joinable snapshot. Your GPS and account details are never included.'));
    var close = el('button', 'growth-dialog-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close share options'); close.addEventListener('click', function(){ dialog.close(); });
    append(head, headingWrap, close);
    var nameLabel = el('label', 'growth-field'); append(nameLabel, el('span', '', 'Optional display name'));
    var name = el('input'); name.type = 'text'; name.maxLength = 40; name.autocomplete = 'nickname'; name.placeholder = 'Shared RideHero Route'; name.setAttribute('aria-describedby', 'growth-name-note');
    var nameNote = el('small', '', 'Leave blank to share without a name.'); nameNote.id = 'growth-name-note'; append(nameLabel, name, nameNote);
    var progressLabel = el('label', 'growth-toggle'); var progress = el('input'); progress.type = 'checkbox'; append(progressLabel, progress, el('span', '', 'Include current stop progress'));
    var joinLabel = el('label', 'growth-toggle'); var join = el('input'); join.type = 'checkbox'; join.checked = true; append(joinLabel, join, el('span', '', 'Allow recipients to import a local copy'));
    var actions = el('div', 'growth-share-options');
    var share = el('button', 'is-primary', navigator.share ? (options.daySummary ? 'Share My Day' : 'Share Route') : 'Copy Share Link'); share.type = 'button';
    var copyLink = el('button', '', 'Copy Link'); copyLink.type = 'button';
    var copySummary = el('button', '', 'Copy Summary'); copySummary.type = 'button';
    var download = el('button', '', 'Save Card'); download.type = 'button';
    append(actions, share, copyLink, copySummary, download);
    var localStatus = el('div', 'growth-dialog-status'); localStatus.setAttribute('role', 'status'); localStatus.setAttribute('aria-live', 'polite'); localStatus.setAttribute('aria-atomic', 'true');
    append(panel, head, nameLabel, progressLabel, joinLabel, actions, localStatus, el('p', 'growth-dialog-note', 'Shared links expire after 7 days. Joining creates an independent local route; no live location or group synchronization is shared.'));
    dialog.appendChild(panel); document.body.appendChild(dialog);

    var preparedPayload = null;
    var preparedKey = '';
    function build() {
      try {
        var settings = { ownerDisplayName:name.value, progressSharingEnabled:progress.checked, joinEnabled:join.checked };
        var settingsKey = JSON.stringify(settings);
        if (preparedPayload && settingsKey === preparedKey) return preparedPayload;
        preparedPayload = createPayload(source, settings);
        preparedKey = settingsKey;
        return preparedPayload;
      } catch (error) {
        announceInContext('This route could not be prepared for sharing.', localStatus);
        return null;
      }
    }
    share.addEventListener('click', function(){ var payload = build(); if (payload) nativeShare(payload, source, options.summary, options.daySummary, localStatus).catch(function(){ announceInContext('Sharing is unavailable. Try Copy Link instead.', localStatus); }); });
    copyLink.addEventListener('click', function(){ var payload = build(); if (!payload) return; copyText(shareUrl(payload), 'Route link copied.', localStatus).then(function(){ track('route_share_copied', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'link' }); if (options.daySummary) track('day_summary_shared', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'link' }); }).catch(function(){ announceInContext('Copy is unavailable on this browser.', localStatus); }); });
    copySummary.addEventListener('click', function(){ var payload = build(); if (!payload) return; copyText(summaryText(source, options.summary), 'Summary copied.', localStatus).then(function(){ track('route_share_copied', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'summary' }); if (options.daySummary) track('day_summary_shared', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'summary' }); }).catch(function(){ announceInContext('Copy is unavailable on this browser.', localStatus); }); });
    download.addEventListener('click', function(){ var payload = build(); if (!payload) return; downloadCard(source, options.summary, localStatus).then(function(){ if (options.daySummary) track('day_summary_shared', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, method:'download' }); }).catch(function(){ announceInContext('This browser could not save the image.', localStatus); }); });
    dialog.addEventListener('close', function(){ dialog.remove(); });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    name.focus({ preventScroll:true });
  }

  function openRouteShare() {
    var source = bridge.getShareSource();
    if (!source) { announce('Build a route before sharing it.'); return false; }
    track('route_share_opened', { parkId:source.parkId, planningMode:source.planningMode, status:source.status, routeCount:source.totalStops });
    createShareDialog(source, { summary:source.summary, daySummary:false });
    return true;
  }

  function metric(value, label) {
    var item = el('div', 'growth-stat'); append(item, el('strong', '', value), el('span', '', label)); return item;
  }

  function shareCard(source, summary) {
    var card = el('section', 'growth-share-card'); card.setAttribute('aria-label', summary && summary.meaningfulProgress ? 'RideHero Day Complete share card' : 'RideHero route recap share card');
    var brand = el('div', 'share-card-brand'); append(brand, document.createTextNode('Ride'), el('strong', '', 'Hero'));
    var heading = el('div'); append(heading, el('div', 'share-card-kicker', summary && summary.meaningfulProgress ? 'RideHero day complete' : 'RideHero route recap'), el('h2', 'share-card-park', bridge.parkName(source.parkId)));
    var metrics = el('div', 'share-card-metrics');
    if (summary && summary.completedRides > 0) append(metrics, shareCardMetric(summary.completedRides, 'Rides completed'));
    else append(metrics, shareCardMetric(summary ? summary.completedStops : 0, 'Stops completed'));
    if (summary && summary.longestPostedWaitMinutes != null) append(metrics, shareCardMetric(Math.round(summary.longestPostedWaitMinutes) + ' min', 'Longest posted wait'));
    if (summary && summary.walkingMetres != null) append(metrics, shareCardMetric((summary.walkingMetres / 1609.344).toFixed(1) + ' mi', 'Estimated walking'));
    var footer = el('div', 'share-card-footer'); append(footer, el('span', '', modeLabel(source.planningMode)), el('span', '', 'Plan smart. Ride more.'));
    append(card, brand, heading, metrics, footer); return card;
  }

  function shareCardMetric(value, label) { var item = el('div', 'share-card-metric'); append(item, el('strong', '', value), el('span', '', label)); return item; }

  function openDaySummary(reason) {
    var summary = bridge.getLatestSummary();
    if (reason !== 'completed' && bridge.hasActiveRoute()) summary = bridge.endActiveSession(reason || 'ended');
    if (!summary) { announce('Complete or end a route to see your Day Summary.'); return false; }
    var source = bridge.getShareSource();
    if (!source) { announce('This route summary is unavailable.'); return false; }
    resetMetadata(); restoreAppNav();
    var root = document.getElementById('day-summary-root'); clear(root);
    var page = shell({ backLabel:'Return to route', onBack:function(){ restoreAppNav(); bridge.openRoute(); } });
    var main = el('main', 'growth-main');
    var celebration = el('section', 'growth-celebration');
    append(celebration, el('div', 'growth-check', summary.meaningfulProgress ? '✓' : '■'), el('span', 'growth-eyebrow', summary.meaningfulProgress ? 'Day summary' : 'Route recap'), el('h1', '', summary.meaningfulProgress ? 'Great day!' : 'Route ended'), el('p', '', summary.meaningfulProgress ? 'Here’s what you accomplished with RideHero.' : 'No completed stops were recorded, so no results were estimated.'));
    if (summary.meaningfulProgress) { var confetti = el('div', 'growth-confetti'); confetti.setAttribute('aria-hidden', 'true'); for (var i = 0; i < 6; i += 1) confetti.appendChild(el('i')); page.appendChild(confetti); }
    var layout = el('div', 'growth-summary-layout');
    var stats = el('section', 'growth-stats', null); stats.setAttribute('aria-label', 'Day summary statistics');
    if (summary.completedRides > 0) stats.appendChild(metric(summary.completedRides, 'Rides completed'));
    stats.appendChild(metric(summary.completedStops, 'Route stops completed'));
    if (summary.walkingMetres != null) stats.appendChild(metric((summary.walkingMetres / 1609.344).toFixed(1) + ' mi', 'Estimated walking'));
    if (summary.longestPostedWaitMinutes != null) stats.appendChild(metric(Math.round(summary.longestPostedWaitMinutes) + ' min', 'Longest posted wait'));
    if (summary.averagePostedWaitMinutes != null && summary.recordedWaitCount > 1) stats.appendChild(metric(Math.round(summary.averagePostedWaitMinutes) + ' min', 'Average posted wait'));
    if (summary.durationMinutes > 0) stats.appendChild(metric(summary.durationMinutes + ' min', 'Route duration'));
    if (summary.reoptimizations > 0) stats.appendChild(metric(summary.reoptimizations, 'Re-optimizations'));
    var card = shareCard(source, summary);
    var actions = el('div', 'growth-actions');
    var share = el('button', 'growth-primary', 'Share My Day'); share.type = 'button'; share.addEventListener('click', function(){ createShareDialog(source, { summary:summary, daySummary:true }); });
    var routeShare = el('button', 'growth-secondary', 'Share Route'); routeShare.type = 'button'; routeShare.addEventListener('click', openRouteShare);
    var another = el('button', 'growth-tertiary', 'Plan Another Day'); another.type = 'button'; another.addEventListener('click', function(){ restoreAppNav(); resetMetadata(); bridge.planAnotherDay(); });
    append(actions, share, routeShare, another); append(layout, stats, card, actions); append(main, celebration, layout); append(page, main); root.appendChild(page);
    showGrowthScreen('day-summary');
    track('day_summary_viewed', { parkId:summary.parkId, planningMode:summary.planningMode, status:summary.reason, routeCount:summary.routeStopCount, completedCount:summary.completedStops });
    if (summary.reason === 'completed') track('route_completed', { parkId:summary.parkId, planningMode:summary.planningMode, status:'completed', routeCount:summary.routeStopCount, completedCount:summary.completedStops });
    var heading = root.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll:true }); }
    return true;
  }

  function endActiveRoute() {
    if (!bridge.hasActiveRoute()) { announce('There is no active route to end.'); return false; }
    return openDaySummary('ended');
  }

  function sharedStopNode(stop) {
    var item = el('li', 'shared-stop' + (stop.unavailable ? ' is-unavailable' : ''));
    var copy = el('div'); append(copy, el('strong', '', stop.name), el('span', '', stop.unavailable ? 'This stop is no longer available' : 'Original plan'));
    var live = stop.unavailable ? 'Unavailable' : (stop.waitMinutes != null ? stop.waitMinutes + ' min now' : (stop.status === 'CLOSED' || stop.status === 'TEMPORARILY_DOWN' ? 'Currently unavailable' : 'Live wait unavailable'));
    append(item, copy, el('span', '', live)); return item;
  }

  function renderSharedFailure(message) {
    var root = document.getElementById('shared-route-root'); clear(root);
    var page = shell({ backLabel:'Plan my own route', onBack:function(){ clearSharedRouteUrl('#/brands'); restoreAppNav(); resetMetadata(); bridge.planAnotherDay(); } });
    var main = el('main', 'growth-main'); var box = el('section', 'shared-route-message');
    var failureHeading = el('h1', '', 'We couldn’t load this RideHero route.');
    append(box, failureHeading, el('p', '', message || 'The link may be invalid or expired.'));
    var actions = el('div', 'growth-actions');
    var retry = el('button', 'growth-primary', 'Retry'); retry.type = 'button'; retry.addEventListener('click', openSharedRouteFromUrl);
    var own = el('button', 'growth-secondary', 'Plan My Own Route'); own.type = 'button'; own.addEventListener('click', function(){ clearSharedRouteUrl('#/brands'); restoreAppNav(); resetMetadata(); bridge.planAnotherDay(); });
    append(actions, retry, own); append(box, actions); append(main, box); append(page, main); root.appendChild(page); showGrowthScreen('shared-route');
    failureHeading.tabIndex = -1; failureHeading.focus({ preventScroll:true });
  }

  function confirmReplace() {
    return new Promise(function(resolve) {
      var dialog = el('dialog', 'growth-dialog'); dialog.setAttribute('aria-labelledby', 'replace-route-title');
      var panel = el('div', 'growth-dialog-panel'); var head = el('div', 'growth-dialog-head'); var copy = el('div');
      var title = el('h2', '', 'Replace your active route?'); title.id = 'replace-route-title'; append(copy, title, el('p', '', 'Joining creates a local copy and replaces your current active route. Your shared source route will not change.')); append(head, copy);
      var actions = el('div', 'growth-actions'); var cancel = el('button', 'growth-secondary', 'Cancel'); var replace = el('button', 'growth-primary', 'Replace Route'); cancel.type = replace.type = 'button'; append(actions, replace, cancel); append(panel, head, actions); dialog.appendChild(panel); document.body.appendChild(dialog);
      function done(value) { if (dialog.open) dialog.close(); dialog.remove(); resolve(value); }
      cancel.addEventListener('click', function(){ done(false); }); replace.addEventListener('click', function(){ done(true); }); dialog.addEventListener('cancel', function(event){ event.preventDefault(); done(false); }, { once:true });
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); cancel.focus({ preventScroll:true });
    });
  }

  async function joinSharedRoute() {
    if (!currentSharedPayload) return;
    if (!currentSharedPayload.joinEnabled) { announce('The owner disabled route joining.'); return; }
    if (bridge.hasActiveRoute() && !(await confirmReplace())) return;
    try {
      var result = await bridge.importSharedRoute(currentSharedPayload);
      clearSharedRouteUrl(''); restoreAppNav(); resetMetadata();
      track('shared_route_joined', { shareId:currentSharedPayload.shareId, parkId:currentSharedPayload.parkId, planningMode:currentSharedPayload.planningMode, status:'local-copy', routeCount:result.importedRideCount, referral:'share' });
      announce(result.unavailableRideCount ? 'Route joined. Unavailable stops were left out.' : 'Route joined as your own local copy.');
    } catch (error) {
      renderSharedFailure('The route could not be imported. Try again or plan your own route.');
    }
  }

  function renderSharedLanding(payload, preview, referral) {
    currentSharedPayload = payload; currentSharedPreview = preview;
    applySharedMetadata(preview.park.name, payload.routeSnapshot.rideIds.length);
    var root = document.getElementById('shared-route-root'); clear(root);
    var page = shell({ backLabel:'Plan my own route', onBack:function(){ clearSharedRouteUrl('#/brands'); restoreAppNav(); resetMetadata(); bridge.planAnotherDay(); } });
    var main = el('main', 'growth-main'); var hero = el('section', 'shared-route-hero');
    var chip = el('span', 'shared-route-chip', modeLabel(payload.planningMode));
    var heading = el('div', 'shared-route-heading');
    var owner = payload.ownerDisplayName ? payload.ownerDisplayName + ' shared a route with you.' : 'A RideHero route was shared with you.';
    append(heading, el('span', 'growth-eyebrow', owner), el('h1', '', preview.park.name), el('p', '', payload.routeSnapshot.rideIds.length + ' planned ' + (payload.planningMode === 'quick' ? 'rides' : 'stops') + ' · Original ordering preserved'));
    var metadata = el('div', 'shared-route-meta'); append(metadata, el('span', '', payload.progressSharingEnabled ? ((payload.progress && payload.progress.completedCount) || 0) + ' of ' + payload.routeSnapshot.rideIds.length + ' stops cleared' : 'Progress private'), el('span', '', payload.joinEnabled ? 'Join enabled' : 'Preview only'));
    var actions = el('div', 'shared-route-actions'); var join = el('button', '', 'Join Route'); join.type = 'button'; join.disabled = !payload.joinEnabled; join.addEventListener('click', joinSharedRoute); var previewButton = el('button', '', 'Preview Route'); previewButton.type = 'button';
    append(actions, join, previewButton); append(hero, chip, heading, metadata, actions);
    var section = el('section', 'shared-route-section'); var routeTitle = el('h2', '', 'Original Plan'); routeTitle.id = 'shared-route-plan'; append(section, routeTitle, el('p', '', 'Current live status is shown separately and never changes the saved order.'));
    var list = el('ol', 'shared-stop-list'); list.setAttribute('aria-labelledby', 'shared-route-plan'); preview.stops.forEach(function(stop){ list.appendChild(sharedStopNode(stop)); }); section.appendChild(list);
    previewButton.addEventListener('click', function(){ section.scrollIntoView({ behavior:global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' }); routeTitle.tabIndex = -1; routeTitle.focus({ preventScroll:true }); });
    append(main, hero, section); append(page, main); root.appendChild(page); showGrowthScreen('shared-route');
    track('shared_route_viewed', { shareId:payload.shareId, parkId:payload.parkId, planningMode:payload.planningMode, status:payload.status, routeCount:payload.routeSnapshot.rideIds.length, referral:referral });
    var h1 = root.querySelector('h1'); if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll:true }); }
  }

  async function openSharedRouteFromUrl() {
    showGrowthScreen('shared-route');
    var parsed = model.parseShareUrl(global.location.href, catalogOptions());
    if (!parsed.valid) {
      setMeta('seo-robots', 'noindex, follow');
      renderSharedFailure(parsed.expired ? 'This shared route has expired.' : 'The link is malformed, unavailable, or no longer supported.');
      return false;
    }
    currentSharedPayload = parsed.payload;
    track('route_share_opened', { shareId:parsed.payload.shareId, parkId:parsed.payload.parkId, planningMode:parsed.payload.planningMode, status:parsed.payload.status, referral:parsed.referralSource });
    var root = document.getElementById('shared-route-root'); clear(root);
    var loading = shell({ backLabel:'Plan my own route', onBack:function(){ clearSharedRouteUrl('#/brands'); restoreAppNav(); resetMetadata(); bridge.planAnotherDay(); } }); var main = el('main', 'growth-main'); var box = el('section', 'shared-route-message'); var loadingHeading = el('h1', '', 'Loading shared route…'); box.setAttribute('aria-busy', 'true'); append(box, loadingHeading, el('p', '', 'Checking the saved itinerary and current park information.')); append(main, box); append(loading, main); root.appendChild(loading); loadingHeading.tabIndex = -1; loadingHeading.focus({ preventScroll:true });
    try {
      var preview = await bridge.previewSharedRoute(parsed.payload);
      renderSharedLanding(parsed.payload, preview, parsed.referralSource);
      return true;
    } catch (error) {
      renderSharedFailure('Park information is temporarily unavailable.');
      return false;
    }
  }

  global.RideHeroSeo = {
    setPageMetadata:function(config) {
      config = config || {};
      if (config.title) { document.title = String(config.title); setMeta('seo-og-title', String(config.title)); setMeta('seo-twitter-title', String(config.title)); }
      if (config.description) { setMeta('seo-description', String(config.description)); setMeta('seo-og-description', String(config.description)); setMeta('seo-twitter-description', String(config.description)); }
      if (config.image) { var image = absoluteUrl(String(config.image)); setMeta('seo-og-image', image); setMeta('seo-twitter-image', image); }
      if (config.url) { var url = absoluteUrl(String(config.url)); setMeta('seo-og-url', url); setCanonical(url); }
      if (config.type) setMeta('seo-og-type', String(config.type));
      if (config.robots) setMeta('seo-robots', String(config.robots));
    },
    reset:resetMetadata
  };

  global.RideHeroGrowth = {
    openRouteShare:openRouteShare,
    openDaySummary:openDaySummary,
    endActiveRoute:endActiveRoute,
    openSharedRouteFromUrl:openSharedRouteFromUrl,
    resetMetadata:resetMetadata,
    generateShareCard:canvasBlob,
    groupRouteCapabilities:model.GROUP_ROUTE_V1
  };
})(window);
