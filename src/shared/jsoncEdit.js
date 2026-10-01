'use strict';
// jsoncEdit.js: change one value in a JSON-with-comments text (theme.json) and keep everything
// else as it was: comments, key order, indentation, line breaks. Used by the Theme tab in
// Settings, which writes to a theme a person may also have written and commented by hand.
//
// setJsonc(text, path, value) sets a value, creating the objects on the way; a path that runs
// into something that is not an object (e.g. `"glow": true`) replaces it with one. Passing
// `undefined` as the value removes the property. Only objects are walked, never arrays.

/**
 * A light JSONC scanner that records where every object's properties are.
 * @typedef {{ type: 'object', start: number, end: number, props: Prop[] } | { type: 'value', start: number, end: number }} Node
 * @typedef {{ key: string, keyStart: number, value: Node, end: number }} Prop
 */
function scan(text) {
  let i = 0;
  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
      if (text[i] === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? text.length : e + 2; continue; }
      return;
    }
  };
  const string = () => {
    const s = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(s, i));
  };
  /** @returns {Node} */
  const value = () => {
    skip();
    const start = i;
    if (text[i] === '{') {
      i++;
      /** @type {Prop[]} */
      const props = [];
      for (;;) {
        skip();
        if (text[i] === '}') { i++; break; }
        if (text[i] === ',') { i++; continue; }
        if (text[i] !== '"') throw new Error(`Unexpected ${text[i] || 'end'} at ${i}`);
        const keyStart = i;
        const key = string();
        skip();
        if (text[i] !== ':') throw new Error(`Expected : at ${i}`);
        i++;
        const v = value();
        props.push({ key, keyStart, value: v, end: v.end });
      }
      return { type: 'object', start, end: i, props };
    }
    if (text[i] === '[') {
      i++;
      for (;;) {
        skip();
        if (text[i] === ']') { i++; break; }
        if (text[i] === ',') { i++; continue; }
        if (i >= text.length) throw new Error('Unclosed array');
        value();
      }
      return { type: 'value', start, end: i };
    }
    if (text[i] === '"') { string(); return { type: 'value', start, end: i }; }
    while (i < text.length && /[^\s,}\]/]/.test(text[i])) i++;
    if (i === start) throw new Error(`Unexpected ${text[i] || 'end'} at ${i}`);
    return { type: 'value', start, end: i };
  };
  return value();
}

/** The whitespace at the start of the line that `pos` is on. */
function indentAt(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))[0];
}

/** One step deeper than an object's own line, in the file's own unit (two spaces if unknown). */
function childIndent(text, obj) {
  if (obj.props.length) return indentAt(text, obj.props[0].keyStart);
  const unit = /\n([ \t]+)"/.exec(text);
  return indentAt(text, obj.start) + (unit ? unit[1].replace(/^(\t| {2,4}).*$/, '$1') : '  ');
}

/** JSON on one line with a space after commas and colons, as people write it by hand. */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`.replace('{  }', '{}');
  return JSON.stringify(value);
}

/** JSON for a value, inline when short and indented under `indent` otherwise. */
function format(value, indent) {
  const flat = inline(value);
  if (flat.length <= 72 || value === null || typeof value !== 'object') return flat;
  return JSON.stringify(value, null, 2).split('\n').join(`\n${indent}`);
}

/**
 * @param {string} text the theme.json text
 * @param {string[]} path property names from the root object
 * @param {any} value the new value, or undefined to remove the property
 * @returns {string} the changed text
 */
function setJsonc(text, path, value) {
  const root = scan(text);
  if (root.type !== 'object') throw new Error('theme.json is not an object');
  let obj = root;
  for (let d = 0; d < path.length; d++) {
    const key = path[d];
    const last = d === path.length - 1;
    const hit = obj.props.find((p) => p.key === key);
    if (hit && last) {
      if (value === undefined) return removeProp(text, obj, hit);
      return text.slice(0, hit.value.start) + format(value, indentAt(text, hit.keyStart)) + text.slice(hit.value.end);
    }
    if (hit && hit.value.type === 'object') { obj = hit.value; continue; }
    if (value === undefined) return text; // nothing there to remove
    // Build the rest of the path as one nested value.
    /** @type {any} */
    let nested = value;
    for (let k = path.length - 1; k > d; k--) nested = { [path[k]]: nested };
    if (hit) return text.slice(0, hit.value.start) + format(nested, indentAt(text, hit.keyStart)) + text.slice(hit.value.end);
    return insertProp(text, obj, key, nested);
  }
  return text;
}

/** Adds `"key": value` as the last property of `obj`. */
function insertProp(text, obj, key, value) {
  const indent = childIndent(text, obj);
  const entry = `${JSON.stringify(key)}: ${format(value, indent)}`;
  if (!obj.props.length) {
    const close = obj.end - 1;
    const inner = text.slice(obj.start + 1, close);
    if (inner.includes('\n') || !/^\s*$/.test(inner)) {
      return `${text.slice(0, close).replace(/[ \t]*$/, '')}${inner.endsWith('\n') ? '' : '\n'}${indent}${entry}\n${indentAt(text, obj.start)}${text.slice(close)}`;
    }
    return `${text.slice(0, obj.start + 1)}\n${indent}${entry}\n${indentAt(text, obj.start)}${text.slice(close)}`;
  }
  const lastProp = obj.props[obj.props.length - 1];
  const after = text.slice(lastProp.end);
  // A trailing comma may already follow the last property.
  const comma = /^\s*,/.exec(after);
  const at = comma ? lastProp.end + comma[0].length : lastProp.end;
  return `${text.slice(0, at)}${comma ? '' : ','}\n${indent}${entry}${text.slice(at)}`;
}

/** Takes a property out with its line, and the comma that went with it. */
function removeProp(text, obj, prop) {
  const idx = obj.props.indexOf(prop);
  let from = prop.keyStart;
  let to = prop.end;
  const after = /^[ \t]*,/.exec(text.slice(to));
  if (after) to += after[0].length;
  else if (idx > 0) {
    // The last property: drop the comma before it instead.
    const prev = obj.props[idx - 1];
    const between = text.slice(prev.end, from);
    const c = between.indexOf(',');
    if (c !== -1) from = prev.end + c;
  }
  // Take the whole line when the property had it to itself.
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  if (/^[ \t]*$/.test(text.slice(lineStart, from)) && /^[ \t]*(\r?\n)/.test(text.slice(to))) {
    from = lineStart;
    to += /^[ \t]*\r?\n/.exec(text.slice(to))[0].length;
  }
  return text.slice(0, from) + text.slice(to);
}

module.exports = { setJsonc };
