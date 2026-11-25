// 홈 맨 아래 레이어: 점묘 느낌의 배경 별 + 별똥별 (canvas 하나)
// - 배경 별: 처음부터 계속 보임. 1~2px 점(일부 3px), 흰색 20~50%(아주 일부만 더 밝게). 반짝임·빛 번짐 없음.
// - 별똥별: 손이 맞닿은 뒤(반짝이가 켜진 뒤)부터. 한 번에 하나, 3~5초에 한 번, 하늘 중간에서 갑자기
//   나타나 260~440px를 0.8~1.25초 동안 날아가다 중간에 사라진다 (꼬리 160~260px). 대체로 오른쪽 위 → 왼쪽 아래.
// - 탭이 안 보이면 멈춤. 움직임 줄이기 설정이면 별똥별 끔 (배경 별은 그대로).

interface Star {
  x: number;
  y: number;
  r: number; // 반지름(px)
  a: number; // 불투명도
}

interface Dot {
  t: number; // 머리에서 꼬리 끝까지 0~1
  off: number; // 꼬리 방향에 수직인 흩어짐(px)
  r: number;
  a: number;
}

interface Meteor {
  x0: number;
  y0: number;
  ux: number; // 진행 방향 단위벡터
  uy: number;
  dist: number;
  dur: number;
  tail: number;
  start: number;
  dots: Dot[];
}

const STAR_AREA = 2300; // 별 하나당 화면 넓이(px²). 작을수록 촘촘
const INTERVAL_MIN = 3000;
const INTERVAL_MAX = 5000;

/** 화면 크기가 같으면 같은 별 배치가 나오도록 고정 씨앗 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function initSky() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-sky]');
  const sparkle = document.querySelector<HTMLElement>('[data-sparkle]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const starLayer = document.createElement('canvas'); // 별은 한 번만 그려 두고 복사해 쓴다
  let w = 0;
  let h = 0;
  let dpr = 1;
  let meteor: Meteor | null = null;
  let raf = 0;
  let timer = 0;
  let active = false; // 손이 맞닿은 상태인지

  // ── 배경 별 ──
  const buildStars = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = starLayer.width = Math.round(w * dpr);
    canvas.height = starLayer.height = Math.round(h * dpr);

    const r = seeded(w * 7919 + h);
    const count = Math.round((w * h) / STAR_AREA);
    const stars: Star[] = [];
    for (let i = 0; i < count; i++) {
      const k = r();
      // 크기: 대부분 1~1.5px, 일부 2px, 아주 일부 3px (지름)
      const size = k < 0.03 ? 3 : k < 0.2 ? 2 : 1 + r() * 0.5;
      const bright = r() < 0.05;
      stars.push({
        x: r() * w,
        y: r() * h,
        r: size / 2,
        a: bright ? 0.6 + r() * 0.25 : 0.2 + r() * 0.3,
      });
    }

    const s = starLayer.getContext('2d')!;
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.clearRect(0, 0, w, h);
    for (const st of stars) {
      s.fillStyle = `rgba(255,255,255,${st.a.toFixed(3)})`;
      s.beginPath();
      s.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      s.fill();
    }
  };

  const drawBase = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(starLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // ── 별똥별 ──
  const makeMeteor = (now: number): Meteor => {
    // 오른쪽 위 → 왼쪽 아래, 수평 아래로 25~50°
    const ang = (rand(25, 50) * Math.PI) / 180;
    const ux = -Math.cos(ang);
    const uy = Math.sin(ang);
    // 좁은 화면(휴대폰)에서는 비율만큼 줄여 화면 안에서 끝나게
    const k = Math.min(1, Math.max(0.55, w / 1200));
    const dist = rand(260, 440) * k;
    // 시작점: 하늘 중간 어딘가. 끝점까지 화면 안에 들어오게
    const x0 = rand(Math.max(w * 0.2, dist * Math.cos(ang) + 20), w * 0.95);
    const y0 = rand(h * 0.08, Math.max(h * 0.08 + 1, h * 0.62 - dist * Math.sin(ang)));
    const dots: Dot[] = [];
    for (let i = 0; i < 150; i++) {
      const t = Math.pow(Math.random(), 1.35); // 머리 쪽에 점이 더 많게
      dots.push({
        t,
        off: (Math.random() - 0.5) * (1 + 6 * t),
        r: 0.45 + Math.random() * 0.9 * (1 - t * 0.6),
        a: Math.pow(1 - t, 1.6) * (0.45 + Math.random() * 0.55),
      });
    }
    return { x0, y0, ux, uy, dist, dur: rand(800, 1250), tail: rand(160, 260) * k, start: now, dots };
  };

  const drawMeteor = (m: Meteor, now: number) => {
    const k = Math.min(1, (now - m.start) / m.dur);
    // 갑자기 나타나서(앞 10%) 날다가 중간 이후 흐려지며 사라짐
    const env = k < 0.1 ? k / 0.1 : k > 0.5 ? Math.max(0, (1 - k) / 0.5) : 1;
    const hx = m.x0 + m.ux * m.dist * k;
    const hy = m.y0 + m.uy * m.dist * k;
    const len = Math.min(m.tail, m.dist * k * 1.1); // 꼬리는 날아가면서 길어진다
    const px = -m.uy; // 수직 방향
    const py = m.ux;
    for (const d of m.dots) {
      const x = hx - m.ux * d.t * len + px * d.off;
      const y = hy - m.uy * d.t * len + py * d.off;
      ctx.fillStyle = `rgba(255,255,255,${(d.a * env).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 머리: 밝은 점
    ctx.fillStyle = `rgba(255,255,255,${(0.95 * env).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.4, 0, Math.PI * 2);
    ctx.fill();
    return k >= 1;
  };

  const frame = (now: number) => {
    raf = 0;
    drawBase();
    if (!meteor) return;
    const done = drawMeteor(meteor, now);
    if (done) {
      meteor = null;
      drawBase();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const canRun = () => active && !document.hidden && !reduceMotion.matches;

  const launch = () => {
    timer = 0;
    if (!canRun()) return;
    meteor = makeMeteor(performance.now());
    if (!raf) raf = requestAnimationFrame(frame);
    schedule(rand(INTERVAL_MIN, INTERVAL_MAX));
  };

  function schedule(delay: number) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(launch, delay);
  }

  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    meteor = null;
    drawBase();
  };

  const sync = () => {
    active = !!sparkle?.classList.contains('is-lit');
    if (!canRun()) stop();
    else if (!timer && !raf) schedule(rand(1200, 2200)); // 닿고 나서 첫 별똥별은 조금 일찍
  };

  buildStars();
  drawBase();

  // 반짝이가 켜지고 꺼지는 것(=손이 맞닿음)을 지켜본다
  if (sparkle) new MutationObserver(sync).observe(sparkle, { attributes: true, attributeFilter: ['class'] });
  sync();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else sync();
  });
  reduceMotion.addEventListener?.('change', () => {
    if (reduceMotion.matches) stop();
    else sync();
  });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      buildStars();
      drawBase();
    });
  });

  // 개발 중 확인용 (배포본에는 들어가지 않음)
  if (import.meta.env.DEV) {
    (window as unknown as { __sky: unknown }).__sky = {
      spawn: () => {
        meteor = makeMeteor(performance.now());
        if (!raf) raf = requestAnimationFrame(frame);
      },
      /** 스크린샷용: 비행 진행도 k(0~1) 지점에서 멈춘 별똥별 하나를 그린다 */
      freeze: (k: number) => {
        stop();
        const m = makeMeteor(0);
        drawBase();
        drawMeteor(m, k * m.dur);
      },
    };
  }
}
