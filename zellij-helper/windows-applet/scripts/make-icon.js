'use strict';
// Generates assets/icon.png (32x32 tray icon) with zero dependencies:
// a green "Z" on a dark rounded square, encoded as a minimal PNG.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, px) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    px.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const put = (x, y, r, g, b, a = 255) => {
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  const m = Math.round(S * 0.03), rad = S * 0.25;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < m || x >= S - m || y < m || y >= S - m) continue;
      const cx = Math.min(x - m, S - 1 - m - x);
      const cy = Math.min(y - m, S - 1 - m - y);
      if (cx < rad && cy < rad) {
        const dx = rad - cx, dy = rad - cy;
        if (dx * dx + dy * dy > rad * rad) continue;
      }
      put(x, y, 22, 24, 34);
    }
  }

  // Z: top bar, diagonal, bottom bar
  const x0 = S * 0.25, x1 = S * 0.75, y0 = S * 0.22, y1 = S * 0.78, t = S * 0.14;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5, fy = y + 0.5;
      if (fx < x0 || fx > x1 || fy < y0 || fy > y1) continue;
      let on = false;
      if (fy <= y0 + t || fy >= y1 - t) on = true;
      else {
        const prog = (fy - (y0 + t)) / (y1 - t - (y0 + t));
        const cx2 = x1 - t / 2 - prog * (x1 - x0 - t);
        if (Math.abs(fx - cx2) <= t * 0.62) on = true;
      }
      if (on) put(x, y, 61, 220, 132);
    }
  }
  return px;
}

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePng(32, drawIcon(32)));
console.log('wrote', out);
