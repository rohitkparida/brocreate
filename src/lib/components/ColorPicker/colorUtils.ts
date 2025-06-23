// Color utility functions for the ColorDisc component

export function degToRad(deg: number): number {
  return deg * Math.PI / 180;
}

export function radToDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

export function getAngleFromPos(pos: { x: number, y: number }, radians = false): number {
  let angle = Math.atan2(pos.y, pos.x);
  if (angle < 0) angle += Math.PI * 2;
  if (radians) return angle;
  return Math.floor(radToDeg(angle));
}

export function getPosFromDegAndRadius(deg: number, radius: number): { x: number, y: number } {
  const angleRad = degToRad(deg);
  return {
    x: radius * Math.cos(angleRad),
    y: radius * Math.sin(angleRad),
  };
}

// Fast OKLCH to RGB conversion (mathematical, no DOM)
// Based on https://github.com/davidenke/oklch-converter and culori.js
// This version clamps the final sRGB values, which can produce better results for out-of-gamut colors.
function srgb_transfer_function(a: number): number {
  return .0031308 >= a ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - .055
}

function srgb_transfer_function_inv(a: number): number {
  return .04045 < a ? Math.pow((a + .055) / 1.055, 2.4) : a / 12.92
}

export function oklchToRgb(l: number, c: number, h: number): { r: number, g: number, b: number } {
  l = l / 100; // convert from 0-100 to 0-1
  const hRad = h * Math.PI / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + .3963377774 * a + .2158037573 * b;
  const m_ = l - .1055613458 * a - .0638541728 * b;
  const s_ = l - .0894841775 * a - 1.2914855480 * b;

  const l_c = l_ * l_ * l_;
  const m_c = m_ * m_ * m_;
  const s_c = s_ * s_ * s_;

  const r_lin =  4.0767416621 * l_c - 3.3077115913 * m_c + .2309699292 * s_c;
  const g_lin = -1.2684380046 * l_c + 2.6097574011 * m_c - .3413193965 * s_c;
  const b_lin = -.0041960863 * l_c - .7034186147 * m_c + 1.7076147010 * s_c;
  
  const red = Math.round(255 * srgb_transfer_function(r_lin));
  const green = Math.round(255 * srgb_transfer_function(g_lin));
  const blue = Math.round(255 * srgb_transfer_function(b_lin));

  return { 
    r: Math.max(0, Math.min(255, red)), 
    g: Math.max(0, Math.min(255, green)), 
    b: Math.max(0, Math.min(255, blue)) 
  };
}

// Fast RGB to OKLCH conversion (mathematical, no DOM)
export function rgbToOklch(r: number, g: number, b: number): { l: number, c: number, h: number } {
  const r_lin = srgb_transfer_function_inv(r / 255);
  const g_lin = srgb_transfer_function_inv(g / 255);
  const b_lin = srgb_transfer_function_inv(b / 255);

  const l_ = .4122214708 * r_lin + .5363325363 * g_lin + .0514459929 * b_lin;
  const m_ = .2119034982 * r_lin + .6806995451 * g_lin + .1073969566 * b_lin;
  const s_ = .0883024619 * r_lin + .2817188376 * g_lin + .6299787005 * b_lin;

  const l_c = Math.cbrt(l_);
  const m_c = Math.cbrt(m_);
  const s_c = Math.cbrt(s_);

  const l_lab = .2104542553 * l_c + .7936177850 * m_c - .0040720468 * s_c;
  const a_lab = 1.9779984951 * l_c - 2.4285922050 * m_c + .4505937099 * s_c;
  const b_lab = .0259040371 * l_c + .7827717662 * m_c - .8086757660 * s_c;

  const C = Math.sqrt(a_lab * a_lab + b_lab * b_lab);
  let H = 180 / Math.PI * Math.atan2(b_lab, a_lab);
  if (H < 0) H += 360;

  return { l: l_lab * 100, c: C, h: H };
}

export function oklchToHex(l: number, c: number, h: number): string {
  const rgb = oklchToRgb(l, c, h);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function hexToOklch(hex: string): { l: number, c: number, h: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { l: 50, c: 0.1, h: 0 };
  return rgbToOklch(rgb.r, rgb.g, rgb.b);
}

export function createOklchColor(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;
}

// Legacy HSL functions (keeping for compatibility)
export function hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 1/6) {
    r = c; g = x; b = 0;
  } else if (h >= 1/6 && h < 2/6) {
    r = x; g = c; b = 0;
  } else if (h >= 2/6 && h < 3/6) {
    r = 0; g = c; b = x;
  } else if (h >= 3/6 && h < 4/6) {
    r = 0; g = x; b = c;
  } else if (h >= 4/6 && h < 5/6) {
    r = x; g = 0; b = c;
  } else if (h >= 5/6 && h < 1) {
    r = c; g = 0; b = x;
  }

  return {
    r: r + m,
    g: g + m,
    b: b + m
  };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number, s: number, l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const sum = max + min;
  const l = sum / 2;

  if (diff === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = l > 0.5 ? diff / (2 - sum) : diff / sum;
  let h = 0;

  if (max === r) {
    h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / diff + 2) / 6;
  } else {
    h = ((r - g) / diff + 4) / 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
} 