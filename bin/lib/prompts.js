// bin/lib/prompts.js
// Tiny readline wrapper. Zero deps.
// Used by install and doctor to ask interactive questions.

'use strict';

const readline = require('node:readline');

function ask(question, { default: def, choices } = {}) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = def !== undefined ? ` [${def}]` : '';
    const choiceHint = choices ? ` (${choices.join('/')})` : '';
    rl.question(`${question}${suffix}${choiceHint}: `, (answer) => {
      rl.close();
      const trimmed = (answer || '').trim();
      if (!trimmed && def !== undefined) return resolve(def);
      if (!trimmed && choices) return resolve(choices[0]);
      if (choices && !choices.includes(trimmed)) {
        return reject(new Error(`Invalid answer "${trimmed}". Expected one of: ${choices.join(', ')}`));
      }
      resolve(trimmed);
    });
  });
}

async function choose(question, options) {
  // options: [{ key, label, description }]
  console.log(`\n${question}\n`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label} — ${o.description || ''}`));
  const idx = parseInt(await ask('Choose', { default: '1' }), 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= options.length) {
    throw new Error(`Choice out of range. Pick 1-${options.length}.`);
  }
  return options[idx].key;
}

function confirm(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  return ask(`${question} ${hint}`, { default: defaultYes ? 'y' : 'n' })
    .then((a) => {
      const v = a.toLowerCase();
      return defaultYes ? v !== 'n' && v !== 'no' : v === 'y' || v === 'yes';
    });
}

module.exports = { ask, choose, confirm };
