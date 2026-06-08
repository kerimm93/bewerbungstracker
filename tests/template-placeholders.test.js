const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/function replaceTemplatePlaceholders\(html,replacements\)\{[\s\S]*?\n\}/);
assert(match, 'replaceTemplatePlaceholders wurde nicht gefunden');

const replaceTemplatePlaceholders = new Function(`${match[0]}; return replaceTemplatePlaceholders;`)();
const template = [
  '{{DATUM}}',
  '{{ADRESSBLOCK}}',
  '{{ANREDEZEILE}}',
  '{{STANDARD_EINLEITUNG}}',
  '{{FIRMENSPEZIFISCHER_SATZ}}',
  '{{ STANDARD_MOTIVATION }}',
  '{{STANDARD_PROJEKTE}}',
  '{{STANDARD_SCHLUSS}}',
  '{{NAME}}'
].join('|');

const rendered = replaceTemplatePlaceholders(template, {
  DATUM: '08.06.2026',
  ADRESSBLOCK: 'Beispiel GmbH',
  ANREDEZEILE: 'Sehr geehrte Damen und Herren,',
  STANDARD_EINLEITUNG: 'Einleitung',
  FIRMENSPEZIFISCHER_SATZ: 'Firmensatz',
  STANDARD_MOTIVATION: 'Motivation',
  STANDARD_PROJEKTE: '',
  STANDARD_SCHLUSS: null,
  NAME: 'Max Mustermann'
});

assert(!rendered.includes('{{STANDARD_'), 'STANDARD_*-Token blieb im Ergebnis stehen');
assert(!/\{\{\s*STANDARD_/.test(rendered), 'STANDARD_*-Token mit Leerraum blieb im Ergebnis stehen');
assert(!rendered.includes('{{FIRMENSPEZIFISCHER_SATZ}}'));
assert(!rendered.includes('{{ANREDEZEILE}}'));
assert(!rendered.includes('{{ADRESSBLOCK}}'));
assert(!rendered.includes('{{DATUM}}'));
assert(rendered.includes('Einleitung'));
assert(rendered.includes('Motivation'));
assert(rendered.includes('Beispiel GmbH'));
assert(rendered.includes('Max Mustermann'));
assert(rendered.includes('Motivation|||Max Mustermann'), 'Leere optionale Blöcke wurden nicht leer ersetzt');

console.log('Template token replacement OK');
