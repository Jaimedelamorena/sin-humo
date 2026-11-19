// Genera los iconos PNG de la app sin dependencias: node tools/make-icons.mjs
// Dibujo: fondo verde azulado, cigarro con filtro y señal de prohibido.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG_A = hex('#14a394');
const BG_B = hex('#0b4d47');
const PAPER = hex('#ffffff');
const FILTER = hex('#f5a524');
const EMBER = hex('#ff6a3d');
const NO = hex('#ff5c7a');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// x, y en [0, 1], y hacia abajo
function colorAt(x, y) {
  let c = mix(BG_A, BG_B, Math.min(1, (x * 0.4 + y * 0.9) / 1.1));
  const cx = 0.5, cy = 0.5, hw = 0.235, hh = 0.058;
  if (sdRoundRect(x, y, cx, cy, hw, hh, 0.022) <= 0) {
    if (x > cx + hw - 0.105) c = FILTER;
    else if (x < cx - hw + 0.04) c = EMBER;
    else c = PAPER;
  }
  const R = 0.335, T = 0.062, k = R * Math.SQRT1_2;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (Math.abs(d - R) <= T / 2 || sdSegment(x, y, 0.5 - k, 0.5 - k, 0.5 + k, 0.5 + k) <= T / 2) c = NO;
  return c;
}

function png(size, S = 4) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let j = 0; j < size; j++) {
    raw[j * stride] = 0; // sin filtro
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt((i + (sx + 0.5) / S) / size, (j + (sy + 0.5) / S) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = j * stride + 1 + i * 3;
      raw[o] = Math.round(r / (S * S));
      raw[o + 1] = Math.round(g / (S * S));
      raw[o + 2] = Math.round(b / (S * S));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 2;  // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, png(size));
  console.log('ok', file);
}
