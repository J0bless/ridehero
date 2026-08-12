(function(root, factory) {
  'use strict';

  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RideHeroShareModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var SHARE_SCHEMA_VERSION = 1;
  var DAY = 24 * 60 * 60 * 1000;
  var LIMITS = Object.freeze({
    maxRideCount: 64,
    maxCompletedRideCount: 64,
    maxOwnerDisplayNameLength: 40,
    maxParkIdLength: 64,
    maxRideIdLength: 96,
    maxRouteIdLength: 80,
    maxRouteStyleLength: 32,
    maxJsonBytes: 12000,
    maxEncodedPayloadLength: 16000,
    maxUrlLength: 18000,
    defaultExpiryMs: 7 * DAY,
    maxExpiryMs: 30 * DAY,
    maxClockSkewMs: 5 * 60 * 1000
  });
  var STATUS_VALUES = Object.freeze(['active', 'completed', 'ended', 'abandoned']);
  var ROOT_KEYS = Object.freeze([
    'shareSchemaVersion', 'shareId', 'routeId', 'parkId', 'planningMode',
    'createdAt', 'expiresAt', 'ownerDisplayName', 'routeSnapshot',
    'progressSharingEnabled', 'joinEnabled', 'status', 'progress'
  ]);
  var SNAPSHOT_KEYS = Object.freeze([
    'parkId', 'planningMode', 'rideIds', 'routeStyle', 'createdAt'
  ]);
  var PROGRESS_KEYS = Object.freeze([
    'completedRideIds', 'completedCount', 'totalStops', 'updatedAt'
  ]);
  var GROUP_ROUTE_V1 = Object.freeze({
    schemaVersion: 1,
    importMode: 'local-copy',
    realTimeSync: false,
    capabilities: Object.freeze({
      preview: true,
      joinByImport: true,
      sharedLiveProgress: false,
      sharedLocation: false,
      voting: false,
      coordinatedReoptimization: false
    })
  });

  function ShareModelError(code, message, details) {
    this.name = 'ShareModelError';
    this.code = code;
    this.message = message;
    this.details = details || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ShareModelError);
  }
  ShareModelError.prototype = Object.create(Error.prototype);
  ShareModelError.prototype.constructor = ShareModelError;

  function failure(code, message, details) {
    return {
      valid: false,
      code: code,
      error: message,
      details: details || null,
      expired: code === 'EXPIRED'
    };
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function utf8ByteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
    return unescape(encodeURIComponent(value)).length;
  }

  function nowMs(options) {
    var source = options && options.now;
    if (typeof source === 'function') source = source();
    if (source instanceof Date) source = source.getTime();
    return Number.isFinite(source) ? source : Date.now();
  }

  function toIso(value, fieldName) {
    var milliseconds = value instanceof Date ? value.getTime() :
      (typeof value === 'number' ? value : Date.parse(value));
    if (!Number.isFinite(milliseconds)) {
      throw new ShareModelError('INVALID_TIMESTAMP', fieldName + ' must be a valid date.');
    }
    return new Date(milliseconds).toISOString();
  }

  function truncateCodePoints(value, maximum) {
    return Array.from(value).slice(0, maximum).join('');
  }

  function sanitizeDisplayName(value) {
    if (value === undefined || value === null) return '';
    var plain = String(value);
    if (plain.normalize) plain = plain.normalize('NFKC');
    plain = plain
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateCodePoints(plain, LIMITS.maxOwnerDisplayNameLength);
  }

  function normalizePlanningMode(value) {
    if (value === 'quick') return 'quick';
    if (value === 'full' || value === 'full-day' || value === 'maximize') return 'full';
    throw new ShareModelError('INVALID_PLANNING_MODE', 'Planning mode must be quick or full.');
  }

  function safeIdentifier(value, maximum, fieldName) {
    if (typeof value !== 'string' || !value || value.length > maximum ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
      throw new ShareModelError('INVALID_IDENTIFIER', fieldName + ' is invalid.', { field: fieldName });
    }
    return value;
  }

  function safeRouteStyle(value) {
    var normalized = value === undefined || value === null || value === '' ? 'balanced' : String(value);
    if (['balanced', 'priority', 'walking'].indexOf(normalized) === -1) {
      throw new ShareModelError('INVALID_ROUTE_STYLE', 'Route style is invalid.');
    }
    return normalized;
  }

  function resolveCrypto() {
    if (root && root.crypto && (root.crypto.randomUUID || root.crypto.getRandomValues)) return root.crypto;
    if (typeof require === 'function') {
      try {
        var nodeCrypto = require('crypto');
        return nodeCrypto.webcrypto || nodeCrypto;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function fallbackBytes(length) {
    var bytes = new Uint8Array(length);
    for (var index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return bytes;
  }

  function formatUuid(bytes) {
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function(byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  function generateShareId(options) {
    var cryptoApi = resolveCrypto();
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    var bytes;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
    } else if (options && options.allowInsecureTestFallback === true) {
      // Explicitly test-only: production callers fail closed when secure randomness is absent.
      bytes = fallbackBytes(16);
    } else {
      throw new ShareModelError('CRYPTO_UNAVAILABLE', 'Secure random share IDs are unavailable.');
    }
    return formatUuid(bytes);
  }

  function isShareId(value) {
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function validateParkId(parkId, options) {
    var allowed;
    if (options && typeof options.isParkAllowed === 'function') {
      try { allowed = options.isParkAllowed(parkId) === true; } catch (error) { allowed = false; }
    } else if (options && options.allowedParkIds instanceof Set) {
      allowed = options.allowedParkIds.has(parkId);
    } else if (options && Array.isArray(options.allowedParkIds)) {
      allowed = options.allowedParkIds.indexOf(parkId) !== -1;
    } else if (options && isPlainObject(options.allowedParkIds)) {
      allowed = options.allowedParkIds[parkId] === true ||
        (own(options.allowedParkIds, parkId) && options.allowedParkIds[parkId] !== false && options.allowedParkIds[parkId] != null);
    } else {
      throw new ShareModelError('PARK_VALIDATOR_REQUIRED', 'A park allowlist or validator is required.');
    }
    if (!allowed) throw new ShareModelError('UNKNOWN_PARK', 'The shared route references an unknown park.');
  }

  function rideIsKnown(parkId, rideId, options) {
    if (options && typeof options.isRideAllowed === 'function') {
      try { return options.isRideAllowed(parkId, rideId) === true; } catch (error) { return false; }
    }
    var source = options && options.allowedRideIds;
    if (!source) return true;
    if (source instanceof Set) return source.has(rideId);
    if (Array.isArray(source)) return source.indexOf(rideId) !== -1;
    if (isPlainObject(source)) {
      var parkSource = source[parkId];
      if (parkSource instanceof Set) return parkSource.has(rideId);
      if (Array.isArray(parkSource)) return parkSource.indexOf(rideId) !== -1;
      if (isPlainObject(parkSource)) return parkSource[rideId] === true || own(parkSource, rideId);
      return source[rideId] === true;
    }
    return false;
  }

  function normalizeRideIds(value, fieldName, maximum) {
    if (!Array.isArray(value)) {
      throw new ShareModelError('INVALID_RIDE_LIST', fieldName + ' must be an array.');
    }
    if (value.length > maximum) {
      throw new ShareModelError('TOO_MANY_RIDES', fieldName + ' exceeds the route size limit.');
    }
    var seen = Object.create(null);
    return value.map(function(rideId) {
      var safe = safeIdentifier(rideId, LIMITS.maxRideIdLength, fieldName);
      if (seen[safe]) throw new ShareModelError('DUPLICATE_RIDE', fieldName + ' must not contain duplicate ride IDs.');
      seen[safe] = true;
      return safe;
    });
  }

  function rejectUnexpectedKeys(value, allowed, fieldName) {
    var unexpected = Object.keys(value).filter(function(key) { return allowed.indexOf(key) === -1; });
    if (unexpected.length) {
      throw new ShareModelError('UNEXPECTED_FIELD', fieldName + ' contains unsupported fields.', {
        field: fieldName,
        keys: unexpected
      });
    }
  }

  function normalizeProgress(input, rideIds, createdAt) {
    var source = isPlainObject(input) ? input : {};
    var completed = normalizeRideIds(
      Array.isArray(source.completedRideIds) ? source.completedRideIds : [],
      'completedRideIds',
      LIMITS.maxCompletedRideCount
    );
    var completedCount = Number.isInteger(source.completedCount) ? source.completedCount : completed.length;
    if (completedCount !== completed.length || completedCount < 0 || completedCount > rideIds.length) {
      throw new ShareModelError('INVALID_PROGRESS', 'Completed route progress is invalid.');
    }
    var totalStops = Number.isInteger(source.totalStops) ? source.totalStops : rideIds.length;
    if (totalStops !== rideIds.length) {
      throw new ShareModelError('INVALID_PROGRESS', 'Progress total must match the route snapshot.');
    }
    completed.forEach(function(rideId) {
      if (rideIds.indexOf(rideId) === -1) {
        throw new ShareModelError('INVALID_PROGRESS', 'Completed rides must belong to the shared route.');
      }
    });
    return {
      completedRideIds: completed,
      completedCount: completedCount,
      totalStops: totalStops,
      updatedAt: toIso(source.updatedAt || createdAt, 'progress.updatedAt')
    };
  }

  function createSharePayload(input, options) {
    if (!isPlainObject(input)) throw new ShareModelError('INVALID_PAYLOAD', 'Share input must be an object.');
    var sourceSnapshot = isPlainObject(input.routeSnapshot) ? input.routeSnapshot : input;
    var shareId = input.shareId === undefined ? generateShareId(options) : input.shareId;
    if (!isShareId(shareId)) throw new ShareModelError('INVALID_SHARE_ID', 'Share ID is invalid.');
    var routeId = safeIdentifier(input.routeId || shareId, LIMITS.maxRouteIdLength, 'routeId');
    var parkId = safeIdentifier(sourceSnapshot.parkId || input.parkId, LIMITS.maxParkIdLength, 'parkId');
    validateParkId(parkId, options);
    var planningMode = normalizePlanningMode(sourceSnapshot.planningMode || input.planningMode);
    var rideSource = sourceSnapshot.rideIds || sourceSnapshot.rideOrder || input.rideIds || input.rideOrder;
    var rideIds = normalizeRideIds(rideSource, 'rideIds', LIMITS.maxRideCount);
    if (!rideIds.length) throw new ShareModelError('EMPTY_ROUTE', 'A shared route must include at least one ride.');

    var currentTime = nowMs(options);
    var createdAt = toIso(input.createdAt || sourceSnapshot.createdAt || currentTime, 'createdAt');
    var createdMs = Date.parse(createdAt);
    var expiresAt = toIso(input.expiresAt || (createdMs + LIMITS.defaultExpiryMs), 'expiresAt');
    var expiresMs = Date.parse(expiresAt);
    if (createdMs > currentTime + LIMITS.maxClockSkewMs) {
      throw new ShareModelError('FUTURE_CREATED_AT', 'Share creation time is too far in the future.');
    }
    if (expiresMs <= createdMs) throw new ShareModelError('INVALID_EXPIRY', 'Share expiry must follow creation.');
    if (expiresMs - createdMs > LIMITS.maxExpiryMs) {
      throw new ShareModelError('EXPIRY_TOO_LONG', 'Share expiry exceeds the maximum lifetime.');
    }
    if (expiresMs <= currentTime) throw new ShareModelError('EXPIRED', 'This shared route has expired.');

    var progressSharingEnabled = input.progressSharingEnabled === true;
    var status = input.status === undefined ? 'active' : input.status;
    if (STATUS_VALUES.indexOf(status) === -1) {
      throw new ShareModelError('INVALID_STATUS', 'Shared route status is invalid.');
    }
    var ownerDisplayName = sanitizeDisplayName(input.ownerDisplayName);
    var payload = {
      shareSchemaVersion: SHARE_SCHEMA_VERSION,
      shareId: shareId,
      routeId: routeId,
      parkId: parkId,
      planningMode: planningMode,
      createdAt: createdAt,
      expiresAt: expiresAt,
      routeSnapshot: {
        parkId: parkId,
        planningMode: planningMode,
        rideIds: rideIds,
        routeStyle: safeRouteStyle(sourceSnapshot.routeStyle || input.routeStyle),
        createdAt: toIso(sourceSnapshot.createdAt || createdAt, 'routeSnapshot.createdAt')
      },
      progressSharingEnabled: progressSharingEnabled,
      joinEnabled: input.joinEnabled !== false,
      status: status
    };
    if (ownerDisplayName) payload.ownerDisplayName = ownerDisplayName;
    if (progressSharingEnabled) {
      payload.progress = normalizeProgress(input.progress || sourceSnapshot.progress, rideIds, createdAt);
    }

    var validation = validateSharePayload(payload, options);
    if (!validation.valid) throw new ShareModelError(validation.code, validation.error, validation.details);
    return validation.payload;
  }

  function validateSharePayload(candidate, options) {
    try {
      if (!isPlainObject(candidate)) throw new ShareModelError('INVALID_PAYLOAD', 'Share payload must be an object.');
      var serialized;
      try { serialized = JSON.stringify(candidate); } catch (error) {
        throw new ShareModelError('INVALID_PAYLOAD', 'Share payload is not serializable.');
      }
      if (utf8ByteLength(serialized) > LIMITS.maxJsonBytes) {
        throw new ShareModelError('PAYLOAD_TOO_LARGE', 'Share payload exceeds the size limit.');
      }
      rejectUnexpectedKeys(candidate, ROOT_KEYS, 'payload');
      if (candidate.shareSchemaVersion !== SHARE_SCHEMA_VERSION) {
        throw new ShareModelError('UNSUPPORTED_SCHEMA', 'Shared route schema is not supported.');
      }
      if (!isShareId(candidate.shareId)) throw new ShareModelError('INVALID_SHARE_ID', 'Share ID is invalid.');
      var routeId = safeIdentifier(candidate.routeId, LIMITS.maxRouteIdLength, 'routeId');
      var parkId = safeIdentifier(candidate.parkId, LIMITS.maxParkIdLength, 'parkId');
      validateParkId(parkId, options);
      var planningMode = normalizePlanningMode(candidate.planningMode);
      var createdAt = toIso(candidate.createdAt, 'createdAt');
      var expiresAt = toIso(candidate.expiresAt, 'expiresAt');
      var createdMs = Date.parse(createdAt);
      var expiresMs = Date.parse(expiresAt);
      var currentTime = nowMs(options);
      if (createdMs > currentTime + LIMITS.maxClockSkewMs) {
        throw new ShareModelError('FUTURE_CREATED_AT', 'Share creation time is too far in the future.');
      }
      if (expiresMs <= createdMs) throw new ShareModelError('INVALID_EXPIRY', 'Share expiry must follow creation.');
      if (expiresMs - createdMs > LIMITS.maxExpiryMs) {
        throw new ShareModelError('EXPIRY_TOO_LONG', 'Share expiry exceeds the maximum lifetime.');
      }
      if (expiresMs <= currentTime) throw new ShareModelError('EXPIRED', 'This shared route has expired.');
      if (!isPlainObject(candidate.routeSnapshot)) {
        throw new ShareModelError('INVALID_SNAPSHOT', 'Route snapshot must be an object.');
      }
      rejectUnexpectedKeys(candidate.routeSnapshot, SNAPSHOT_KEYS, 'routeSnapshot');
      var snapshotParkId = safeIdentifier(candidate.routeSnapshot.parkId, LIMITS.maxParkIdLength, 'routeSnapshot.parkId');
      var snapshotMode = normalizePlanningMode(candidate.routeSnapshot.planningMode);
      if (snapshotParkId !== parkId || snapshotMode !== planningMode) {
        throw new ShareModelError('SNAPSHOT_MISMATCH', 'Route snapshot context does not match its share envelope.');
      }
      var rideIds = normalizeRideIds(candidate.routeSnapshot.rideIds, 'routeSnapshot.rideIds', LIMITS.maxRideCount);
      if (!rideIds.length) throw new ShareModelError('EMPTY_ROUTE', 'A shared route must include at least one ride.');
      var snapshotCreatedAt = toIso(candidate.routeSnapshot.createdAt, 'routeSnapshot.createdAt');
      var routeStyle = safeRouteStyle(candidate.routeSnapshot.routeStyle);
      if (typeof candidate.progressSharingEnabled !== 'boolean' || typeof candidate.joinEnabled !== 'boolean') {
        throw new ShareModelError('INVALID_FLAGS', 'Share permission flags must be boolean values.');
      }
      if (STATUS_VALUES.indexOf(candidate.status) === -1) {
        throw new ShareModelError('INVALID_STATUS', 'Shared route status is invalid.');
      }
      if (own(candidate, 'ownerDisplayName') && typeof candidate.ownerDisplayName !== 'string') {
        throw new ShareModelError('INVALID_DISPLAY_NAME', 'Owner display name must be plain text.');
      }
      var ownerDisplayName = sanitizeDisplayName(candidate.ownerDisplayName);
      var payload = {
        shareSchemaVersion: SHARE_SCHEMA_VERSION,
        shareId: candidate.shareId,
        routeId: routeId,
        parkId: parkId,
        planningMode: planningMode,
        createdAt: createdAt,
        expiresAt: expiresAt,
        routeSnapshot: {
          parkId: snapshotParkId,
          planningMode: snapshotMode,
          rideIds: rideIds,
          routeStyle: routeStyle,
          createdAt: snapshotCreatedAt
        },
        progressSharingEnabled: candidate.progressSharingEnabled,
        joinEnabled: candidate.joinEnabled,
        status: candidate.status
      };
      if (ownerDisplayName) payload.ownerDisplayName = ownerDisplayName;
      if (candidate.progressSharingEnabled) {
        if (!isPlainObject(candidate.progress)) {
          throw new ShareModelError('INVALID_PROGRESS', 'Shared progress is missing.');
        }
        rejectUnexpectedKeys(candidate.progress, PROGRESS_KEYS, 'progress');
        payload.progress = normalizeProgress(candidate.progress, rideIds, createdAt);
      } else if (own(candidate, 'progress')) {
        throw new ShareModelError('UNEXPECTED_PROGRESS', 'Progress is disabled for this share.');
      }

      var unavailableRideIds = rideIds.filter(function(rideId) {
        return !rideIsKnown(parkId, rideId, options);
      });
      return {
        valid: true,
        payload: payload,
        unavailableRideIds: unavailableRideIds,
        expired: false
      };
    } catch (error) {
      if (error instanceof ShareModelError) return failure(error.code, error.message, error.details);
      return failure('INVALID_PAYLOAD', 'Share payload could not be validated.');
    }
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    if (typeof btoa !== 'function') throw new ShareModelError('ENCODING_UNAVAILABLE', 'Base64 encoding is unavailable.');
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
    if (typeof atob !== 'function') throw new ShareModelError('ENCODING_UNAVAILABLE', 'Base64 decoding is unavailable.');
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function textToBytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'utf8'));
    var binary = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function bytesToText(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return decodeURIComponent(escape(binary));
  }

  function encodeSharePayload(payload, options) {
    var validation = validateSharePayload(payload, options);
    if (!validation.valid) throw new ShareModelError(validation.code, validation.error, validation.details);
    var json = JSON.stringify(validation.payload);
    if (utf8ByteLength(json) > LIMITS.maxJsonBytes) {
      throw new ShareModelError('PAYLOAD_TOO_LARGE', 'Share payload exceeds the size limit.');
    }
    var encoded = bytesToBase64(textToBytes(json))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    if (encoded.length > LIMITS.maxEncodedPayloadLength) {
      throw new ShareModelError('PAYLOAD_TOO_LARGE', 'Encoded share payload exceeds the size limit.');
    }
    return encoded;
  }

  function decodeSharePayload(encoded, options) {
    try {
      if (typeof encoded !== 'string' || !encoded || encoded.length > LIMITS.maxEncodedPayloadLength) {
        throw new ShareModelError('MALFORMED_PAYLOAD', 'Share payload is missing or too large.');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
        throw new ShareModelError('MALFORMED_PAYLOAD', 'Share payload encoding is invalid.');
      }
      var padding = encoded.length % 4 ? '='.repeat(4 - (encoded.length % 4)) : '';
      var bytes = base64ToBytes(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding);
      if (bytes.length > LIMITS.maxJsonBytes) {
        throw new ShareModelError('PAYLOAD_TOO_LARGE', 'Decoded share payload exceeds the size limit.');
      }
      var parsed = JSON.parse(bytesToText(bytes));
      return validateSharePayload(parsed, options);
    } catch (error) {
      if (error instanceof ShareModelError) return failure(error.code, error.message, error.details);
      return failure('MALFORMED_PAYLOAD', 'Share payload could not be decoded.');
    }
  }

  function buildShareUrl(baseUrl, payload, options) {
    var encoded = encodeSharePayload(payload, options);
    var url;
    try { url = new URL(baseUrl); } catch (error) {
      throw new ShareModelError('INVALID_URL', 'Share URL base is invalid.');
    }
    var prefix = options && options.routePrefix ? String(options.routePrefix) : '/r/';
    if (prefix.charAt(0) !== '/') prefix = '/' + prefix;
    if (prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
    url.pathname = prefix + encodeURIComponent(payload.shareId);
    url.search = '';
    url.searchParams.set('r', 'share');
    url.hash = 'share=' + encoded;
    var result = url.toString();
    if (result.length > LIMITS.maxUrlLength) {
      throw new ShareModelError('URL_TOO_LARGE', 'Share URL exceeds the supported size limit.');
    }
    return result;
  }

  function parseHash(hash) {
    var value = String(hash || '').replace(/^#/, '');
    if (!value) return {};
    if (value.indexOf('/r/') === 0) {
      var question = value.indexOf('?');
      return {
        routeShareId: decodeURIComponent(value.slice(3, question === -1 ? undefined : question)),
        params: new URLSearchParams(question === -1 ? '' : value.slice(question + 1))
      };
    }
    return { params: new URLSearchParams(value) };
  }

  function parseShareUrl(input, options) {
    try {
      if (typeof input !== 'string' || !input || input.length > LIMITS.maxUrlLength) {
        throw new ShareModelError('INVALID_URL', 'Share URL is missing or too large.');
      }
      var url;
      try { url = new URL(input, options && options.baseUrl ? options.baseUrl : 'https://ridehero.invalid/'); }
      catch (error) { throw new ShareModelError('INVALID_URL', 'Share URL is invalid.'); }
      var hash = parseHash(url.hash);
      var routeMatch = url.pathname.match(/\/r\/([^/]+)\/?$/);
      var shareId = routeMatch ? decodeURIComponent(routeMatch[1]) : hash.routeShareId;
      if (!isShareId(shareId)) throw new ShareModelError('INVALID_SHARE_ID', 'Share URL does not contain a valid share ID.');
      var encoded = hash.params && (hash.params.get('share') || hash.params.get('s'));
      if (!encoded) encoded = url.searchParams.get('share') || url.searchParams.get('s');
      if (!encoded) throw new ShareModelError('MISSING_PAYLOAD', 'This v1 share link does not contain a route snapshot.');
      var decoded = decodeSharePayload(encoded, options);
      if (!decoded.valid) return decoded;
      if (decoded.payload.shareId !== shareId) {
        throw new ShareModelError('SHARE_ID_MISMATCH', 'Share URL and payload IDs do not match.');
      }
      return {
        valid: true,
        shareId: shareId,
        payload: decoded.payload,
        unavailableRideIds: decoded.unavailableRideIds,
        referralSource: url.searchParams.get('r') === 'share' ? 'share' : null,
        expired: false
      };
    } catch (error) {
      if (error instanceof ShareModelError) return failure(error.code, error.message, error.details);
      return failure('INVALID_URL', 'Share URL could not be parsed.');
    }
  }

  function createRouteImport(candidate, options) {
    var validation = validateSharePayload(candidate, options);
    if (!validation.valid) return validation;
    var payload = validation.payload;
    var unavailable = validation.unavailableRideIds;
    var available = payload.routeSnapshot.rideIds.filter(function(rideId) {
      return unavailable.indexOf(rideId) === -1;
    });
    return {
      valid: true,
      importPlan: {
        kind: 'ridehero-route-import',
        shareSchemaVersion: SHARE_SCHEMA_VERSION,
        sourceShareId: payload.shareId,
        parkId: payload.parkId,
        planningMode: payload.planningMode,
        routeStyle: payload.routeSnapshot.routeStyle,
        rideIds: available,
        originalRideIds: payload.routeSnapshot.rideIds.slice(),
        unavailableRideIds: unavailable.slice(),
        requiresActiveRouteConfirmation: !!(options && options.hasActiveRoute),
        replacesActiveRoute: false,
        syncMode: GROUP_ROUTE_V1.importMode
      },
      groupRouteCapabilities: GROUP_ROUTE_V1
    };
  }

  return Object.freeze({
    SHARE_SCHEMA_VERSION: SHARE_SCHEMA_VERSION,
    LIMITS: LIMITS,
    STATUS_VALUES: STATUS_VALUES,
    GROUP_ROUTE_V1: GROUP_ROUTE_V1,
    ShareModelError: ShareModelError,
    sanitizeDisplayName: sanitizeDisplayName,
    generateShareId: generateShareId,
    isShareId: isShareId,
    createSharePayload: createSharePayload,
    buildSharePayload: createSharePayload,
    validateSharePayload: validateSharePayload,
    encodeSharePayload: encodeSharePayload,
    decodeSharePayload: decodeSharePayload,
    buildShareUrl: buildShareUrl,
    parseShareUrl: parseShareUrl,
    createRouteImport: createRouteImport
  });
});
