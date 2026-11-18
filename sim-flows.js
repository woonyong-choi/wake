/*
 * 시뮬레이션의 샌키 도우미: 요약 바 + 펼침 흐름(C.summaryBar + C.flowGraph relation)에 넣을 정의를 만든다.
 * 샌키는 띠의 폭이 양에 비례하고 한 그림의 모든 흐름이 같은 단위일 때만 맞는 그림이다:
 * 한 그림 = 한 단위(m, Pod 개수, 대상 개수), 들어온 양 = 나간 양(끝 노드 제외).
 */

/** 흐름이 도착할 때 노드 아이콘과 띠 끝이 칠해지는 색: 문제·진행 상태는 상태색, 정상은 노드의 팔레트 색(tone), 쉬는 노드(idle)는 칠하지 않는다 */
const HUE = { warn: '--warning', fail: '--destructive', busy: '--brand' };
export const colourOf = (state, tone) => HUE[state] ? { hue: HUE[state] } : state === 'idle' || !tone ? {} : { tone };

/** 열마다 값에 비례한 타일을 쌓고(높이에 대한 비율), 띠는 적은 순서대로 출발·도착 타일 안에서 자리를 잡는다. 값이 0인 노드와 띠는 크기 0으로 남아 다시 나타날 때 자란다.
 *  wash는 값이 바뀔 때마다 바뀌는 표지: 바뀔 때마다 흐름이 띠를 따라 한 번 칠하고 지나간다(고정 데이터는 처음 한 번) */
export function sankey({ id, label, nodes, links, aspect = .42, gap = .11, fit = .8, visual, wash = 0 }) {
  const cols = [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b), shown = n => n.value > 0;
  const k = Math.min(...cols.map(c => { const list = nodes.filter(n => n.col === c && shown(n)), sum = list.reduce((t, n) => t + n.value, 0); return sum > 0 ? (fit - gap * (list.length - 1)) / sum : Infinity; }));
  const place = {};
  for (const c of cols) {
    const list = nodes.filter(n => n.col === c), vis = list.filter(shown), height = vis.reduce((t, n) => t + n.value * k, 0) + gap * Math.max(0, vis.length - 1);
    let y = (fit + .04 - height) / 2 + .02;
    for (const n of list) { place[n.id] = { y, h: shown(n) ? n.value * k : 0, out: 0, in: 0 }; if (shown(n)) y += n.value * k + gap; }
    if (c !== cols[0]) align(vis, links, place, gap, .02, fit + .06);
  }
  const X = [0, 380, 804];
  return {
    mode: 'relation', visual, norm: true, aspect, stack: true, stretch: true, fade: true, wash: String(wash), label, gid: 'flg-' + id, width: 920, /* room right of the last tile for its name */ height: 0, columns: cols.map((_, i) => X[i]), bar: 56,
    nodes: nodes.map(n => ({ id: n.id, col: cols.indexOf(n.col), y: place[n.id].y, h: place[n.id].h, label: n.label, ...(n.short ? { short: n.short } : {}), ...(n.sub ? { sub: n.sub } : {}), ariaLabel: [n.label, n.sub].filter(Boolean).join(' · '), icon: n.icon, state: n.state || 'ok', ...colourOf(n.state || 'ok', n.tone), hidden: !shown(n), ...(n.reasons ? { reasons: n.reasons } : {}), ...(n.go ? { action: 'p.flow-go', arg: n.go, ...(n.tip ? { tip: n.tip } : {}) } : {}) })),
    links: stacked(links, place, k),
  };
}

/** 한 열의 타일을 들어오는 띠의 출발 높이(양으로 가중한 평균) 가까이로 옮긴다. 순서와 간격은 그대로 두고 그림 위아래 안에 머문다.
 *  띠가 크게 오르내리지 않으니, 한 타일에서 갈라지는 띠들의 안쪽 가장자리가 옆 띠의 바깥 가장자리와 엇갈리지 않는다 */
function align(list, links, place, gap, top, bottom) {
  if (!list.length) return;
  const want = list.map(n => {
    const ins = links.filter(l => l.to === n.id && l.value > 0 && place[l.from]), sum = ins.reduce((t, l) => t + l.value, 0);
    return sum ? ins.reduce((t, l) => t + l.value * (place[l.from].y + place[l.from].h / 2), 0) / sum - place[n.id].h / 2 : place[n.id].y;
  });
  let floor = top;
  list.forEach((n, i) => { place[n.id].y = Math.max(want[i], floor); floor = place[n.id].y + place[n.id].h + gap; });
  let ceil = bottom;
  for (const n of [...list].reverse()) { place[n.id].y = Math.min(place[n.id].y, ceil - place[n.id].h); ceil = place[n.id].y - gap; }
  if (place[list[0].id].y < top) { const lift = top - place[list[0].id].y; for (const n of list) place[n.id].y += lift; } /* a column taller than the room keeps its top */
}

/** 한 노드의 나가는 띠는 그 노드의 출발 구간을 값 비례로 위에서부터 겹침 없이 나눠 갖고, 들어오는 띠도 도착 구간을 그렇게 나눈다. 순서는 상대 노드의 세로 순서(교차가 가장 적다) */
function stacked(links, place, k) {
  const size = l => l.value > 0 ? l.value * k : 0, out = links.map(l => ({ from: l.from, to: l.to, label: '', fromOffset: 0, toOffset: 0, size: size(l), value: l.value > 0 ? l.text ?? '' : '', /* a band that is gone carries no figure while it shrinks away */ state: l.state || 'ok', hidden: !(l.value > 0) }));
  const share = (key, other, offset) => {
    for (const id of new Set(out.map(l => l[key]))) {
      let at = 0;
      for (const l of out.filter(x => x[key] === id).sort((a, b) => place[a[other]].y - place[b[other]].y)) { l[offset] = at; at += l.size; }
    }
  };
  share('from', 'to', 'fromOffset'); share('to', 'from', 'toOffset');
  return out;
}
