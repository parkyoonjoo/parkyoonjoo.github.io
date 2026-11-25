import humanTxt from '../../assets/ascii-human.txt?raw';
import robotTxt from '../../assets/ascii-robot.txt?raw';
import layout from '../../assets/layout.json';

const W = layout.canvas.width; // 1716
const H = layout.canvas.height; // 1097
const CW = layout.grid.cell_w; // 8
const CH = layout.grid.cell_h; // 13

// 내용이 있는 세로 구간 (drawing 윗부분 ~ and 아랫부분). 이 구간은 항상 화면 안에 들어와야 한다.
const BAND_TOP = 0.22;
const BAND_BOTTOM = 0.9;
const TOP_RESERVE = 52; // 고정된 YJ.Park 아래 여백
const BOTTOM_MARGIN = 12;

// 최종 상태: 글자판 그대로면 손끝 간격 약 25px. 각 손을 8px(정확히 한 칸)씩 안쪽으로.
// 처음 계획은 약 12px이었지만, 12px(1.5칸)은 반짝이 주변 글자가 반 칸 어긋나고 화면 끝에 틈이 생겨 8px로 정함 (DECISIONS.md)
// 비교용: 주소 뒤에 ?inset=0 / 8 / 12 / 16 을 붙이면 그 값으로 그린다
function readInset(): number {
  try {
    const raw = new URLSearchParams(location.search).get('inset');
    const v = raw === null ? NaN : Number(raw);
    if (v === 0 || v === 8 || v === 12 || v === 16) return v;
  } catch {
    /* 무시 */
  }
  return 8;
}
export const FINAL_INSET = typeof location === 'undefined' ? 8 : readInset();

// 문자 밀도에 따른 회색 (#999 ~ #e6e6e6)
const RAMP = ' .:-=+*#%@';
// 손 글자 전체 밝기 (Y·D·W·P와 반짝이는 제외). 글자가 더 잘 보이도록 15% 낮춤
const HAND_BRIGHTNESS = 0.85;
function grayFor(ch: string, dim = 1): string {
  const i = Math.max(1, RAMP.indexOf(ch));
  const t = (i - 1) / (RAMP.length - 2);
  const v = Math.min(240, Math.round((0x99 + t * (0xe6 - 0x99)) * dim * HAND_BRIGHTNESS));
  return `rgb(${v},${v},${v})`;
}

// Y·D·W·P 강도 버전. 주변 1칸·2칸 글자의 밝기 배율 (1 = 그대로)
export type GlyphVariant = 'weak' | 'mid' | 'between' | 'strong';
const GLYPH_DIM: Record<GlyphVariant, [number, number]> = {
  weak: [0.82, 1],
  mid: [0.68, 0.86],
  // 바로 옆 1칸만 아주 살짝, 2칸부터는 그대로
  between: [0.84, 1],
  strong: [0.55, 0.76],
};
export const DEFAULT_GLYPH: GlyphVariant = 'between';

function readVariant(): GlyphVariant {
  try {
    const v = new URLSearchParams(location.search).get('glyph');
    if (v === 'weak' || v === 'mid' || v === 'between' || v === 'strong') return v;
  } catch {
    /* 무시 */
  }
  return DEFAULT_GLYPH;
}

type HandName = 'human' | 'robot';

// 로봇 손 마디: 이 칸들의 글자를 옅은 점·짧은 선(. -)으로 바꿔 마디 사이 이음매처럼 보이게 한다.
// 칸을 비우지 않으므로 손 윤곽은 그대로 이어진다. (원본 글자판 파일은 그대로)
// 각 이음매는 [시작 행, 시작 열] → [끝 행, 끝 열] 선분. 긴 쪽 방향으로 한 칸씩 이어 그린다.
// 손가락마다 기울기를 다르게: 왼쪽 아래 손가락은 오른쪽 아래로(\), 오른쪽 아래 손가락은 오른쪽 위로(/).
// 주소 뒤에 ?robot=plain 을 붙이면 마디 없이 그린다.
type Seam = [[number, number], [number, number]];
const ROBOT_JOINTS: Seam[] = [
  // 앞으로 뻗은 검지 (손끝 108열 ~ 손바닥): 손끝 마디, 가운데 마디. 살짝 기울인 세로 이음매
  [[38, 122], [41, 120]],
  [[37, 134], [41, 132]],
  // 왼쪽 아래 손가락 (131~143열): 손바닥 쪽 마디, 가운데 마디 (\ 방향)
  [[49, 131], [51, 143]],
  [[54, 131], [56, 141]],
  // 오른쪽 아래 손가락 (145~152열): 손바닥 쪽 마디, 가운데 마디 (/ 방향)
  [[52, 145], [50, 152]],
  [[56, 145], [54, 151]],
];

/** 선분 위의 칸들 (긴 축 기준으로 한 칸에 하나) */
function seamCells([[r0, c0], [r1, c1]]: Seam): [number, number][] {
  const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push([Math.round(r0 + (r1 - r0) * t), Math.round(c0 + (c1 - c0) * t)]);
  }
  return out;
}

// 이음매 글자의 밝기: '.' 기본 회색의 이 비율 (주변보다 한 단계 옅게)
const JOINT_DIM = 0.78;

/** 마디 칸 → 이음매 글자. 점 사이사이에 짧은 선이 섞인 옅은 줄 */
function robotJointMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    if (new URLSearchParams(location.search).get('robot') === 'plain') return map;
  } catch {
    /* 무시 */
  }
  for (const seam of ROBOT_JOINTS)
    seamCells(seam).forEach(([r, c], i) => map.set(`${r},${c}`, i % 3 === 1 ? '-' : '.'));
  return map;
}

const grids: Record<HandName, string[]> = {
  human: humanTxt.replace(/\r/g, '').split('\n'),
  robot: robotTxt.replace(/\r/g, '').split('\n'),
};

// Y·D·W·P 칸은 캔버스에서 비워 두고 DOM 글자로 그린다
const letterCells: Record<HandName, Set<string>> = { human: new Set(), robot: new Set() };
const letterList: Record<HandName, { row: number; col: number }[]> = { human: [], robot: [] };
for (const [k, v] of Object.entries(layout.letters)) {
  const hand: HandName = k === 'Y' || k === 'D' ? 'human' : 'robot';
  letterCells[hand].add(`${v.row},${v.col}`);
  letterList[hand].push({ row: v.row, col: v.col });
}

/** 가장 가까운 Y·D·W·P까지의 칸 거리 (가로·세로 중 큰 값) */
function letterDistance(hand: HandName, r: number, c: number): number {
  let d = Infinity;
  for (const l of letterList[hand]) d = Math.min(d, Math.max(Math.abs(l.row - r), Math.abs(l.col - c)));
  return d;
}

export interface StageMetrics {
  scale: number;
  dpr: number;
  left: number;
  top: number;
  phone: boolean;
}

// ── 휴대폰 세로 화면 배치 ──
// 무대 전체를 폭에 맞추면 23% 크기로 너무 작아서, 손이 닿는 지점을 중심으로 무대 가로 약 960px만 보이게 확대한다.
// 팔 끝은 양옆에서 잘리고, 단어는 손 위아래로 다시 배치한다 (index.astro의 PHONE_WORDS).
const PHONE_MAX_W = 600;
const PHONE_VISIBLE_W = 960;
const PHONE_CONTENT_TOP = 292; // 무대 좌표: 맨 위 단어(drawing) 윗부분
const PHONE_CONTENT_BOTTOM = 1070; // 무대 좌표: 맨 아래 단어(and) 아랫부분

function computeMetrics(): StageMetrics {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  if (vw <= PHONE_MAX_W && vh > vw) {
    let scale = vw / PHONE_VISIBLE_W;
    const contentH = PHONE_CONTENT_BOTTOM - PHONE_CONTENT_TOP;
    const avail = vh - TOP_RESERVE - BOTTOM_MARGIN;
    if (contentH * scale > avail) scale = avail / contentH;
    const cx = layout.contact_point.x;
    const left = vw / 2 - cx * scale;
    const top = TOP_RESERVE + (avail - contentH * scale) / 2 - PHONE_CONTENT_TOP * scale;
    return { scale, dpr, left: Math.round(left), top: Math.round(top), phone: true };
  }

  let scale = vw / W;
  const avail = vh - TOP_RESERVE - BOTTOM_MARGIN;
  const band = (BAND_BOTTOM - BAND_TOP) * H;
  if (band * scale > avail) scale = avail / band;

  const stageW = W * scale;
  const stageH = H * scale;
  const left = (vw - stageW) / 2;

  let top: number;
  if (stageH <= vh) {
    top = (vh - stageH) / 2;
  } else {
    // 넘치면 위쪽(빈 공간)부터 잘리게 아래에 맞춘다
    top = vh - stageH;
  }
  // 내용 구간이 YJ.Park 아래로 내려오고, 아래로 넘치지 않게 보정
  const minTop = TOP_RESERVE - BAND_TOP * stageH;
  const maxTop = vh - BOTTOM_MARGIN - BAND_BOTTOM * stageH;
  top = Math.min(Math.max(top, minTop), maxTop);

  return { scale, dpr, left: Math.round(left), top: Math.round(top), phone: false };
}

/** 로봇 마디 이음매를 반영한 글자판 (손마다 한 번만 계산) */
const rowsCache: Partial<Record<HandName, { rows: string[]; joints: Map<string, string> }>> = {};
function handRows(hand: HandName) {
  const cached = rowsCache[hand];
  if (cached) return cached;
  let rows = grids[hand];
  const joints = hand === 'robot' ? robotJointMap() : new Map<string, string>();
  if (joints.size)
    rows = rows.map((line, r) =>
      line
        .split('')
        // 원래 글자가 있던 칸만 바꾼다 (빈칸은 그대로 두어 손 윤곽이 변하지 않게)
        .map((ch, c) => (ch !== ' ' && joints.has(`${r},${c}`) ? joints.get(`${r},${c}`)! : ch))
        .join(''),
    );
  return (rowsCache[hand] = { rows, joints });
}

/** 칸 하나의 기본 밝기 배율 (Y·D·W·P 주변 어둡게 + 마디 이음매) */
function cellDim(hand: HandName, r: number, c: number, variant: GlyphVariant, joints: Map<string, string>): number {
  const [dim1, dim2] = GLYPH_DIM[variant];
  const d = letterDistance(hand, r, c);
  return (d === 1 ? dim1 : d === 2 ? dim2 : 1) * (joints.has(`${r},${c}`) ? JOINT_DIM : 1);
}

// ── 손 외곽 일렁임 ──────────────────────────────────────────
// 손이 다가오는 동안 외곽 칸들이 밝아졌다 옅어졌다 하고, 윤곽 바로 바깥 칸이 가끔 켜졌다 꺼져
// 구부린 손가락이 움직이는 것처럼 보이게 한다. 색은 쓰지 않는다 (회색~흰색만).
interface EdgeCell {
  r: number;
  c: number;
  ch: string;
  dim: number;
  halo: boolean; // 윤곽 바로 바깥의 빈칸
}
const edgeCache: Partial<Record<HandName, EdgeCell[]>> = {};
function handEdges(hand: HandName, variant: GlyphVariant): EdgeCell[] {
  const cached = edgeCache[hand];
  if (cached) return cached;
  const { rows, joints } = handRows(hand);
  const skip = letterCells[hand];
  const at = (r: number, c: number) => (r < 0 || r >= rows.length ? ' ' : (rows[r][c] ?? ' '));
  const near = (r: number, c: number) => [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)];
  const out: EdgeCell[] = [];
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (skip.has(`${r},${c}`)) continue;
      if (ch !== ' ') {
        if (near(r, c).includes(' ')) out.push({ r, c, ch, dim: cellDim(hand, r, c, variant, joints), halo: false });
      } else if (near(r, c).some((n) => n !== ' ')) {
        out.push({ r, c, ch: '.', dim: 0.8, halo: true });
      }
    }
  return (edgeCache[hand] = out);
}
const edgeKeys: Partial<Record<HandName, Set<string>>> = {};
function edgeKeySet(hand: HandName, variant: GlyphVariant): Set<string> {
  return (edgeKeys[hand] ??= new Set(handEdges(hand, variant).filter((e) => !e.halo).map((e) => `${e.r},${e.c}`)));
}

function sizeCanvas(canvas: HTMLCanvasElement, m: StageMetrics) {
  const k = m.scale * m.dpr;
  canvas.width = Math.round(W * k);
  canvas.height = Math.round(H * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.font = '400 12px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  return ctx;
}

/** 손 안쪽 글자 (외곽 칸은 일렁임 캔버스가 그린다) */
function drawHand(canvas: HTMLCanvasElement, hand: HandName, m: StageMetrics, variant: GlyphVariant) {
  const ctx = sizeCanvas(canvas, m);
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const { rows, joints } = handRows(hand);
  const skip = letterCells[hand];
  const edges = edgeKeySet(hand, variant);

  // 글자가 있는 칸에 검은 배경 (가로로 이어진 칸은 한 덩어리로 칠해 이음새를 없앤다)
  ctx.fillStyle = '#000';
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    let c = 0;
    while (c < line.length) {
      if (line[c] === ' ') {
        c++;
        continue;
      }
      const start = c;
      while (c < line.length && line[c] !== ' ') c++;
      ctx.fillRect(start * CW - 0.25, r * CH - 0.25, (c - start) * CW + 0.5, CH + 0.5);
    }
  }

  let current = '';
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const key = `${r},${c}`;
      if (ch === ' ' || skip.has(key) || edges.has(key)) continue;
      const color = grayFor(ch, cellDim(hand, r, c, variant, joints));
      if (color !== current) {
        ctx.fillStyle = color;
        current = color;
      }
      ctx.fillText(ch, c * CW + CW / 2, r * CH + CH / 2 + 0.5);
    }
  }
}

const SHIMMER_CHARS = '.:-=+*#%@';
/**
 * 외곽 칸 그리기. live=false 면 원래 모습 그대로(정지), true 면 시간 t(초)에 따라 일렁인다.
 * 위치에 따라 위상이 다른 물결 + 칸마다 약간의 무작위 → 손가락 윤곽이 꿈틀거리는 느낌
 */
function drawShimmer(ctx: CanvasRenderingContext2D, hand: HandName, variant: GlyphVariant, live: boolean, t: number) {
  ctx.clearRect(0, 0, W, H);
  const cells = handEdges(hand, variant);
  for (const e of cells) {
    let ch = e.ch;
    let f = e.dim;
    if (!live) {
      if (e.halo) continue;
    } else {
      const wave = Math.sin(t * 5.2 + e.r * 0.85 + e.c * 0.33 + (hand === 'robot' ? 1.7 : 0)); // -1~1
      const rnd = Math.random();
      if (e.halo) {
        // 윤곽 바깥: 물결이 높을 때만 가끔 옅게 켜진다 → 손가락 윤곽이 꿈틀거리는 느낌
        if (wave < 0.4 || rnd > 0.3) continue;
        ch = rnd < 0.12 ? ':' : '.';
        f = 0.75;
      } else {
        if (rnd < 0.07) continue; // 아주 가끔 꺼짐
        if (rnd > 0.94) {
          // 가끔 한 칸이 거의 흰색으로 반짝 (색은 쓰지 않음)
          ch = '#%@'[Math.floor(Math.random() * 3)];
          f = 1.6;
        } else {
          f = e.dim * (0.48 + 0.46 * (wave + 1) + (Math.random() - 0.5) * 0.22); // 약 0.37~1.5배
          if (Math.random() < 0.16) {
            const i = SHIMMER_CHARS.indexOf(ch);
            const j = Math.min(
              SHIMMER_CHARS.length - 1,
              Math.max(0, i + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))),
            );
            ch = SHIMMER_CHARS[j];
          }
        }
      }
    }
    if (e.halo) {
      ctx.fillStyle = '#000';
      ctx.fillRect(e.c * CW - 0.25, e.r * CH - 0.25, CW + 0.5, CH + 0.5);
    }
    ctx.fillStyle = grayFor(ch, Math.min(f, 1.7));
    ctx.fillText(ch, e.c * CW + CW / 2, e.r * CH + CH / 2 + 0.5);
  }
}

/** 손 이동량을 화면 픽셀 정수로 반올림해 글자가 격자에 또렷이 맞게 한다 */
function snap(v: number, m: StageMetrics): number {
  const k = m.scale * m.dpr;
  return Math.round(v * k) / k;
}

// ── 스크롤 장면 ─────────────────────────────
// 시작 위치: 최종 위치 기준 사람 손 (-25% 너비, +20% 높이), 로봇 손 (+20% 너비, -15% 높이)
const START = {
  human: { x: -0.25 * W, y: 0.2 * H },
  robot: { x: 0.2 * W, y: -0.15 * H },
};
// 손은 진행도 0~85%에서 이동을 끝내고, 마지막 구간에서 빛이 퍼진다
const TOUCH_AT = 0.85;
// 단어 5개가 나타나는 진행도 (drawing → people → and → machines → closer). closer = 손끝이 닿는 순간
const WORD_AT = [0.12, 0.3, 0.48, 0.66, TOUCH_AT];

// 멀리 있을 때는 성큼성큼, 닿기 직전에는 천천히 (ease-out).
// 세제곱 곡선은 60%에서 이미 97%를 가 버려 마지막 구간이 멈춘 듯 보여서 제곱 곡선을 쓴다
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function readFinalMode(): boolean {
  try {
    if (new URLSearchParams(location.search).get('state') === 'final') return true;
  } catch {
    /* 무시 */
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function initStage() {
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const home = document.querySelector<HTMLElement>('[data-home]');
  if (!stage || !home) return;
  const hands = {
    human: stage.querySelector<HTMLElement>('[data-hand="human"]')!,
    robot: stage.querySelector<HTMLElement>('[data-hand="robot"]')!,
  };
  const canvases = {
    human: stage.querySelector<HTMLCanvasElement>('[data-hand-canvas="human"]')!,
    robot: stage.querySelector<HTMLCanvasElement>('[data-hand-canvas="robot"]')!,
  };
  const shimmerCanvases = {
    human: stage.querySelector<HTMLCanvasElement>('[data-shimmer-canvas="human"]')!,
    robot: stage.querySelector<HTMLCanvasElement>('[data-shimmer-canvas="robot"]')!,
  };
  const shimmerCtx: Partial<Record<HandName, CanvasRenderingContext2D | null>> = {};
  const words = [...stage.querySelectorAll<HTMLElement>('[data-word]')].sort(
    (a, b) => Number(a.dataset.word) - Number(b.dataset.word),
  );
  const sparkle = stage.querySelector<HTMLElement>('[data-sparkle]')!;

  let metrics = computeMetrics();
  const variant = readVariant();
  stage.dataset.glyph = variant;

  const finalMode = readFinalMode();
  if (finalMode) home.classList.add('is-final');

  /** 스크롤 진행도 0~1 */
  const progress = (): number => {
    if (finalMode) return 1;
    const scrollable = home.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 1;
    return clamp01((window.scrollY - home.offsetTop) / scrollable);
  };

  let lastP = -1;
  const render = (force = false) => {
    const p = progress();
    if (!force && p === lastP) return;
    lastP = p;

    // 손: 회전·크기 변화 없이 위치만, 두 손이 같은 진행도로 동시에
    const t = easeOut(clamp01(p / TOUCH_AT));
    // 휴대폰은 보이는 폭이 좁으므로 시작 거리도 그 비율만큼 줄여, 처음부터 두 손이 대각선 모서리에 보이게
    const k = (1 - t) * (metrics.phone ? PHONE_VISIBLE_W / W : 1); // 남은 거리 비율
    const hx = snap(FINAL_INSET + START.human.x * k, metrics);
    const hy = snap(START.human.y * k, metrics);
    const rx = snap(-FINAL_INSET + START.robot.x * k, metrics);
    const ry = snap(START.robot.y * k, metrics);
    hands.human.style.transform = `translate3d(${hx}px,${hy}px,0)`;
    hands.robot.style.transform = `translate3d(${rx}px,${ry}px,0)`;

    // 단어: 순서대로 하나씩 (위로 스크롤하면 거꾸로 사라짐)
    words.forEach((w, i) => w.classList.toggle('is-on', p >= WORD_AT[i]));

    // 반짝이: closer와 같은 순간에 켜진다
    sparkle.classList.toggle('is-lit', p >= TOUCH_AT);

    // 손 외곽 일렁임: 다가오는 동안만. 닿으면 원래 모습으로 멈춘다
    if (p < TOUCH_AT) startShimmer();
    else stopShimmer();
  };

  // ── 일렁임 루프 (초당 약 12번, 화면이 보일 때만) ──
  let shimmerRaf = 0;
  let lastTick = 0;
  const shimmerFrame = (now: number) => {
    shimmerRaf = requestAnimationFrame(shimmerFrame);
    if (now - lastTick < 80) return;
    lastTick = now;
    for (const hand of ['human', 'robot'] as const) {
      const ctx = shimmerCtx[hand];
      if (ctx) drawShimmer(ctx, hand, variant, true, now / 1000);
    }
  };
  function startShimmer() {
    if (shimmerRaf || finalMode || document.hidden) return;
    shimmerRaf = requestAnimationFrame(shimmerFrame);
  }
  function stopShimmer() {
    if (shimmerRaf) cancelAnimationFrame(shimmerRaf);
    shimmerRaf = 0;
    for (const hand of ['human', 'robot'] as const) {
      const ctx = shimmerCtx[hand];
      if (ctx) drawShimmer(ctx, hand, variant, false, 0);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (shimmerRaf) cancelAnimationFrame(shimmerRaf);
      shimmerRaf = 0;
    } else render(true);
  });

  const layoutStage = () => {
    metrics = computeMetrics();
    stage.style.transform = `translate3d(${metrics.left}px,${metrics.top}px,0) scale(${metrics.scale})`;
    stage.style.setProperty('--inv-s', String(1 / metrics.scale));
    stage.dataset.layout = metrics.phone ? 'phone' : 'wide';
    drawHand(canvases.human, 'human', metrics, variant);
    drawHand(canvases.robot, 'robot', metrics, variant);
    for (const hand of ['human', 'robot'] as const) {
      shimmerCtx[hand] = sizeCanvas(shimmerCanvases[hand], metrics);
      const ctx = shimmerCtx[hand];
      if (ctx) drawShimmer(ctx, hand, variant, false, 0);
    }
    render(true);
    stage.classList.add('is-ready');
  };

  const start = () => {
    // 첫 화면은 전환 효과 없이 현재 스크롤 위치의 상태로 바로 그린다
    stage.classList.add('no-anim');
    layoutStage();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!finalMode) stage.classList.remove('no-anim');
      }),
    );

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(layoutStage);
    });

    if (!finalMode) {
      let scrollRaf = 0;
      window.addEventListener(
        'scroll',
        () => {
          if (scrollRaf) return;
          scrollRaf = requestAnimationFrame(() => {
            scrollRaf = 0;
            render();
          });
        },
        { passive: true },
      );
    }
  };

  // 캔버스에 그리기 전에 웹폰트를 불러온다 (늦어지면 1.5초 뒤 그냥 그린다)
  const fontReady = document.fonts
    ? Promise.race([
        Promise.all([
          document.fonts.load('400 12px "JetBrains Mono"'),
          document.fonts.load('700 14px "JetBrains Mono"'),
        ]),
        new Promise((r) => setTimeout(r, 1500)),
      ]).catch(() => undefined)
    : Promise.resolve();
  fontReady.then(start);
}
