// 홈 화면 박스
// - 반짝이에 커서 → 비전 박스. 반짝이와 박스 사이를 오가는 동안 닫히지 않게 짧게 기다린다.
// - Y·D·W·P에 커서 → 미리보기 박스. 섹션 이름이 글자당 40ms로 타이핑되고 끝에 | 커서가 깜빡인다.
// - 키보드: Tab으로 포커스하면 같은 박스, Enter로 이동, Esc로 닫기.
// - 터치(hover 없음): 한 번 탭 = 박스, 같은 글자 한 번 더 = 이동, 바깥 탭 = 닫기.

const TYPE_MS = 40;
const TOP_SAFE = 56; // 고정된 YJ.Park 아래
const EDGE = 16;

export function initBoxes() {
  const viewport = document.querySelector<HTMLElement>('.viewport');
  const anchor = document.querySelector<HTMLElement>('[data-vision-trigger]');
  const visionBox = document.querySelector<HTMLElement>('[data-vision-box]');
  const sparkle = document.querySelector<HTMLElement>('[data-sparkle]');
  if (!viewport || !anchor || !visionBox || !sparkle) return;

  const previewBoxes = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-preview-box]').forEach((b) => previewBoxes.set(b.dataset.previewBox!, b));
  const triggers = [...document.querySelectorAll<HTMLAnchorElement>('[data-preview-trigger]')];

  const canHover = window.matchMedia('(hover: hover)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let openBox: HTMLElement | null = null;
  let openKey: string | null = null; // 'vision' 또는 Y·D·W·P
  let closeTimer = 0;
  let typeTimer = 0;
  // 터치는 탭 한 번에 '포커스 → 클릭'이 연달아 온다. 포커스가 먼저 박스를 열어 버리므로
  // 손가락이 닿은 순간(pointerdown)에 무엇이 열려 있었는지를 기준으로 첫 탭/두 번째 탭을 판단한다
  let openAtPress: string | null = null;
  document.addEventListener('pointerdown', () => (openAtPress = openKey), true);
  const wasOpenBeforeTap = (e: MouseEvent, key: string) => (e.detail > 0 ? openAtPress : openKey) === key;

  /** 박스를 반짝이 위치(화면 가운데 근처)에 두되, 화면 밖이나 YJ.Park 위로 넘치지 않게 */
  const place = (box: HTMLElement) => {
    const vr = viewport.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    const x = clamp(ar.left + ar.width / 2 - vr.left, EDGE + bw / 2, vr.width - EDGE - bw / 2);
    const y = clamp(ar.top + ar.height / 2 - vr.top, TOP_SAFE + bh / 2, vr.height - EDGE - bh / 2);
    box.style.setProperty('--box-x', `${Math.round(x)}px`);
    box.style.setProperty('--box-y', `${Math.round(y)}px`);
  };

  const stopTyping = () => {
    if (typeTimer) window.clearInterval(typeTimer);
    typeTimer = 0;
  };

  const startTyping = (box: HTMLElement) => {
    stopTyping();
    const target = box.querySelector<HTMLElement>('[data-typed]');
    if (!target) return;
    const full = target.dataset.full ?? '';
    if (reduceMotion.matches) {
      target.textContent = full;
      return;
    }
    let i = 0;
    target.textContent = '';
    typeTimer = window.setInterval(() => {
      i++;
      target.textContent = full.slice(0, i);
      if (i >= full.length) stopTyping();
    }, TYPE_MS);
  };

  const cancelClose = () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = 0;
  };

  const hide = (box: HTMLElement) => {
    box.classList.remove('is-open');
    if (box === visionBox) anchor.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!box.classList.contains('is-open')) box.hidden = true;
    }, 140);
    if (openBox === box) {
      openBox = null;
      openKey = null;
      stopTyping();
    }
  };

  const show = (box: HTMLElement, key: string) => {
    cancelClose();
    if (openBox === box) return;
    if (openBox) hide(openBox);
    box.hidden = false;
    place(box);
    // 다음 프레임까지 다른 박스로 바뀌었으면 열지 않는다 (빠른 Tab 연타)
    requestAnimationFrame(() => {
      if (openBox === box) box.classList.add('is-open');
    });
    openBox = box;
    openKey = key;
    if (box === visionBox) anchor.setAttribute('aria-expanded', 'true');
    else startTyping(box);
  };

  const scheduleClose = (delay = 150) => {
    cancelClose();
    closeTimer = window.setTimeout(() => {
      if (openBox) hide(openBox);
    }, delay);
  };

  // ── 반짝이 → 비전 박스 ──
  const showVision = () => {
    if (sparkle.classList.contains('is-lit')) show(visionBox, 'vision');
  };
  anchor.addEventListener('mouseenter', () => canHover.matches && showVision());
  anchor.addEventListener('mouseleave', () => canHover.matches && scheduleClose(180));
  visionBox.addEventListener('mouseenter', () => canHover.matches && openKey === 'vision' && cancelClose());
  visionBox.addEventListener('mouseleave', () => canHover.matches && scheduleClose(150));
  anchor.addEventListener('focus', showVision);
  anchor.addEventListener('blur', () => scheduleClose(0));
  anchor.addEventListener('click', (e) => {
    if (canHover.matches) return;
    if (wasOpenBeforeTap(e, 'vision')) hide(visionBox);
    else showVision();
  });

  // ── Y·D·W·P → 미리보기 박스 ──
  for (const t of triggers) {
    const key = t.dataset.previewTrigger!;
    const box = previewBoxes.get(key);
    if (!box) continue;
    t.addEventListener('mouseenter', () => canHover.matches && show(box, key));
    t.addEventListener('mouseleave', () => canHover.matches && scheduleClose(120));
    t.addEventListener('focus', () => show(box, key));
    t.addEventListener('blur', () => scheduleClose(0));
    t.addEventListener('click', (e) => {
      if (canHover.matches) return; // 마우스: 바로 이동
      if (!wasOpenBeforeTap(e, key)) {
        // 터치 첫 탭: 미리보기만
        e.preventDefault();
        show(box, key);
      }
    });
  }

  // 터치: 박스와 글자 바깥을 탭하면 닫기
  document.addEventListener('pointerdown', (e) => {
    if (!openBox || canHover.matches) return;
    const el = e.target as Element;
    if (el.closest('[data-preview-trigger], [data-vision-trigger], .box')) return;
    hide(openBox);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openBox) hide(openBox);
  });

  // 위로 스크롤해 빛이 꺼지면 비전 박스도 닫는다. 열린 박스는 위치를 다시 맞춘다
  const onMove = () => {
    if (!openBox) return;
    if (openKey === 'vision' && !sparkle.classList.contains('is-lit')) hide(visionBox);
    else place(openBox);
  };
  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);
}
