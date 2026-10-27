/**
 * `k3dHandleLook` 的 CPU 复刻 —— **结论：不可用，仅作证据保留**
 *
 * 这份实现的用途不是生产，而是把"把柄烘焙搬到 JS 能不能成"这件事**量出来**。
 * 实测（RESULT §3.20(a)，`tools/probe-handle-cpu.mjs`）：
 *   24 格图集与 GPU 现烘结果的平均差 **14.65/255**（p99 131），
 *   其中 15/24 格超过 8/255、低频层（结构）最大差 20.62/255、
 *   亮度归一化互相关最低 **-0.05**（= 图案落在别处）。
 * 所以生产走的`是"离线预烘 + 运行时零烘焙"（`tools/bake-handle-atlas.mjs` +
 * `assets/handle-atlas.png`），审计 #8 由那条路收口。
 *
 * 为什么对不上（不是一个可以修的 bug）：
 *   `k3dHHash` = `fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453)`。
 *   p 最大到 ~180，dot 可到 7.6e4；fp32 在这么大的自变量上，`sin` 的实现各家不同，
 *   相位误差乘 43758 之后小数部分完全去相关。实测连"最小自变量"那档
 *   （dot≈1900）都是平均差 0.33 ≈ 两个独立均匀分布的理论值 1/3，
 *   用 `Math.fround` 逐位模拟 fp32 **也救不回来**。
 *   于是凡是噪声参与定位的东西（矿脉 / 皮革细胞 / 坑点 / 条纹相位）都会搬家。
 *
 * 保留它的理由：以后若有人再想走这条路，先跑 `probe:handle-cpu` 看这组数字，
 * 不用重新踩一遍。改动本文件没有任何生产影响（src 里没有任何模块 import 它）。
 *
 * 与 GLSL 的关系：
 *   24 个分支逐条对照 `src/render/legacy/skin/shader/handleLook.js` 的 `k3dHandleLook`，
 *   常量、运算顺序、clamp 位置一律照抄（含 `clamp(look.a, 0, 1)` 把负 dr 压成 0 这个既有行为）。
 *   它**不是**重新设计，是同一段数学的另一种执行位置。
 *
 * 边界：
 *   · 只算 2D：z 固定 0.5（与烘焙时 `vec3(clamp(vUv.x), clamp(vUv.y), 0.5)` 一致）；
 *   · 输出 RGBA8：rgb = 底色乘子（写盘前 clamp 到 [0,1]），a = 粗糙度偏移；
 *   · 纯函数、不碰 DOM / WebGL，可在 Node 里直接跑。
 */

const TAU = 6.28318;   // GLSL 里写的就是 6.28318（不是 2π），照抄
const PI_L = 3.14159;  // 同上

/* ---------- GLSL 内建函数 ---------- */

const fract = (x) => x - Math.floor(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const mod = (x, y) => x - y * Math.floor(x / y);

/** GLSL smoothstep：t 先 clamp 到 [0,1] 再 3t²-2t³ */
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/* ---------- 噪声（逐字对照 handleLook.js 顶部五个函数） ---------- */

function k3dHHash(x, y, z) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123);
}

function k3dHNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const n000 = k3dHHash(ix, iy, iz);
  const n100 = k3dHHash(ix + 1, iy, iz);
  const n010 = k3dHHash(ix, iy + 1, iz);
  const n110 = k3dHHash(ix + 1, iy + 1, iz);
  const n001 = k3dHHash(ix, iy, iz + 1);
  const n101 = k3dHHash(ix + 1, iy, iz + 1);
  const n011 = k3dHHash(ix, iy + 1, iz + 1);
  const n111 = k3dHHash(ix + 1, iy + 1, iz + 1);
  return mix(
    mix(mix(n000, n100, fx), mix(n010, n110, fx), fy),
    mix(mix(n001, n101, fx), mix(n011, n111, fx), fy),
    fz,
  );
}

function k3dHFbm(x, y, z) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 3; i++) {
    v += a * k3dHNoise(x, y, z);
    x *= 2.03; y *= 2.03; z *= 2.03;
    a *= 0.5;
  }
  return v;
}

/** 返回 [d1, d2-d1]（写进数组避免每帧分配） */
function k3dHVoro(px, py, out) {
  const ipx = Math.floor(px), ipy = Math.floor(py);
  const fpx = px - ipx, fpy = py - ipy;
  let d1 = 8, d2 = 8;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = ipx + i, gy = ipy + j;
      const ox = k3dHHash(gx, gy, 1.7);
      const oy = k3dHHash(gx, gy, 4.3);
      const dx = i + ox - fpx, dy = j + oy - fpy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  out[0] = d1; out[1] = d2 - d1;
  return out;
}

function k3dHBand(x, f, width) {
  return 1 - smoothstep(width, width + 0.035, Math.abs(fract(x * f) - 0.5));
}

/* ---------- 主函数 ---------- */

const VORO = [0, 0];

/**
 * @param {number} kind 0..23
 * @param {number} lx   沿握柄方向 0..1
 * @param {number} ly   截面方向 0..1
 * @param {number} lz   截面方向 0..1（烘焙时恒 0.5）
 * @returns {[number,number,number,number]} [r,g,b,roughnessOffset]，未量化
 */
export function handleLookCPU(kind, lx, ly, lz) {
  const x = clamp01(lx), u = clamp01(ly), vz = clamp01(lz);

  /* GLSL 里 n / cloud 在分支之前无条件求值；这里改成惰性 —— 值完全相同，
     只是没被用到的分支不再白算（kind 3/7/15 等根本不用 n）。 */
  let cacheN = NaN, cacheCloud = NaN;
  const n = () => {
    if (Number.isNaN(cacheN)) cacheN = k3dHNoise(x * 92, u * 68, vz * 54);
    return cacheN;
  };
  const cloud = () => {
    if (Number.isNaN(cacheCloud)) cacheCloud = k3dHFbm(x * 4, u * 4, vz * 4);
    return cacheCloud;
  };

  let r = 1, g = 1, b = 1;
  let dr = 0;

  switch (kind) {
    case 0: { // 温木柄：暖胡桃木，顺纹、火焰纹、细导管
      const warp = (k3dHFbm(x * 3, u * 5, vz * 4) - 0.5) * 0.24;
      const grain = 0.5 + 0.5 * Math.sin((u * 31 + vz * 5 + warp * 11) * TAU);
      const flame = 0.5 + 0.5 * Math.sin((u * 8 + warp * 3 + cloud() * 0.22) * TAU);
      const pore = smoothstep(0.80, 0.98, n());
      const w = 0.78 + grain * 0.27 + flame * 0.08 - pore * 0.15;
      r = w; g = w * (0.89 + grain * 0.05); b = w * (0.75 + flame * 0.08);
      dr = 0.025 + (1 - grain) * 0.065 + pore * 0.045;
      break;
    }
    case 1: { // 握皮纹：鞍革粒面，细胞起伏与压暗毛孔
      k3dHVoro(x * 24 + vz * 1.7, u * 34 + vz * 0.8, VORO);
      const cell = smoothstep(0.025, 0.16, VORO[1]);
      const pore = smoothstep(0.88, 0.99, k3dHNoise(x * 132, u * 118, vz * 100));
      const w = 0.70 + cell * 0.35 + (cloud() - 0.5) * 0.11 - pore * 0.12;
      r = w; g = w * 0.94; b = w * 0.89;
      dr = 0.055 + cell * 0.07 + pore * 0.04;
      break;
    }
    case 2: { // 止滑胶：微砂黑胶、斜向交叉止滑齿
      const a = Math.abs(fract((u + vz * 0.72 + x * 0.08) * 13) - 0.5);
      const bb = Math.abs(fract((u - vz * 0.72 - x * 0.08) * 13) - 0.5);
      const ridge = 1 - smoothstep(0.20, 0.38, Math.min(a, bb));
      const fleck = k3dHNoise(x * 180, u * 145, vz * 120);
      const w = 0.78 + ridge * 0.19 + (fleck - 0.5) * 0.10;
      r = w * 0.98; g = w; b = w * 1.03;
      dr = 0.055 + (1 - ridge) * 0.035;
      break;
    }
    case 3: { // 轻量化：石墨聚合物，长槽与分段减重口
      const channel = k3dHBand(u * 0.78 + vz * 0.42, 8, 0.22);
      const segment = k3dHBand(x, 7, 0.035);
      const bead = smoothstep(0.78, 0.98, n());
      const w = 0.91 - channel * 0.25 - segment * 0.08 + bead * 0.035;
      r = w * 0.94; g = w * 0.98; b = w * 1.04;
      dr = 0.025 + channel * 0.055 + segment * 0.025;
      break;
    }
    case 4: { // 竹节柄：蜜金竹纤维、自然节环
      const fiber = 0.5 + 0.5 * Math.sin((u * 29 + vz * 4 + (cloud() - 0.5) * 1.5) * TAU);
      const node = k3dHBand(x, 4.5, 0.045);
      const nodeShade = node * (0.20 + 0.08 * k3dHFbm(x * 6, u * 6, vz * 6));
      const w = 0.89 + fiber * 0.18 - nodeShade + (n() - 0.5) * 0.035;
      r = w * 1.02; g = w; b = w * (0.82 + fiber * 0.08);
      dr = 0.035 + (1 - fiber) * 0.05 + node * 0.025;
      break;
    }
    case 5: { // 战术柄：军绿 G10 层压板，交织玻纤层
      const layer = 0.5 + 0.5 * Math.sin((u * 52 + vz * 15 + (cloud() - 0.5) * 2.4) * TAU);
      const weave = 0.5 + 0.5 * Math.sin((x * 34 + u * 21) * TAU) * Math.sin((x * 34 - u * 21) * TAU);
      const w = 0.70 + layer * 0.29 + weave * 0.07;
      r = w * 0.82; g = w * 0.93; b = w * 0.72;
      dr = 0.015 + (1 - layer) * 0.045;
      break;
    }
    case 6: { // 拉丝柄：冷银钛，极细纵向拉丝
      const scratch = 0.5 + 0.5 * Math.sin((u * 245 + vz * 21 + (cloud() - 0.5) * 3.2) * TAU);
      const broad = k3dHFbm(x * 3, u * 7, vz * 5);
      const w = 0.94 + (scratch - 0.5) * 0.14 + (broad - 0.5) * 0.035;
      r = w * 0.97; g = w; b = w * 1.035;
      dr = -0.035 + (1 - scratch) * 0.035;
      break;
    }
    case 7: { // 机加柄：数控环车纹、同心细槽与精密哑光
      const cx = u - 0.5, cy = (vz - 0.5) * 1.25;
      const rr = Math.sqrt(cx * cx + cy * cy);
      const rings = 0.5 + 0.5 * Math.sin((rr * 145 + x * 2) * TAU);
      const fine = k3dHNoise(x * 125, u * 96, vz * 82);
      const w = 0.91 + (rings - 0.5) * 0.12 + (fine - 0.5) * 0.035;
      r = w * 0.94; g = w * 0.98; b = w * 1.02;
      dr = -0.01 + (rings - 0.5) * 0.065;
      break;
    }
    case 8: { // 碳纤柄：黑蓝 2x2 斜纹编织，纤维交叠
      const zx = x * 34 + u * 2, zy = u * 28 + vz * 18;
      const fx = fract(zx), fy = fract(zy);
      const over = mod(Math.floor(zx) + Math.floor(zy), 2);
      const strand = mix(0.5 + 0.5 * Math.sin(fx * TAU), 0.5 + 0.5 * Math.sin(fy * TAU), over);
      const edge = smoothstep(0, 0.16, Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)));
      const w = 0.55 + strand * 0.46 * edge + edge * 0.13;
      r = w * 0.80; g = w * 0.90; b = w * 1.18;
      dr = -0.025 - strand * 0.035 + (1 - edge) * 0.045;
      break;
    }
    case 9: { // 白瓷柄：温白釉面，细密冰裂纹
      k3dHVoro(x * 13 + vz * 1.5, u * 15 + vz * 5, VORO);
      const crack = 1 - smoothstep(0.012, 0.043, VORO[1]);
      const cloudWhite = k3dHFbm(x * 2, u * 2, vz * 2);
      const w = 0.98 + (cloudWhite - 0.5) * 0.07 - crack * 0.30;
      r = w; g = w * 0.995; b = w * 0.965;
      dr = -0.045 + crack * 0.14;
      break;
    }
    case 10: { // 云脉石柄：灰白云石，大尺度自然矿脉
      const warp = k3dHFbm(x * 2.4, u * 2.4, vz * 2.4) * 1.8;
      const veinWave = Math.abs(Math.sin((u * 7.5 + vz * 3.6 + x * 1.2 + warp) * PI_L));
      const veins = 1 - smoothstep(0.055, 0.24, veinWave);
      const cloudStone = k3dHFbm(x * 3.6, u * 3.6, vz * 3.6);
      const w = 0.92 + (cloudStone - 0.5) * 0.22 - veins * 0.34;
      r = mix(w * 0.94, w * 0.48, veins * 0.84);
      g = mix(w * 0.95, w * 0.53, veins * 0.84);
      b = mix(w * 0.98, w * 0.62, veins * 0.84);
      dr = 0.02 + veins * 0.09;
      break;
    }
    case 11: { // 旧木柄：烟熏深木、裂丝与磨蚀边
      const warp = (k3dHFbm(x * 2.5, u * 4, vz * 3) - 0.5) * 0.34;
      const grain = 0.5 + 0.5 * Math.sin((u * 23 + vz * 6 + warp * 10) * TAU);
      const crack = smoothstep(0.72, 0.91, k3dHFbm(x * 4, u * 9, vz * 7));
      const wear = smoothstep(0.78, 0.98, k3dHNoise(x * 35, u * 21, vz * 25));
      const w = 0.65 + grain * 0.27 + (cloud() - 0.5) * 0.08 - crack * 0.18 + wear * 0.06;
      r = w; g = w * 0.87; b = w * 0.72;
      dr = 0.06 + (1 - grain) * 0.04 + crack * 0.08;
      break;
    }
    case 12: { // 缠光皮柄：斜缠皮带、压边缝线与细粒面
      const wrap = fract(x * 7 + u * 0.84 + vz * 0.34);
      const seam = 1 - smoothstep(0.025, 0.085, Math.min(wrap, 1 - wrap));
      const overlap = smoothstep(0.10, 0.20, wrap) * (1 - smoothstep(0.80, 0.94, wrap));
      const grain = k3dHNoise(x * 142, u * 112, vz * 94);
      const w = 0.82 + overlap * 0.15 + (grain - 0.5) * 0.12 - seam * 0.27;
      r = w; g = w * 0.94; b = w * 0.86;
      dr = 0.015 + seam * 0.095 + (grain - 0.5) * 0.035;
      break;
    }
    case 13: { // 雾透玉柄：青白玉、柔雾和内部丝絮
      const cloudJade = k3dHFbm(x * 2.1, u * 2.1, vz * 2.1);
      const wisp = k3dHFbm(x * 6 + 2.3, u * 6 + 1.7, vz * 6 + 4.1);
      const thread = Math.pow(0.5 + 0.5 * Math.sin((x * 4 + u * 4.5 + cloudJade * 1.6) * TAU), 4);
      const fogBand = smoothstep(0.38, 0.78, cloudJade);
      const w = 0.82 + (cloudJade - 0.5) * 0.38 + (wisp - 0.5) * 0.18 + thread * 0.13;
      r = mix(w * 0.62, w * 0.84, fogBand);
      g = mix(w * 0.90, w * 1.05, fogBand);
      b = mix(w * 0.84, w * 0.96, fogBand);
      dr = -0.025 + (cloudJade - 0.5) * 0.055;
      break;
    }
    case 14: { // 模块军绿：分体护片、深缝、精密紧固点
      const seamX = 1 - smoothstep(0.012, 0.043, Math.abs(fract(x * 6) - 0.5));
      const seamU = 1 - smoothstep(0.012, 0.038, Math.abs(fract((u + vz * 0.22) * 3) - 0.5));
      const seam = Math.max(seamX, seamU * 0.55);
      const sx = fract(x * 6 + 0.5) - 0.5, sy = fract(u * 3 + 0.5) - 0.5;
      const screw = 1 - smoothstep(0.035, 0.07, Math.sqrt(sx * sx + sy * sy));
      const w = 0.80 + (cloud() - 0.5) * 0.06 - seam * 0.35 + screw * 0.12;
      r = w * 0.78; g = w * 0.90; b = w * 0.70;
      dr = 0.025 + seam * 0.07 - screw * 0.025;
      break;
    }
    case 15: { // 冷镜钢柄：浅蓝镜面钢，只有细到近乎发丝的车纹
      const line = 0.5 + 0.5 * Math.sin((u * 290 + vz * 37 + x * 8) * TAU);
      const soft = k3dHFbm(x * 1.7, u * 10, vz * 8);
      const w = 0.985 + (line - 0.5) * 0.045 + (soft - 0.5) * 0.018;
      r = w * 0.94; g = w * 0.98; b = w * 1.05;
      dr = -0.085 + (1 - line) * 0.02;
      break;
    }
    case 16: { // 深织亮碳：深海蓝高光碳纤，密集 2x2 斜纹
      const zx = x * 56 + u * 3, zy = u * 47 + vz * 24;
      const fx = fract(zx), fy = fract(zy);
      const over = mod(Math.floor(zx) + Math.floor(zy), 2);
      const thread = mix(
        0.5 + 0.5 * Math.sin((fx * 0.88 + fy * 0.12) * TAU),
        0.5 + 0.5 * Math.sin((fy * 0.88 + fx * 0.12) * TAU),
        over,
      );
      const selvedge = smoothstep(0.02, 0.18, Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)));
      const glint = Math.pow(thread, 3) * selvedge;
      const w = 0.47 + glint * 0.74 + selvedge * 0.08;
      r = w * 0.72; g = w * 0.86; b = w * 1.18;
      dr = -0.075 * glint + (1 - selvedge) * 0.055;
      break;
    }
    case 17: { // 断光玉芯：深青玉底、断裂冰脉与玉石芯线
      k3dHVoro(x * 8.5 + cloud() * 0.5, u * 10 + vz * 2.5, VORO);
      const fracture = 1 - smoothstep(0.012, 0.052, VORO[1]);
      const mist = k3dHFbm(x * 3.1, u * 3.1, vz * 3.1);
      const core = smoothstep(0.58, 0.92, k3dHFbm(x * 1.8 + 4, u * 1.8 + 1, vz * 1.8 + 2));
      const w = 0.57 + mist * 0.17 + fracture * 0.47 + core * 0.10;
      r = w * 0.63;
      g = w * (0.94 + fracture * 0.13);
      b = w * (0.88 + fracture * 0.12);
      dr = -0.035 + fracture * 0.105;
      break;
    }
    case 18: { // 白昼镜瓷：暖白珍珠釉、极细开片与柔和珠光
      k3dHVoro(x * 19 + vz * 1.2, u * 22 + vz * 5, VORO);
      const crack = 1 - smoothstep(0.010, 0.030, VORO[1]);
      const pearl = 0.5 + 0.5 * Math.sin((x * 1.8 + u * 0.45 + k3dHFbm(x * 2, u * 2, vz * 2) * 0.18) * TAU);
      const k = 1 - crack * 0.20;
      r = (0.98 + pearl * 0.035) * k;
      g = (0.96 + pearl * 0.025) * k;
      b = (0.91 + (1 - pearl) * 0.065) * k;
      dr = -0.075 + crack * 0.10;
      break;
    }
    case 19: { // 偏振幻彩：钛合金虹彩膜，冷蓝—紫—玫瑰—青
      const phase = x * 2.6 + u * 0.62 + vz * 0.16 + (k3dHFbm(x * 2.2, u * 2.2, vz * 2.2) - 0.5) * 0.32;
      const sr = 0.93 + 0.27 * Math.cos(TAU * (phase + 0.00));
      const sg = 0.93 + 0.27 * Math.cos(TAU * (phase + 0.33));
      const sb = 0.93 + 0.27 * Math.cos(TAU * (phase + 0.67));
      const brushed = 0.5 + 0.5 * Math.sin((u * 75 + phase * 2) * TAU);
      const k = 0.97 + brushed * 0.045;
      r = mix(0.83, sr, 0.72) * k;
      g = mix(0.91, sg, 0.72) * k;
      b = mix(1.04, sb, 0.72) * k;
      dr = -0.06 + (1 - brushed) * 0.025;
      break;
    }
    case 20: { // 共鸣神玉：翡翠绿玉、鲜明的脉络与内芯高光
      k3dHVoro(x * 7 + cloud() * 0.45, u * 8.5 + vz * 2, VORO);
      const vein = 1 - smoothstep(0.012, 0.050, VORO[1]);
      const cloudGreen = k3dHFbm(x * 2.4, u * 2.4, vz * 2.4);
      const core = smoothstep(0.48, 0.91, k3dHFbm(x * 1.25 + 2, u * 1.25 + 5, vz * 1.25 + 1));
      const w = 0.56 + cloudGreen * 0.30 + vein * 0.70 + core * 0.15;
      r = w * (0.48 + vein * 0.08);
      g = w * (0.90 + vein * 0.20);
      b = w * (0.72 + vein * 0.20);
      dr = -0.045 + vein * 0.12;
      break;
    }
    case 21: { // 星屑玄铁：陨铁深灰、锻打坑点与稀疏冷金星屑
      k3dHVoro(x * 21 + vz * 1.4, u * 24 + vz * 7, VORO);
      const pit = 1 - smoothstep(0.035, 0.17, VORO[0]);
      const speck = smoothstep(
        0.89, 0.985,
        k3dHHash(Math.floor(x * 21), Math.floor(u * 27), Math.floor(vz * 24)),
      );
      const burn = k3dHFbm(x * 5.5, u * 5.5, vz * 5.5);
      const w = 0.60 + (burn - 0.5) * 0.25 - pit * 0.24;
      r = mix(w * 0.82, 1.42, speck * 0.92);
      g = mix(w * 0.89, 1.18, speck * 0.92);
      b = mix(w * 0.98, 0.78, speck * 0.92);
      dr = 0.035 + pit * 0.12 - speck * 0.15;
      break;
    }
    case 22: { // 冷星釉瓷：午夜蓝釉，稀疏冷星点与环形釉光
      const starN = k3dHHash(Math.floor(x * 18), Math.floor(u * 24), Math.floor(vz * 21));
      const star = smoothstep(0.94, 0.992, starN);
      const haloN = k3dHNoise(x * 24, u * 31, vz * 28);
      const halo = smoothstep(0.86, 0.97, haloN) * 0.16;
      const glaze = k3dHFbm(x * 2, u * 2, vz * 2);
      const w = 0.68 + (glaze - 0.5) * 0.22 + halo;
      r = mix(w * 0.72, 1.35, star);
      g = mix(w * 0.88, 1.48, star);
      b = mix(w * 1.15, 1.72, star);
      dr = -0.065 + star * 0.11;
      break;
    }
    case 23: { // 天工构壳：珠母外壳、六边分片、虹彩边缘与精细嵌线
      k3dHVoro(x * 8 + vz * 0.8, u * 9 + vz * 4, VORO);
      const rim = 1 - smoothstep(0.018, 0.075, VORO[1]);
      const face = smoothstep(0.055, 0.20, VORO[1]);
      const phase = x * 1.7 + u * 0.8 + k3dHFbm(x * 2.4, u * 2.4, vz * 2.4) * 0.23;
      const nr = 0.96 + 0.18 * Math.cos(TAU * (phase + 0.00));
      const ng = 0.96 + 0.18 * Math.cos(TAU * (phase + 0.31));
      const nb = 0.96 + 0.18 * Math.cos(TAU * (phase + 0.64));
      const pin = smoothstep(0.96, 0.995, k3dHNoise(x * 26, u * 34, vz * 31));
      const k = 0.88 + face * 0.17;
      let rr = mix(0.55, nr * k, 0.78);
      let gg = mix(0.65, ng * k, 0.78);
      let bb2 = mix(0.78, nb * k, 0.78);
      rr = mix(rr, 1.22, rim * 0.38);
      gg = mix(gg, 0.86, rim * 0.38);
      bb2 = mix(bb2, 0.58, rim * 0.38);
      r = rr + 0.18 * pin;
      g = gg + 0.26 * pin;
      b = bb2 + 0.35 * pin;
      dr = -0.055 + rim * 0.09 - face * 0.015;
      break;
    }
    default:
      break;
  }

  return [
    clampN(r, 0.28, 1.55),
    clampN(g, 0.28, 1.55),
    clampN(b, 0.28, 1.55),
    clampN(dr, -0.16, 0.16),
  ];
}

/** 8 位量化：GL 写 unorm8 是 round-to-nearest，这里保持一致 */
const q8 = (v) => {
  const x = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(x * 255);
};

/**
 * 烘一格到 RGBA8 缓冲区（行 0 = local.y 0，与 DataTexture 的上传顺序一致）。
 * @param {number} kind
 * @param {number} size 边长（默认 256，与既有图集一致）
 * @param {Uint8Array} [out] 可选目标缓冲（长度必须 ≥ size*size*4）
 */
export function bakeTileRGBA(kind, size, out) {
  const dst = out || new Uint8Array(size * size * 4);
  const inv = 1 / size;
  let o = 0;
  for (let j = 0; j < size; j++) {
    const ly = (j + 0.5) * inv;
    for (let i = 0; i < size; i++) {
      const lx = (i + 0.5) * inv;
      const c = handleLookCPU(kind, lx, ly, 0.5);
      dst[o++] = q8(c[0]);
      dst[o++] = q8(c[1]);
      dst[o++] = q8(c[2]);
      /* ★ bug-compatible：烘焙着色器写的是 clamp(look.a, 0.0, 1.0)，
         而 dr 的范围是 [-0.16, 0.16] —— 于是**所有负粗糙度偏移在图集里都被压成 0**。
         这在现网已经生效（图集一直开着），所以镜面钢 / 玉 / 幻彩那几类柄的
         "低于基线的粗糙度"从来没真正传到材质里。移植时**必须保留**这个行为，
         否则 S8 的冷镜钢(S8_16) 等会整体变亮 —— 那是另一件事，得单独量、单独判。 */
      dst[o++] = q8(c[3] < 0 ? 0 : c[3]);
    }
  }
  return dst;
}

export const HANDLE_LOOK_JS_VERSION = 'cpu1';
