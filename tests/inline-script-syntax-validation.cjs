const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineScripts = Array.from(html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi))
  .filter((match) => !/\bsrc\s*=/.test(match[1]));

assert(inlineScripts.length > 0, 'index.html must contain at least one inline JavaScript block');
inlineScripts.forEach((match, index) => {
  new vm.Script(match[2], { filename: `index.inline-${index + 1}.js` });
});

console.log(`Inline JavaScript syntax validation passed for ${inlineScripts.length} block(s).`);
