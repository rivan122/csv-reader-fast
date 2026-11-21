// A faster drop-in for csv-reader 1.0.0: same reading, same answers, less work per character.
// Fields are sliced out of the text instead of built one character at a time, and quoted fields are
// found with indexOf. The broken-row policy (stray_cr, quote_junk, unterminated_quote, short_row,
// long_row and their line/row numbers) is csv-reader 1.0.0's, exactly.

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const len = text.length;
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code: code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos, appending characters to `value`, and counts the characters it
  // kept in `added`. Used where the fast path cannot go: a stray CR, or the text after a closing
  // quote. Returns how the field ended.
  function readUnquotedFrom(value) {
    let added = 0;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value: value, ended: COMMA, added: added };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value: value, ended: BREAK, added: added };
      }
      if (c === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value: value, ended: BREAK, added: added };
        }
        pushError('stray_cr');
        pos += 1;
        continue;
      }
      const start = pos;
      while (pos < len) {
        const d = text.charCodeAt(pos);
        if (d === 44 || d === 10 || d === 13) break;
        pos += 1;
      }
      const seg = text.slice(start, pos);
      value += seg;
      added += seg.length;
    }
    return { value: value, ended: END, added: added };
  }

  function readUnquotedInto(fields) {
    const start = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44 || c === 10 || c === 13) break;
      pos += 1;
    }
    if (pos >= len) {
      fields.push(text.slice(start, pos));
      return END;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      fields.push(text.slice(start, pos));
      pos += 1;
      return COMMA;
    }
    if (c === 10) {
      fields.push(text.slice(start, pos));
      pos += 1;
      line += 1;
      return BREAK;
    }
    if (text.charCodeAt(pos + 1) === 10) {
      fields.push(text.slice(start, pos));
      pos += 2;
      line += 1;
      return BREAK;
    }
    // A CR not followed by LF is dropped, with stray_cr; read the rest of the field the slow way.
    const r = readUnquotedFrom(text.slice(start, pos));
    fields.push(r.value);
    return r.ended;
  }

  function readQuotedInto(fields) {
    const open = pos;
    const openLine = line;
    pos += 1; // the opening quote
    let value = '';
    let segs = null;
    let segStart = pos;
    let scan = pos;
    let closed = false;
    while (true) {
      const q = text.indexOf('"', scan);
      if (q < 0) break;
      if (text.charCodeAt(q + 1) === 34) {
        if (segs === null) segs = [];
        segs.push(text.slice(segStart, q + 1));
        scan = q + 2;
        segStart = scan;
        continue;
      }
      if (segs === null) {
        value = text.slice(segStart, q);
      } else {
        segs.push(text.slice(segStart, q));
        value = segs.join('');
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: a literal character, and the text after it is read again unquoted.
      pos = open + 1;
      line = openLine;
      pushError('unterminated_quote');
      const r = readUnquotedFrom('"');
      fields.push(r.value);
      return r.ended;
    }
    let cr = value.indexOf('\r');
    if (cr >= 0) value = value.replace(/\r\n?/g, '\n');
    let nl = value.indexOf('\n');
    if (nl >= 0) {
      let n = 0;
      while (true) {
        n += 1;
        nl = value.indexOf('\n', nl + 1);
        if (nl < 0) break;
      }
      line += n;
    }
    if (pos >= len) {
      fields.push(value);
      return END;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fields.push(value);
      return COMMA;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fields.push(value);
      return BREAK;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fields.push(value);
      return BREAK;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const r = readUnquotedFrom(value);
    if (r.added > 0) pushError('quote_junk');
    fields.push(r.value);
    return r.ended;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quotedFirst = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        if (fields.length === 0) quotedFirst = true;
        ended = readQuotedInto(fields);
      } else {
        ended = readUnquotedInto(fields);
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quotedFirst) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows: rows, errors: errors };
}
