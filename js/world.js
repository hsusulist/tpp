/* =========================================================
   The house (static part) + collisions + room map
   Axes: x = East, z = South, y = Up. 1 unit = 1 metre.

        x:0         8    12     18 20      26
   z:0  ┌───────────┬────┬──────┬──┴──────┐
        │ Parents'  │Bath│ Your │  Dad's  │
        │ Bedroom   │    │ Room │  Office │
   z:7  ├──door─────┴door┴door──┴door──┬──┤
        │ Hallway  (attic hatch)       │Storage (tools)
   z:9.5├──┬arch┬───────┬──door──┬─────┴──┤
        │  Living Room  │ Dining │ Kitchen │
        │ (fireplace)   │  Room  │      [Back door]→ Backyard
   z:16.5├arch┬──┬door──┤        │         │
        │Foyer│Laundry  │        │         │
   z:20 └[FRONT DOOR]───┴────────┴─────────┘
   ========================================================= */
const World = (function () {
  const H = 2.8, T = 0.15, DH = 2.15;
  const FOOT = { x1: 0, z1: 0, x2: 26, z2: 20 };
  const colliders = [], lights = [];
  const rooms = [
    { id: 'PB', name: "Parents' Bedroom", x1: 0, z1: 0, x2: 8, z2: 7 },
    { id: 'BA', name: 'Bathroom', x1: 8, z1: 0, x2: 12, z2: 7 },
    { id: 'BR', name: 'Your Room', x1: 12, z1: 0, x2: 18, z2: 7 },
    { id: 'OF', name: "Dad's Office", x1: 18, z1: 0, x2: 26, z2: 7 },
    { id: 'HW', name: 'Hallway', x1: 0, z1: 7, x2: 20, z2: 9.5 },
    { id: 'ST', name: 'Storage', x1: 20, z1: 7, x2: 26, z2: 9.5 },
    { id: 'LV', name: 'Living Room', x1: 0, z1: 9.5, x2: 11, z2: 16.5 },
    { id: 'FY', name: 'Foyer', x1: 0, z1: 16.5, x2: 5, z2: 20 },
    { id: 'LD', name: 'Laundry', x1: 5, z1: 16.5, x2: 11, z2: 20 },
    { id: 'DN', name: 'Dining Room', x1: 11, z1: 9.5, x2: 18, z2: 20 },
    { id: 'KT', name: 'Kitchen', x1: 18, z1: 9.5, x2: 26, z2: 20 },
    { id: 'BY', name: 'Backyard', x1: 26, z1: -3, x2: 40, z2: 23, out: true },
  ];
  const mapDoors = [
    { x: 2.5, z: 20, label: 'FRONT DOOR', main: true },
    { x: 26, z: 14.65, label: 'BACK DOOR', main: true },
    { x: 6.15, z: 7 }, { x: 9.9, z: 7 }, { x: 13.15, z: 7 }, { x: 19.15, z: 7, locked: true },
    { x: 20, z: 8.25 }, { x: 7.55, z: 16.5 }, { x: 14.6, z: 9.5 },
  ];

  function C(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
  let seed = 1234;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function inside(x, z, y) { return x > FOOT.x1 && x < FOOT.x2 && z > FOOT.z1 && z < FOOT.z2 && y < 2.87; }

  // static box by corners. o: {c: collide, lvl, em, out}
  function sb(x1, y1, z1, x2, y2, z2, col, pat, o) {
    o = o || {};
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, cz = (z1 + z2) / 2;
    const ind = o.out ? false : (o.in ? true : inside(cx, cz, cy));
    Engine.addBox(cx, cy, cz, x2 - x1, y2 - y1, z2 - z1, col, pat || 0, ind, o.em);
    if (o.c) colliders.push({ x1, x2, z1, z2, y1, y2, lvl: o.lvl || 0, on: true });
  }
  function addCol(x1, z1, x2, z2, opts) {
    const c = Object.assign({ x1, x2, z1, z2, y1: 0, y2: 2, lvl: 0, on: true }, opts || {});
    colliders.push(c); return c;
  }

  const TRIM = C(0xe9e2d2), TRIM_D = C(0x5a3e2a), WAIN = C(0x6a4c35);
  // gap: [a, b] door  |  [a, b, 'w', y1, y2] window
  function segs(a1, a2, gaps) {
    const out = []; let cur = a1;
    const gs = (gaps || []).slice().sort((p, q) => p[0] - q[0]);
    for (const g of gs) { if (g[0] > cur) out.push([cur, g[0], null]); out.push([g[0], g[1], g]); cur = g[1]; }
    if (cur < a2) out.push([cur, a2, null]);
    return out;
  }
  // wall along X at z. cA/pA = paint of the north side (z-), cB/pB = south side (z+)
  function wallX(z, x1, x2, gaps, cA, pA, cB, pB, trimCol, o) {
    const h = T / 2, tc = trimCol || TRIM; o = o || {};
    for (const [a, b, g] of segs(x1, x2, gaps)) {
      const pieces = !g ? [[0, H]] : g[2] === 'w' ? [[0, g[3]], [g[4], H]] : [[DH, H]];
      for (const [y1, y2] of pieces) { sb(a, y1, z - h, b, y2, z, cA, pA); sb(a, y1, z, b, y2, z + h, cB, pB); }
      if (!g || g[2] === 'w') {   // trims only where the wall is solid (never across a doorway)
        if (o.wainA) { sb(a, 0, z - h - 0.02, b, 0.95, z - h, WAIN, 12); sb(a, 0.95, z - h - 0.035, b, 1.0, z - h, TRIM_D, 12); }
        else if (!o.noA) sb(a, 0, z - h - 0.02, b, 0.11, z - h, TRIM);
        if (o.wainB) { sb(a, 0, z + h, b, 0.95, z + h + 0.02, WAIN, 12); sb(a, 0.95, z + h, b, 1.0, z + h + 0.035, TRIM_D, 12); }
        else if (!o.noB) sb(a, 0, z + h, b, 0.11, z + h + 0.02, TRIM);
      }
      if (!g) colliders.push({ x1: a, x2: b, z1: z - h, z2: z + h, y1: 0, y2: H, lvl: 0, on: true });
      else if (g[2] === 'w') {
        colliders.push({ x1: a, x2: b, z1: z - h, z2: z + h, y1: 0, y2: H, lvl: 0, on: true });
        sb(a, g[3], z - 0.02, b, g[4], z + 0.02, [1, 1, 1], 8);
        sb(a - 0.06, g[3] - 0.06, z - h - 0.06, b + 0.06, g[3], z + h + 0.06, tc);
        sb(a - 0.06, g[4], z - h - 0.02, b + 0.06, g[4] + 0.07, z + h + 0.02, tc);
        sb(a - 0.07, g[3], z - h - 0.02, a, g[4], z + h + 0.02, tc); sb(b, g[3], z - h - 0.02, b + 0.07, g[4], z + h + 0.02, tc);
      } else {
        sb(a - 0.08, 0, z - h - 0.025, a, DH + 0.08, z + h + 0.025, tc); sb(b, 0, z - h - 0.025, b + 0.08, DH + 0.08, z + h + 0.025, tc);
        sb(a - 0.08, DH, z - h - 0.025, b + 0.08, DH + 0.08, z + h + 0.025, tc);
      }
    }
  }
  function wallZ(x, z1, z2, gaps, cA, pA, cB, pB, trimCol, o) { // cA = west side, cB = east side
    const h = T / 2, tc = trimCol || TRIM; o = o || {};
    for (const [a, b, g] of segs(z1, z2, gaps)) {
      const pieces = !g ? [[0, H]] : g[2] === 'w' ? [[0, g[3]], [g[4], H]] : [[DH, H]];
      for (const [y1, y2] of pieces) { sb(x - h, y1, a, x, y2, b, cA, pA); sb(x, y1, a, x + h, y2, b, cB, pB); }
      if (!g || g[2] === 'w') {
        if (o.wainA) { sb(x - h - 0.02, 0, a, x - h, 0.95, b, WAIN, 12); sb(x - h - 0.035, 0.95, a, x - h, 1.0, b, TRIM_D, 12); }
        else if (!o.noA) sb(x - h - 0.02, 0, a, x - h, 0.11, b, TRIM);
        if (o.wainB) { sb(x + h, 0, a, x + h + 0.02, 0.95, b, WAIN, 12); sb(x + h, 0.95, a, x + h + 0.035, 1.0, b, TRIM_D, 12); }
        else if (!o.noB) sb(x + h, 0, a, x + h + 0.02, 0.11, b, TRIM);
      }
      if (!g || g[2] === 'w') colliders.push({ x1: x - h, x2: x + h, z1: a, z2: b, y1: 0, y2: H, lvl: 0, on: true });
      if (g && g[2] === 'w') {
        sb(x - 0.02, g[3], a, x + 0.02, g[4], b, [1, 1, 1], 8);
        sb(x - h - 0.06, g[3] - 0.06, a - 0.06, x + h + 0.06, g[3], b + 0.06, tc);
        sb(x - h - 0.02, g[4], a - 0.06, x + h + 0.02, g[4] + 0.07, b + 0.06, tc);
        sb(x - h - 0.02, g[3], a - 0.07, x + h + 0.02, g[4], a, tc); sb(x - h - 0.02, g[3], b, x + h + 0.02, g[4], b + 0.07, tc);
      } else if (g) {
        sb(x - h - 0.025, 0, a - 0.08, x + h + 0.025, DH + 0.08, a, tc); sb(x - h - 0.025, 0, b, x + h + 0.025, DH + 0.08, b + 0.08, tc);
        sb(x - h - 0.025, DH, a - 0.08, x + h + 0.025, DH + 0.08, b + 0.08, tc);
      }
    }
  }
  // baseboard + crown moulding around a room
  function trimRoom(x1, z1, x2, z2, col) {
    const c = col || TRIM, i = 0.075;
    [[x1 + i, z1 + i, x2 - i, z1 + i + 0.02], [x1 + i, z2 - i - 0.02, x2 - i, z2 - i]].forEach(([a, b, cc, d]) => sb(a, H - 0.08, b, cc, H, d, c));
    [[x1 + i, z1 + i, x1 + i + 0.02, z2 - i], [x2 - i - 0.02, z1 + i, x2 - i, z2 - i]].forEach(([a, b, cc, d]) => sb(a, H - 0.08, b, cc, H, d, c));
  }
  function light(x, y, z, col, i, r, flick) { const l = { p: [x, y, z], c: C(col), i, r, flicker: flick || 0, f: 1 }; lights.push(l); return l; }
  function lamp(x, z, col, i, r, flick, kind) {
    if (kind === 'pend') { sb(x - 0.01, 2.3, z - 0.01, x + 0.01, 2.8, z + 0.01, C(0x222222)); sb(x - 0.22, 2.15, z - 0.22, x + 0.22, 2.32, z + 0.22, C(0x3a2a20), 13); sb(x - 0.12, 2.1, z - 0.12, x + 0.12, 2.16, z + 0.12, C(0xfff1d0), 0, { em: 1 }); }
    else { sb(x - 0.28, 2.7, z - 0.28, x + 0.28, 2.8, z + 0.28, C(0xd8cdb8)); sb(x - 0.22, 2.66, z - 0.22, x + 0.22, 2.7, z + 0.22, C(0xfff0cc), 0, { em: 1 }); }
    return light(x, 2.35, z, col, i, r, flick);
  }

  // ---------- palette ----------
  const P = {
    pb: C(0x8c7b88), ba: C(0xc7d4d6), br: C(0x7f94ad), of: C(0x4f6553), hw: C(0xb5a68c), st: C(0x8f8d86),
    lv: C(0xc2ae8a), fy: C(0x9fae9a), ld: C(0xb9c4c8), dn: C(0xa8826a), kt: C(0xd8ceb0), ext: C(0x7d8a8c),
  };
  const WOOD = C(0x6b4a33), WOOD_D = C(0x47301f), WOOD_L = C(0x9a7552), WHITE = C(0xeae6dc), METAL = C(0x9aa0a6), DARK = C(0x26262a);

  function build() {
    // ===== ground, street, neighbours =====
    sb(-40, -0.1, -40, 70, -0.02, 60, C(0x3d5a2b), 4, { out: true });
    sb(-40, -0.04, 29, 70, -0.005, 34, C(0x3a3a3c), 10, { out: true });              // street
    sb(-40, -0.03, 27.5, 70, 0.0, 29, C(0x8a8780), 10, { out: true });              // sidewalk
    sb(6, -0.03, 20, 9.5, 0.0, 27.5, C(0x6f6c68), 10, { out: true });               // driveway
    sb(1.9, -0.03, 21.5, 3.1, 0.0, 27.5, C(0x9a958a), 10, { out: true });           // front path
    for (let x = -36; x < 66; x += 7) sb(x, 0.0, 31.4, x + 3, 0.01, 31.6, C(0xd8d0a0), 0, { out: true }); // road paint
    [[-16, 2], [-16, 14], [44, 4], [44, 18], [-10, 38], [8, 38], [26, 38], [44, 36]].forEach(([x, z], i) => {
      const w = 8 + (i % 3), d = 8; const col = [0x6a6e72, 0x7a6a5e, 0x5e6a6a][i % 3];
      sb(x, 0, z, x + w, 3.1, z + d, C(col), 18, { c: true, out: true });
      sb(x - 0.4, 3.1, z - 0.4, x + w + 0.4, 3.5, z + d + 0.4, C(0x2e2826), 17, { out: true });
      sb(x + 1.5, 1.0, z + d, x + 3, 2.0, z + d + 0.05, [1, 1, 1], 8, { out: true });
      sb(x + w - 3, 1.0, z + d, x + w - 1.5, 2.0, z + d + 0.05, [1, 1, 1], 8, { out: true });
    });
    for (let i = 0; i < 22; i++) {
      const x = -30 + rnd() * 95, z = -30 + rnd() * 85;
      if (x > -4 && x < 42 && z > -6 && z < 30) continue;
      sb(x - 0.2, 0, z - 0.2, x + 0.2, 2.4, z + 0.2, C(0x4b3826), 10, { c: true, out: true });
      const s = 1.2 + rnd(); sb(x - s, 2.0, z - s, x + s, 3.9 + rnd(), z + s, C(0x2f4a24), 4, { out: true });
      sb(x - s * 0.7, 3.6, z - s * 0.7, x + s * 0.7, 4.6 + rnd(), z + s * 0.7, C(0x35552a), 4, { out: true });
    }
    // front yard low fence + mailbox + porch
    for (let x = -1; x < 26; x += 0.5) if (x < 1.6 || x > 3.3) if (x < 5.6 || x > 9.8) sb(x, 0, 27.2, x + 0.08, 0.9, 27.3, WHITE, 0, { out: true });
    sb(-1, 0.75, 27.22, 26, 0.82, 27.28, WHITE, 0, { out: true });
    sb(4.2, 0, 26.8, 4.3, 1.1, 26.9, WOOD, 0, { out: true }); sb(4.05, 1.1, 26.65, 4.45, 1.35, 27.15, C(0x2a4a6a), 13, { out: true });
    sb(0.6, -0.02, 20, 4.6, 0.18, 21.6, C(0x8f8a80), 10, { out: true });
    sb(0.7, 0.18, 21.4, 0.85, 2.85, 21.55, WHITE, 0, { out: true, c: true }); sb(4.35, 0.18, 21.4, 4.5, 2.85, 21.55, WHITE, 0, { out: true, c: true });
    sb(1.5, 0.01, 20.1, 3.5, 0.2, 20.8, C(0x7a4a2a), 7, { out: true });                     // doormat
    sb(3.4, 1.9, 20.0, 3.6, 2.15, 20.15, C(0xfff0c0), 0, { em: 1, out: true });             // porch light
    light(2.5, 2.2, 20.9, 0xffd8a0, 1.0, 6);

    // ===== floors =====
    const F = (x1, z1, x2, z2, col, pat) => sb(x1, -0.05, z1, x2, 0, z2, col, pat, { in: true });
    F(0, 0, 8, 7, C(0x5e4532), 1); F(8, 0, 12, 7, C(0xd2d6d2), 2); F(12, 0, 18, 7, C(0x7a5a40), 1);
    F(18, 0, 26, 7, C(0x4f3a2a), 1); F(0, 7, 20, 9.5, C(0x6e5038), 1); F(20, 7, 26, 9.5, C(0x8a8780), 10);
    F(0, 9.5, 11, 16.5, C(0x7a5639), 1); F(0, 16.5, 5, 20, C(0xb8b0a0), 2); F(5, 16.5, 11, 20, C(0xc8c8c0), 2);
    F(11, 9.5, 18, 20, C(0x6a4c35), 1); F(18, 9.5, 26, 20, C(0xdcd4c0), 2);
    // ceilings + roof
    sb(-0.1, 2.8, -0.1, 26.1, 2.86, 20.1, C(0xe6e0d2), 0, { in: true });
    sb(-0.6, 2.86, -0.6, 26.6, 3.0, 20.6, C(0x3a3230), 17, { out: true });
    sb(-0.6, 2.7, -0.6, 26.6, 2.86, -0.45, C(0xe0dcd0), 0, { out: true }); sb(-0.6, 2.7, 20.45, 26.6, 2.86, 20.6, C(0xe0dcd0), 0, { out: true });
    sb(-0.6, 2.7, -0.6, -0.45, 2.86, 20.6, C(0xe0dcd0), 0, { out: true }); sb(26.45, 2.7, -0.6, 26.6, 2.86, 20.6, C(0xe0dcd0), 0, { out: true });
    sb(-0.1, 0, -0.1, 26.1, 0.25, -0.03, C(0x6a6560), 10, { out: true }); sb(-0.1, 0, 20.03, 26.1, 0.25, 20.1, C(0x6a6560), 10, { out: true });

    // ===== exterior walls =====
    const EXT = P.ext;
    wallX(0, 0, 26, [[2.6, 4.2, 'w', 1.0, 2.1], [10.3, 11.3, 'w', 1.4, 2.1], [14.2, 15.7, 'w', 1.0, 2.1], [21.5, 23.5, 'w', 1.0, 2.1]], EXT, 18, P.pb, 3, null, { noA: true });
    // fix paint of north wall per room (overlay inner skins)
    wallX(20, 0, 26, [[1.9, 3.1], [3.6, 4.5, 'w', 0.9, 2.1], [7.8, 9.4, 'w', 1.0, 2.0], [15, 17, 'w', 1.0, 2.1], [21, 23.5, 'w', 1.0, 2.1]], P.fy, 0, EXT, 18, null, { noB: true });
    wallZ(0, 0, 20, [[2.5, 4.5, 'w', 1.0, 2.1], [10.2, 11.4, 'w', 1.0, 2.1]], EXT, 18, P.pb, 3, null, { noA: true });
    wallZ(26, 0, 20, [[3, 4.6, 'w', 1.0, 2.1], [14, 15.3], [17.2, 18.8, 'w', 1.0, 2.1]], P.of, 3, EXT, 18, null, { noB: true });
    // interior paint overlays on exterior walls (thin skins) so each room keeps its colour
    // (the wall builder already painted the inner side with one colour; add per-room skins)
    const skin = (x1, z1, x2, z2, col, pat) => sb(x1, 0, z1, x2, H, z2, col, pat, { in: true });
    // north wall inner faces (z 0..0.075)
    [[8, 12, P.ba, 15], [12, 18, P.br, 3], [18, 26, P.of, 3]].forEach(([a, b, c, p]) => {
      for (const [s1, s2, g] of segs(a, b, [[10.3, 11.3, 'w', 1.4, 2.1], [14.2, 15.7, 'w', 1.0, 2.1], [21.5, 23.5, 'w', 1.0, 2.1]].filter(g => g[0] >= a && g[1] <= b))) {
        if (!g) skin(s1, 0.075, s2, 0.08, c, p); else { sb(s1, 0, 0.075, s2, g[3], 0.08, c, p, { in: true }); sb(s1, g[4], 0.075, s2, H, 0.08, c, p, { in: true }); }
      }
    });
    // south wall inner faces (z 19.92..19.925)
    [[5, 11, P.ld, 0], [11, 18, P.dn, 3], [18, 26, P.kt, 0]].forEach(([a, b, c, p]) => {
      const gl = [[7.8, 9.4, 'w', 1.0, 2.0], [15, 17, 'w', 1.0, 2.1], [21, 23.5, 'w', 1.0, 2.1]].filter(g => g[0] >= a && g[1] <= b);
      for (const [s1, s2, g] of segs(a, b, gl)) {
        if (!g) skin(s1, 19.92, s2, 19.925, c, p); else { sb(s1, 0, 19.92, s2, g[3], 19.925, c, p, { in: true }); sb(s1, g[4], 19.92, s2, H, 19.925, c, p, { in: true }); }
      }
    });
    // west wall inner faces
    [[7, 9.5, P.hw, 3], [9.5, 16.5, P.lv, 3], [16.5, 20, P.fy, 0]].forEach(([a, b, c, p]) => {
      const gl = [[10.2, 11.4, 'w', 1.0, 2.1]].filter(g => g[0] >= a && g[1] <= b);
      for (const [s1, s2, g] of segs(a, b, gl)) {
        if (!g) sb(0.075, 0, s1, 0.08, H, s2, c, p, { in: true }); else { sb(0.075, 0, s1, 0.08, g[3], s2, c, p, { in: true }); sb(0.075, g[4], s1, 0.08, H, s2, c, p, { in: true }); }
      }
    });
    // east wall inner faces
    [[7, 9.5, P.st, 10], [9.5, 20, P.kt, 0]].forEach(([a, b, c, p]) => {
      const gl = [[14, 15.3], [17.2, 18.8, 'w', 1.0, 2.1]].filter(g => g[0] >= a && g[1] <= b);
      for (const [s1, s2, g] of segs(a, b, gl)) {
        if (!g) sb(25.92, 0, s1, 25.925, H, s2, c, p, { in: true });
        else if (g[2] === 'w') { sb(25.92, 0, s1, 25.925, g[3], s2, c, p, { in: true }); sb(25.92, g[4], s1, 25.925, H, s2, c, p, { in: true }); }
        else sb(25.92, DH, s1, 25.925, H, s2, c, p, { in: true });
      }
    });

    // ===== interior walls =====
    wallX(7, 0, 8, [[5.6, 6.7]], P.pb, 3, P.hw, 3, null, { wainB: true });
    wallX(7, 8, 12, [[9.4, 10.4]], P.ba, 15, P.hw, 3, null, { wainB: true });
    wallX(7, 12, 18, [[12.6, 13.7]], P.br, 3, P.hw, 3, null, { wainB: true });
    wallX(7, 18, 20, [[18.6, 19.7]], P.of, 3, P.hw, 3, null, { wainB: true });
    wallX(7, 20, 26, [], P.of, 3, P.st, 10);
    wallX(9.5, 0, 11, [[3.5, 6.5]], P.hw, 3, P.lv, 3, null, { wainA: true });
    wallX(9.5, 11, 18, [[14, 15.2]], P.hw, 3, P.dn, 3, null, { wainA: true });
    wallX(9.5, 18, 20, [], P.hw, 3, P.kt, 0, null, { wainA: true });
    wallX(9.5, 20, 26, [], P.st, 10, P.kt, 0);
    wallX(16.5, 0, 11, [[0.6, 4.4], [7, 8.1]], P.lv, 3, P.fy, 0);
    wallZ(8, 0, 7, [], P.pb, 3, P.ba, 15);
    wallZ(12, 0, 7, [], P.ba, 15, P.br, 3);
    wallZ(18, 0, 7, [], P.br, 3, P.of, 3);
    wallZ(20, 7, 9.5, [[7.7, 8.8]], P.hw, 3, P.st, 10, null, { wainA: true });
    wallZ(5, 16.5, 20, [], P.fy, 0, P.ld, 0);
    wallZ(11, 9.5, 20, [[11, 15.5]], P.lv, 3, P.dn, 3);
    wallZ(18, 9.5, 20, [[11.5, 16.5]], P.dn, 3, P.kt, 0);
    // wainscoting in hallway & dining

    // trims
    rooms.filter(r => !r.out).forEach(r => trimRoom(r.x1, r.z1, r.x2, r.z2, r.id === 'ST' ? C(0x6a6860) : TRIM));

    // ===== lights =====
    lamp(4, 3.5, 0xffcf90, 0.85, 6.5, 0.1); lamp(10, 3.5, 0xe8f2ff, 0.9, 5.5);
    lamp(15, 3.5, 0xffd9a0, 0.9, 6.5); lamp(22, 3.5, 0xffe2b0, 0.6, 6);
    lamp(4.5, 8.25, 0xffd49a, 0.65, 6, 0.08); lamp(14, 8.25, 0xffd49a, 0.65, 6);
    lamp(23, 8.25, 0xf0f0ff, 0.6, 5, 0.25);
    lamp(5.5, 13, 0xffc880, 0.8, 8.5, 0.05); lamp(2.5, 18.2, 0xffd8a8, 0.7, 5); lamp(8, 18.2, 0xf0f4ff, 0.65, 5);
    lamp(14.5, 14.75, 0xffd090, 0.85, 7.5, 0, 'pend'); lamp(22, 12.5, 0xeef4ff, 0.8, 7); lamp(22, 17.5, 0xeef4ff, 0.75, 7);

    // ===== PARENTS' BEDROOM (0-8, 0-7) =====
    sb(2.6, 0, 0.15, 5.4, 1.3, 0.32, WOOD_D, 12);                              // headboard
    sb(2.6, 0, 0.3, 5.4, 0.32, 2.7, WOOD_D, 12, { c: true });                    // bed frame
    sb(0.15, 0, 4.4, 1.0, 2.15, 6.6, WOOD_D, 12, { c: true });                   // wardrobe
    sb(1.0, 0.1, 4.45, 1.02, 2.05, 5.5, C(0x3a2418)); sb(1.0, 0.1, 5.55, 1.02, 2.05, 6.55, C(0x3a2418));
    sb(7.2, 0, 3.0, 7.85, 1.0, 5.0, WOOD, 12, { c: true });                      // dresser
    for (let i = 0; i < 3; i++) sb(7.18, 0.15 + i * 0.28, 3.05, 7.2, 0.38 + i * 0.28, 4.95, WOOD_D, 12);
    sb(7.85, 1.2, 3.3, 7.88, 2.1, 4.7, C(0xaab8c0), 19);                         // mirror
    sb(2.2, 0.001, 3.0, 5.8, 0.012, 5.5, C(0x5a4a6a), 14);
    sb(0.08, 1.0, 2.5, 0.12, 2.25, 2.6, C(0x6a2a2a), 7); sb(0.08, 1.0, 4.4, 0.12, 2.25, 4.5, C(0x6a2a2a), 7); // curtains
    // ===== BATHROOM (8-12) =====
    sb(8.2, 0, 0.15, 9.4, 0.85, 0.7, C(0xe9e6e0), 12, { c: true });             // vanity
    sb(8.3, 1.2, 0.08, 9.3, 2.1, 0.1, C(0xb8c8cc), 19);                          // mirror
    sb(10.4, 0, 4.8, 11.85, 0.58, 6.85, C(0xf2f2ee), 0, { c: true });             // bathtub
    sb(10.5, 0.5, 4.9, 11.75, 0.59, 6.75, C(0xbcd0d6), 13);
    sb(11.7, 1.6, 6.3, 11.8, 1.75, 6.4, METAL, 13);
    sb(8.2, 0.001, 2.6, 9.6, 0.012, 3.5, C(0x5a7a8a), 7);
    // ===== YOUR ROOM (12-18) =====
    sb(12.2, 0, 0.3, 13.6, 0.25, 2.5, WOOD, 12, { c: true });
    sb(12.2, 0.25, 0.3, 13.6, 0.45, 2.5, C(0xdad4c8), 7);
    sb(12.25, 0.45, 0.9, 13.55, 0.53, 2.45, C(0x3f5f8a), 7);
    sb(12.35, 0.45, 0.35, 13.45, 0.6, 0.8, C(0xeeeeee), 7);
    sb(12.15, 0, 0.15, 13.65, 1.0, 0.3, WOOD_D, 12);
    sb(15.6, 0.72, 0.15, 17.6, 0.78, 0.8, WOOD_L, 12, { c: true });            // desk
    sb(15.65, 0, 0.2, 15.75, 0.72, 0.75, WOOD_L); sb(17.45, 0, 0.2, 17.55, 0.72, 0.75, WOOD_L);
    sb(16.3, 0, 1.15, 16.8, 0.45, 1.65, C(0x444a55), 7, { c: true }); sb(16.3, 0.45, 1.55, 16.8, 1.0, 1.65, C(0x444a55), 7);
    sb(17.15, 0, 4.5, 17.85, 2.0, 6.6, WOOD_D, 12, { c: true });               // wardrobe
    sb(13.8, 0.001, 3.0, 16.4, 0.012, 5.4, C(0x7a3f3f), 14);
    sb(16.2, 1.2, 0.08, 17.2, 2.0, 0.1, C(0x355a6b)); sb(16.3, 1.3, 0.1, 17.1, 1.9, 0.11, C(0xd9b45a));  // poster
    sb(12.08, 1.3, 3.2, 12.12, 2.1, 4.4, C(0x2a4a5a)); for (let i = 0; i < 5; i++) sb(12.12, 1.35 + (i % 2) * 0.35, 3.3 + i * 0.2, 12.2, 1.6 + (i % 2) * 0.35, 3.45 + i * 0.2, C([0xd04a3a, 0x3a8ad0, 0xe0c040][i % 3]));
    // ===== OFFICE (18-26) =====
    sb(22, 0.72, 0.4, 24.6, 0.78, 1.3, WOOD_D, 12, { c: true });
    sb(22.05, 0, 0.45, 22.15, 0.72, 1.25, WOOD_D); sb(24.45, 0, 0.45, 24.55, 0.72, 1.25, WOOD_D);
    sb(25.2, 0, 5.4, 25.85, 0.9, 6.6, C(0x3a3d42), 13, { c: true }); sb(25.18, 0.4, 5.8, 25.2, 0.55, 6.2, METAL, 13);
    sb(18.15, 0, 2.5, 18.6, 2.1, 5.5, WOOD, 12, { c: true });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) sb(18.6, 0.3 + i * 0.48, 2.6 + j * 0.36, 18.66, 0.62 + i * 0.48, 2.9 + j * 0.36, C([0x6a2a2a, 0x2a3a5a, 0x4a5a2a, 0x7a6a4a][(i + j) % 4]));
    sb(22.6, 0.78, 0.6, 23.2, 0.8, 1.0, WHITE);
    // ===== STORAGE (20-26, 7-9.5) =====
    sb(24.9, 0, 7.15, 25.85, 1.9, 9.35, C(0x6a6a66), 13, { c: true });        // shelves
    for (let i = 0; i < 4; i++) sb(24.85, 0.3 + i * 0.45, 7.2, 24.9, 0.33 + i * 0.45, 9.3, C(0x4a4a46));
    sb(25.0, 0.33, 7.3, 25.6, 0.7, 7.9, C(0x9a7a4a)); sb(25.1, 0.78, 8.3, 25.7, 1.1, 9.0, C(0x8a6a3a)); sb(25.0, 1.23, 7.4, 25.5, 1.5, 8.0, C(0x7a8a9a));
    sb(22.5, 0, 9.0, 23.3, 1.6, 9.4, C(0xb8b8b0), 13, { c: true });             // water heater
    sb(20.3, 1.55, 7.08, 24.5, 1.62, 7.12, WOOD);                                // tool rail
    sb(20.2, 0.001, 7.2, 24.6, 0.01, 9.3, C(0x5a5a58), 10);
    // ===== HALLWAY =====
    sb(0.2, 0.001, 7.6, 19.6, 0.012, 8.9, C(0x6a2f2f), 14);                      // runner
    sb(9.6, 2.79, 7.85, 10.4, 2.8, 8.65, C(0x8a7a64));                           // attic hatch
    // grandfather clock (face + hands are animated in game.js)
    sb(8.45, 0, 9.0, 9.15, 2.15, 9.4, C(0x4a2c1a), 12, { c: true });
    sb(8.4, 2.15, 8.95, 9.2, 2.3, 9.4, C(0x3a2214), 12); sb(8.4, 0, 8.95, 9.2, 0.15, 9.4, C(0x3a2214), 12);
    sb(8.55, 0.35, 8.98, 9.05, 1.35, 9.0, C(0x8a6a30), 19);              // pendulum window
    sb(8.52, 1.35, 8.97, 9.08, 1.9, 8.99, C(0x2a1a10), 12);               // dial frame
    // kitchen wall clock (west wall of kitchen, facing east)
    sb(18.075, 1.75, 17.95, 18.1, 2.25, 18.45, C(0x2a2a2a), 13);
    // ===== LIVING ROOM (0-11, 9.5-16.5) =====
    sb(1.8, 0.001, 10.8, 6.0, 0.012, 14.5, C(0x7a3a2a), 14);                     // rug
    sb(0.08, 0, 11.8, 0.6, 1.25, 13.8, C(0x7a4a3a), 11, { c: true });          // fireplace
    sb(0.05, 1.25, 11.7, 0.7, 1.35, 13.9, C(0x3a2a20), 12);
    sb(0.1, 0.12, 12.3, 0.62, 0.8, 13.3, C(0x141010));
    sb(0.15, 0.12, 12.45, 0.5, 0.32, 13.15, C(0xff6a20), 9, { in: true });
    light(0.9, 0.5, 12.8, 0xff7a30, 1.0, 4.5, 0.35);
    sb(0.08, 1.5, 12.2, 0.1, 2.3, 13.4, C(0x1a1816));                            // empty frame above fireplace
    sb(7.2, 0, 9.65, 9.4, 0.5, 10.15, WOOD_D, 12, { c: true });                 // TV stand
    sb(6.8, 0, 13.2, 9.8, 0.45, 14.1, C(0x4a4f3e), 7, { c: true });             // sofa
    sb(6.8, 0.45, 13.8, 9.8, 0.95, 14.1, C(0x434836), 7);
    sb(6.6, 0, 13.2, 6.8, 0.7, 14.1, C(0x434836), 7, { c: true }); sb(9.8, 0, 13.2, 10.0, 0.7, 14.1, C(0x434836), 7, { c: true });
    sb(1.4, 0, 14.4, 2.3, 0.42, 15.3, C(0x6a3a2a), 7, { c: true }); sb(1.4, 0.42, 15.1, 2.3, 0.95, 15.3, C(0x6a3a2a), 7); // armchair
    sb(0.6, 0, 9.65, 1.6, 1.0, 10.1, WOOD, 12, { c: true });                     // side cabinet
    sb(3.0, 0.3, 9.6, 3.2, 1.0, 9.62, C(0x2a2a2a));
    // ===== FOYER (0-5, 16.5-20) =====
    sb(1.9, 0, 19.93, 3.1, DH, 20.07, C(0x5b3b28), 12, { c: true, in: true });  // FRONT DOOR
    sb(2.05, 1.3, 19.92, 2.95, 1.9, 19.925, [1, 1, 1], 8);
    sb(2.85, 0.95, 19.88, 2.95, 1.05, 19.93, C(0xd8b060), 13);
    sb(1.9, 0, 20.07, 3.1, DH, 20.08, C(0x5b3b28), 12, { out: true });
    sb(0.15, 0, 18.0, 0.6, 0.45, 19.4, WOOD, 12, { c: true });                   // shoe bench
    sb(4.3, 0, 17.0, 4.85, 0.8, 17.9, WOOD_D, 12, { c: true });                  // hall table (mail tray)
    sb(0.1, 1.2, 17.2, 0.12, 2.0, 17.9, C(0xaab8c0), 19);                        // mirror
    sb(4.6, 0, 18.6, 4.7, 1.8, 18.7, WOOD_D); sb(4.45, 1.7, 18.45, 4.85, 1.75, 18.85, WOOD_D);   // coat rack
    sb(4.4, 0.8, 18.5, 4.65, 1.6, 18.75, C(0x3a4a5a), 7);
    // ===== LAUNDRY (5-11, 16.5-20) =====
    sb(9.9, 0, 19.0, 10.8, 0.9, 19.85, WHITE, 13, { c: true }); sb(10.15, 0.3, 18.98, 10.55, 0.7, 19.0, C(0x3a4a5a), 19);
    sb(8.9, 0, 19.0, 9.8, 0.9, 19.85, WHITE, 13, { c: true }); sb(9.15, 0.3, 18.98, 9.55, 0.7, 19.0, C(0x3a4a5a), 19);
    // linen shelf (open shelves, the fresh towel sits on the 2nd board)
    sb(5.15, 0, 19.78, 6.9, 1.9, 19.85, C(0x8a8a86), 13, { c: true });               // back
    sb(5.15, 0, 18.9, 5.2, 1.9, 19.85, C(0x8a8a86), 13, { c: true }); sb(6.85, 0, 18.9, 6.9, 1.9, 19.85, C(0x8a8a86), 13, { c: true }); // sides
        for (let i = 0; i < 4; i++) sb(5.2, 0.4 + i * 0.45, 18.92, 6.85, 0.43 + i * 0.45, 19.78, C(0xb8b8b2), 13);
    addCol(5.15, 18.9, 6.9, 19.85, { y2: 1.6 });   // keeps you out of the shelf (low enough not to block aiming)
    sb(5.3, 0.43, 19.1, 5.9, 0.6, 19.6, C(0xe8e4da), 7); sb(6.1, 0.43, 19.1, 6.7, 0.55, 19.6, C(0xc8a0a0), 7);   // folded linens
    sb(6.4, 0.88, 19.15, 6.75, 1.05, 19.6, C(0xd8d4ca), 7); sb(5.3, 1.33, 19.1, 6.0, 1.48, 19.6, C(0xa8b8c8), 7);
    // ===== DINING (11-18) =====
    [[13.3, 13.95], [13.3, 15.55], [15.7, 13.95], [15.7, 15.55]].forEach(([x, z]) => {
      sb(x - 0.22, 0.42, z - 0.22, x + 0.22, 0.47, z + 0.22, WOOD, 12);
      [[-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(([a, b]) => sb(x + a * 0.18 - 0.03, 0, z + b * 0.18 - 0.03, x + a * 0.18 + 0.03, 0.42, z + b * 0.18 + 0.03, WOOD));
      const bx = x < 14.5 ? x - 0.22 : x + 0.17; sb(bx, 0.47, z - 0.22, bx + 0.05, 1.0, z + 0.22, WOOD, 12);
    });
    sb(14.28, 0.42, 16.2, 14.72, 0.47, 16.64, WOOD, 12); sb(14.28, 0.47, 16.6, 14.72, 1.0, 16.65, WOOD, 12);
    [[14.3, 16.22], [14.66, 16.22], [14.3, 16.58], [14.66, 16.58]].forEach(([x, z]) => sb(x, 0, z, x + 0.05, 0.42, z + 0.05, WOOD));
    sb(12.0, 0, 19.35, 14.5, 0.9, 19.85, WOOD_D, 12, { c: true });              // sideboard
    sb(11.15, 0, 17.5, 11.6, 2.0, 19.5, WOOD, 12, { c: true });                 // china cabinet
    sb(11.6, 0.9, 17.6, 11.62, 1.9, 19.4, C(0xaabbc0), 19);
    sb(12.6, 0.001, 12.7, 16.4, 0.012, 16.8, C(0x5a3a3a), 14);
    // ===== KITCHEN (18-26) =====
    sb(18.3, 0, 9.65, 25.85, 0.88, 10.3, C(0x8c7b62), 12, { c: true });
    sb(18.25, 0.88, 9.62, 25.88, 0.93, 10.35, C(0xcfc8b8), 10);
    sb(18.3, 1.55, 9.65, 25.85, 2.3, 10.0, C(0x8c7b62), 12);
    for (let x = 18.9; x < 25.8; x += 1.0) sb(x, 1.6, 9.99, x + 0.02, 2.25, 10.01, C(0x5a4b3a));
    for (let x = 18.8; x < 25.8; x += 0.9) sb(x, 0.1, 10.29, x + 0.02, 0.8, 10.31, C(0x5a4b3a));
    sb(22.0, 0.88, 9.75, 23.0, 0.94, 10.25, METAL, 13); sb(22.45, 0.93, 9.68, 22.55, 1.25, 9.78, METAL, 13);   // sink
    sb(18.8, 0.94, 9.75, 19.8, 0.96, 10.25, DARK, 13);                            // cooktop
    sb(20.5, 0, 13.6, 23.5, 0.88, 14.6, C(0x7d6c55), 12, { c: true });          // island
    sb(20.45, 0.88, 13.55, 23.55, 0.93, 14.65, C(0xcfc8b8), 10);
    sb(25.1, 0, 10.5, 25.85, 1.95, 11.5, C(0xdcdfdc), 13, { c: true });          // fridge
    sb(25.07, 1.0, 10.55, 25.1, 1.08, 11.45, METAL, 13);
    sb(25.2, 0, 11.7, 25.85, 2.1, 13.5, C(0x8c7b62), 12, { c: true });          // pantry
    sb(18.15, 0, 19.3, 21.0, 0.88, 19.85, C(0x8c7b62), 12, { c: true }); sb(18.1, 0.88, 19.25, 21.0, 0.93, 19.88, C(0xcfc8b8), 10);
    // back door (open leaf) + step
    sb(26.0, 0, 14.0, 26.8, DH, 14.06, C(0x6a4a30), 12, { out: true });
    sb(26.0, -0.02, 13.6, 29.0, 0.06, 17.2, C(0x8a857a), 10, { out: true });
    sb(26.2, 2.0, 15.4, 26.35, 2.2, 15.55, C(0xfff0c0), 0, { em: 1, out: true }); light(26.6, 2.1, 14.65, 0xffd8a0, 0.9, 6);

    // ===== BACKYARD (26-40, -3..23) =====
    const FENCE = C(0x5a4632);
    sb(40, 0, -3, 40.15, 1.7, 23, FENCE, 12, { c: true, out: true });
    sb(26, 0, -3.15, 40.15, 1.7, -3, FENCE, 12, { c: true, out: true });
    sb(26, 0, 23, 40.15, 1.7, 23.15, FENCE, 12, { c: true, out: true });
    sb(25.9, 0, -3.15, 26.05, 1.7, 0.05, FENCE, 12, { c: true, out: true });
    sb(25.9, 0, 19.95, 26.05, 1.7, 23.15, FENCE, 12, { c: true, out: true });
    for (let x = 26.5; x < 40; x += 1.1) { sb(x, 0, -3.18, x + 0.1, 1.85, -2.97, FENCE, 0, { out: true }); sb(x, 0, 22.97, x + 0.1, 1.85, 23.18, FENCE, 0, { out: true }); }
    for (let z = -2.5; z < 23; z += 1.1) sb(39.97, 0, z, 40.18, 1.85, z + 0.1, FENCE, 0, { out: true });
    // garden
    for (let i = 0; i < 60; i++) {
      const x = 27.5 + rnd() * 12.2, z = -2.7 + rnd() * 25.4;
      if (x < 31 && z > 10 && z < 18.5) continue;     // keep the path from the back door free
      if (x > 34.6 && z < 2.8) continue;             // grave corner (separate bushes)
      if (x < 29.5 && z > 9 && z < 20) continue;
      const s = 0.3 + rnd() * 0.6, hgt = 0.3 + rnd() * 1.1;
      const g = [0x2f4a22, 0x3a5a28, 0x26401c, 0x4a5a2a][i % 4];
      sb(x - s, 0, z - s, x + s, hgt, z + s, C(g), 4, { c: hgt > 0.9, out: true });
    }
    sb(36.5, 0, 18.5, 39.6, 2.3, 22.6, C(0x6a5040), 12, { c: true, out: true }); // garden shed
    sb(36.3, 2.3, 18.3, 39.8, 2.55, 22.8, C(0x3a3030), 17, { out: true });
    sb(37.5, 0, 18.48, 38.5, 1.9, 18.5, C(0x4a3020), 12, { out: true });
    sb(30, 0, 20, 30.08, 1.8, 20.08, WOOD, 0, { out: true }); sb(35, 0, 20, 35.08, 1.8, 20.08, WOOD, 0, { out: true });
    sb(30, 1.75, 20.03, 35, 1.76, 20.05, C(0xdddddd), 0, { out: true });          // clothesline
    sb(37.2, 0, -2.4, 39.2, 0.15, -0.2, C(0x6a6a66), 10, { out: true });          // grave plot

    // ===== ROOF (level 1) =====
    sb(8.6, 3.0, 3.0, 11.4, 4.6, 4.5, C(0x56504a), 18, { c: true, lvl: 1, out: true });
    sb(8.5, 4.6, 2.9, 11.5, 4.75, 4.6, C(0x2f2a28), 17, { out: true });
    sb(9.9, 4.15, 4.5, 10.1, 4.18, 4.6, METAL, 13, { out: true });
    sb(1, 3.0, 1.5, 1.7, 4.0, 2.2, C(0x7a4a3a), 11, { c: true, lvl: 1, out: true });   // chimney
    addCol(-1, -1, 26.9, 0.25, { lvl: 1, y2: 5 }); addCol(-1, 19.75, 26.9, 21, { lvl: 1, y2: 5 });
    addCol(-1, -1, 0.25, 21, { lvl: 1, y2: 5 }); addCol(25.75, -1, 27, 21, { lvl: 1, y2: 5 });

    Engine.buildStatic();
  }

  function roomAt(x, z) {
    for (const r of rooms) if (x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2) return r;
    return null;
  }

  // ---------- characters ----------
  // Built facing +z, feet at y = 0. Sitting pose assumes a seat at y ≈ 0.45.
  function person(opt) {
    const skin = opt.skin || C(0xd2a07a), skinD = C(0xb98762), shirt = opt.shirt || C(0x6f86a0), shirtD = shirt.map(v => v * 0.78);
    const pants = opt.pants || C(0x2e3138), shoe = C(0x1e1a17), hair = opt.hair || C(0x2b2119), grey = C(0x5a5048);
    const sit = !!opt.sit, P = [];
    const st = opt.style || 'dad', isDad = st === 'dad';   // dad | mom | aunt | kid | man
    const b = (x, y, z, w, h, d, c, pat, r) => P.push({ o: [x, y + h / 2, z], s: [w, h, d], c, pat: pat || 0, r: r || 0 });
    let hip;                                    // height of the hips
    if (!sit) {
      hip = 0.92;
      b(-0.11, 0, 0.04, 0.13, 0.09, 0.29, shoe, 13); b(0.11, 0, 0.04, 0.13, 0.09, 0.29, shoe, 13);
      b(-0.11, 0.09, 0, 0.17, 0.41, 0.19, pants, 7); b(0.11, 0.09, 0, 0.17, 0.41, 0.19, pants, 7);      // shins
      b(-0.105, 0.5, 0, 0.19, 0.42, 0.21, pants, 7); b(0.105, 0.5, 0, 0.19, 0.42, 0.21, pants, 7);     // thighs
    } else {
      hip = 0.5;
      b(-0.11, 0, 0.47, 0.13, 0.09, 0.29, shoe, 13); b(0.11, 0, 0.47, 0.13, 0.09, 0.29, shoe, 13);
      b(-0.11, 0.09, 0.44, 0.17, 0.38, 0.19, pants, 7); b(0.11, 0.09, 0.44, 0.17, 0.38, 0.19, pants, 7); // shins (vertical)
      b(-0.105, 0.42, 0.18, 0.19, 0.18, 0.56, pants, 7); b(0.105, 0.42, 0.18, 0.19, 0.18, 0.56, pants, 7); // thighs (forward)
    }
    if (opt.dress && !sit) b(0, 0.42, 0.01, 0.46, 0.55, 0.3, opt.dress, 7);  // skirt / dress
    const lean = sit ? 0.06 : 0.02;             // slumped, tired posture
    const T = hip;                              // torso base
    b(0, T - 0.02, 0, 0.44, 0.07, 0.24, C(0x2a1f18), 13);                     // belt
    b(0, T - 0.005, 0.121, 0.06, 0.045, 0.01, C(0xb89a50), 13);               // buckle
    b(0, T + 0.05, lean * 0.3, 0.44, 0.34, 0.25, shirt, 7);                  // lower shirt
    b(0, T + 0.39, lean, 0.48, 0.22, 0.26, shirt, 7);                        // chest
    b(0, T + 0.58, lean, 0.52, 0.06, 0.25, shirtD, 7);                       // shoulders
    b(0, T + 0.05, 0.128 + lean * 0.3, 0.035, 0.56, 0.008, shirtD);          // button placket
    for (let k = 0; k < 4; k++) b(0, T + 0.12 + k * 0.13, 0.134 + lean * 0.5, 0.02, 0.02, 0.006, C(0xe8e4dc));
    b(-0.07, T + 0.6, 0.1 + lean, 0.09, 0.05, 0.05, C(0xe6e2d8), 7, 0.4); b(0.07, T + 0.6, 0.1 + lean, 0.09, 0.05, 0.05, C(0xe6e2d8), 7, -0.4); // collar
    b(0, T + 0.62, lean, 0.13, 0.08, 0.13, skin);                            // neck
    // head
    const H = T + 0.69, hz = lean * 1.3;
    b(0, H, hz, 0.29, 0.31, 0.29, skin);
    if (opt.hair2 === 'scarf') {                                             // head scarf (hospital)
      const sc = opt.scarf || C(0x9ab8c8);
      b(0, H + 0.2, hz - 0.01, 0.32, 0.15, 0.32, sc, 7); b(0, H + 0.02, hz - 0.16, 0.32, 0.3, 0.03, sc, 7);
      b(-0.16, H + 0.12, hz - 0.02, 0.02, 0.2, 0.26, sc, 7); b(0.16, H + 0.12, hz - 0.02, 0.02, 0.2, 0.26, sc, 7); b(0, H + 0.02, hz - 0.2, 0.08, 0.08, 0.06, sc, 7);
    } else if (opt.hair2 === 'long') {                                       // long hair
      b(0, H + 0.28, hz - 0.01, 0.32, 0.08, 0.32, hair, 7); b(0, H + 0.24, hz + 0.14, 0.31, 0.06, 0.03, hair, 7);
      b(0, H - 0.3, hz - 0.15, 0.34, 0.6, 0.05, hair, 7);
      b(-0.16, H - 0.18, hz - 0.02, 0.03, 0.48, 0.26, hair, 7); b(0.16, H - 0.18, hz - 0.02, 0.03, 0.48, 0.26, hair, 7);
    } else {
      b(0, H + 0.28, hz - 0.01, 0.31, 0.08, 0.31, hair, 7); b(0, H + 0.25, hz + 0.14, 0.3, 0.04, 0.03, hair, 7); // top hair + fringe
      b(0, H + 0.1, hz - 0.15, 0.31, 0.24, 0.03, hair, 7);                     // back hair
      if (isDad) { b(-0.152, H + 0.14, hz - 0.03, 0.02, 0.16, 0.22, grey, 7); b(0.152, H + 0.14, hz - 0.03, 0.02, 0.16, 0.22, grey, 7); } // greying sides
    }
    b(-0.155, H + 0.1, hz + 0.01, 0.03, 0.08, 0.06, skinD); b(0.155, H + 0.1, hz + 0.01, 0.03, 0.08, 0.06, skinD);     // ears
    const fz = hz + 0.146;
    b(-0.065, H + 0.17, fz, 0.06, 0.03, 0.006, C(0xf0ece4)); b(0.065, H + 0.17, fz, 0.06, 0.03, 0.006, C(0xf0ece4)); // eye whites
    b(-0.065, H + 0.172, fz + 0.004, 0.026, 0.026, 0.004, C(0x2a1a10)); b(0.065, H + 0.172, fz + 0.004, 0.026, 0.026, 0.004, C(0x2a1a10)); // pupils
    if (isDad || st === 'mom') { b(-0.065, H + 0.15, fz, 0.06, 0.015, 0.004, C(0xa87458)); b(0.065, H + 0.15, fz, 0.06, 0.015, 0.004, C(0xa87458)); } // tired eye bags
    b(-0.068, H + 0.21, fz, 0.075, 0.016, 0.008, hair, 0, -0.12); b(0.068, H + 0.21, fz, 0.075, 0.016, 0.008, hair, 0, 0.12); // brows (sad)
    b(0, H + 0.1, fz + 0.015, 0.04, 0.07, 0.035, skinD);                      // nose
    b(0, H + 0.055, fz, 0.08, 0.014, 0.006, C(0x7a4a3a));                     // mouth
    if (isDad && opt.beard !== false) {                                       // stubble
      const stub = C(0xa27c62);
      b(0, H + 0.005, fz - 0.003, 0.25, 0.04, 0.008, stub, 7); b(-0.1, H + 0.03, fz - 0.003, 0.05, 0.06, 0.008, stub, 7); b(0.1, H + 0.03, fz - 0.003, 0.05, 0.06, 0.008, stub, 7);
      b(-0.1, H - 0.005, hz + 0.05, 0.08, 0.02, 0.18, stub, 7); b(0.1, H - 0.005, hz + 0.05, 0.08, 0.02, 0.18, stub, 7);
    }
    // arms: sleeves rolled up to the elbow
    const sh = T + 0.56;
    b(-0.31, sh - 0.3, lean, 0.13, 0.3, 0.15, shirt, 7); b(0.31, sh - 0.3, lean, 0.13, 0.3, 0.15, shirt, 7);
    b(-0.31, sh - 0.33, lean, 0.135, 0.05, 0.155, shirtD, 7); b(0.31, sh - 0.33, lean, 0.135, 0.05, 0.155, shirtD, 7); // rolled cuffs
    if (!sit) {
      b(-0.31, sh - 0.6, lean, 0.11, 0.27, 0.12, skin); b(0.31, sh - 0.6, lean, 0.11, 0.27, 0.12, skin);   // forearms
      b(-0.31, sh - 0.71, lean + 0.01, 0.1, 0.11, 0.1, skin); b(0.31, sh - 0.71, lean + 0.01, 0.1, 0.11, 0.1, skin); // hands
      if (isDad || st === 'mom') b(-0.31, sh - 0.66, lean + 0.06, 0.03, 0.02, 0.01, C(0xd8b050), 13);   // wedding ring
    } else {
      b(-0.27, sh - 0.4, 0.2, 0.1, 0.09, 0.3, skin); b(0.27, sh - 0.4, 0.2, 0.1, 0.09, 0.3, skin);       // forearms resting on thighs
      b(-0.22, sh - 0.42, 0.38, 0.09, 0.07, 0.09, skinD); b(0.22, sh - 0.42, 0.38, 0.09, 0.07, 0.09, skinD); // hands
      b(-0.22, sh - 0.35, 0.39, 0.03, 0.02, 0.01, C(0xd8b050), 13);
    }
    return { pos: [opt.x || 0, opt.y || 0, opt.z || 0], rotY: opt.rot || 0, visible: true, parts: P, dirty: true };
  }

  return { H, C, rnd, build, colliders, lights, rooms, mapDoors, roomAt, addCol, person, FOOT, setSeed(s) { seed = s; } };
})();
