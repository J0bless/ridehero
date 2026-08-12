'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'growth-loader.js'), 'utf8');

function makeElement(tagName, owner) {
  const listeners = Object.create(null);
  return {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    parentNode: null,
    addEventListener(type, handler) { listeners[type] = handler; },
    remove() {
      const index = owner.head.children.indexOf(this);
      if (index >= 0) owner.head.children.splice(index, 1);
      this.parentNode = null;
    },
    dispatch(type, event) {
      if (typeof listeners[type] === 'function') listeners[type](event || { type });
      const property = this[`on${type}`];
      if (typeof property === 'function') property(event || { type });
    }
  };
}

function createHarness() {
  const status = { textContent: '' };
  const document = {
    readyState: 'loading',
    _domReady: null,
    head: {
      children: [],
      appendChild(node) {
        node.parentNode = this;
        this.children.push(node);
        return node;
      }
    },
    createElement(tag) { return makeElement(tag, document); },
    getElementById(id) { return id === 'growth-live-status' ? status : null; },
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') this._domReady = handler; },
    querySelector(selector) {
      if (selector.startsWith('link[')) return null;
      const match = selector.match(/^script\[data-growth-src="([^"]+)"\]$/);
      if (!match) return null;
      return this.head.children.find(node => node.dataset && node.dataset.growthSrc === match[1]) || null;
    }
  };
  const location = {
    origin: 'https://ridehero.example',
    href: 'https://ridehero.example/',
    pathname: '/',
    search: '',
    hash: ''
  };
  const window = { document, location, URLSearchParams, Promise, console, setTimeout, clearTimeout };
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, URLSearchParams, Promise, console, setTimeout, clearTimeout }), {
    filename: 'js/growth-loader.js'
  });
  return { window, document, status };
}

(async function run() {
  const harness = createHarness();
  const firstAttempt = harness.window.RideHeroGrowthLoader.ensure();
  assert.match(harness.status.textContent, /loading/i,
    'the loader must expose a visible/accessibly announced loading state while lazy scripts download');

  const firstScript = harness.document.head.children.find(node => node.tagName === 'SCRIPT');
  assert.ok(firstScript, 'the first lazy sharing script must be appended');
  firstScript.dispatch('error', new Error('simulated network failure'));
  const firstRejected = await firstAttempt.then(() => false, () => true);
  assert.equal(firstRejected, true, 'a failed lazy script must reject the first ensure attempt');
  assert.match(harness.status.textContent, /temporarily unavailable|try again/i,
    'lazy-load failure must surface a useful retry message');
  assert.equal(firstScript.parentNode, null,
    'a failed script element must be removed so a later attempt can actually retry the request');

  const retryAttempt = harness.window.RideHeroGrowthLoader.ensure();
  const retryScript = harness.document.head.children.find(node => node.tagName === 'SCRIPT');
  assert.ok(retryScript, 'retry must append a new script request');
  assert.notEqual(retryScript, firstScript, 'retry must not wait forever on the already-failed script element');
  retryScript.dispatch('error', new Error('stop test retry'));
  await retryAttempt.catch(() => null);

  console.log('Growth lazy-loader loading, failure, and retry contracts passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
