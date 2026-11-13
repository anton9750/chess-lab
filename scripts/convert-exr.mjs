import { readFileSync, writeFileSync } from "fs";
import zlib from "zlib";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgbBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgbBuffer.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idatData),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function downsample(data, width, height, channels, factor) {
  const newWidth = Math.round(width / factor);
  const newHeight = Math.round(height / factor);
  const out = new (data.constructor)(newWidth * newHeight * channels);
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const sx = Math.min(width - 1, Math.round(x * factor));
      const sy = Math.min(height - 1, Math.round(y * factor));
      const srcI = (sy * width + sx) * channels;
      const dstI = (y * newWidth + x) * channels;
      for (let c = 0; c < channels; c++) out[dstI + c] = data[srcI + c];
    }
  }
  return { data: out, width: newWidth, height: newHeight };
}

function acesFilmic(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function exrToPng(inputPath, outputPath, { mode = "diff", downscale = 1, exposure = 1 } = {}) {
  const buf = readFileSync(inputPath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new EXRLoader();
  const result = loader.parse(arrayBuffer);
  let { width, height, data } = result; // data: Float32Array or Uint16Array (half float), RGBA
  const isHalf = data instanceof Uint16Array;
  if (downscale > 1) {
    ({ data, width, height } = downsample(data, width, height, 4, downscale));
  }

  function halfToFloat(h) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  const toLinear = (v) => (isHalf ? halfToFloat(v) : v);
  const toSRGB8 = (v) => {
    v = Math.max(0, Math.min(1, v));
    const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
  };
  const toLinear8 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);

  const rgb = Buffer.alloc(width * height * 3);
  const channels = 4; // RGBA from EXRLoader
  for (let i = 0; i < width * height; i++) {
    const r = toLinear(data[i * channels]);
    const g = toLinear(data[i * channels + 1]);
    const b = toLinear(data[i * channels + 2]);
    if (mode === "gray") {
      const v8 = toLinear8(r);
      rgb[i * 3] = v8;
      rgb[i * 3 + 1] = v8;
      rgb[i * 3 + 2] = v8;
    } else if (mode === "normal") {
      rgb[i * 3] = toLinear8(r);
      rgb[i * 3 + 1] = toLinear8(g);
      rgb[i * 3 + 2] = toLinear8(b);
    } else if (mode === "hdr") {
      const toSRGB8FromACES = (v) => {
        const tonemapped = acesFilmic(v * exposure);
        const srgb = tonemapped <= 0.0031308 ? tonemapped * 12.92 : 1.055 * Math.pow(tonemapped, 1 / 2.4) - 0.055;
        return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
      };
      rgb[i * 3] = toSRGB8FromACES(r);
      rgb[i * 3 + 1] = toSRGB8FromACES(g);
      rgb[i * 3 + 2] = toSRGB8FromACES(b);
    } else {
      rgb[i * 3] = toSRGB8(r);
      rgb[i * 3 + 1] = toSRGB8(g);
      rgb[i * 3 + 2] = toSRGB8(b);
    }
  }
  // EXR data is stored bottom-to-top; flip vertically
  const stride = width * 3;
  const flipped = Buffer.alloc(rgb.length);
  for (let y = 0; y < height; y++) {
    rgb.copy(flipped, y * stride, (height - 1 - y) * stride, (height - y) * stride);
  }

  const png = encodePNG(width, height, flipped);
  writeFileSync(outputPath, png);
  console.log(`Wrote ${outputPath} (${width}x${height})`);
}

const [,, inputPath, outputPath, mode, downscale, exposure] = process.argv;
exrToPng(inputPath, outputPath, { mode: mode || "diff", downscale: Number(downscale) || 1, exposure: Number(exposure) || 1 });
