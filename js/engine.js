/* =========================================================
   THE PERFECT PICTURE - Lightweight WebGL engine (no libraries)
   - Static geometry merged into one buffer
   - Each dynamic model = 1 cached buffer = 1 draw call
   - Linear lighting, ACES tonemapping, specular, procedural materials
   - Dynamic resolution for weak PCs
   ========================================================= */
const Engine = (function () {
  let gl, canvas, prog;
  const U = {}, A = {};
  let staticBuf = null, staticCount = 0, staticData = [];
  const STRIDE = 13; // pos3 nor3 col3 ex4(pat, em, alpha, indoor)
  const stats = { calls: 0, fps: 60, scale: 1 };
  let quality = { scale: 1, lights: 6, auto: true };

  const FACES = [
    [[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]],
    [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]],
    [[1, 0, 0], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]],
    [[-1, 0, 0], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]],
    [[0, 1, 0], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]],
    [[0, -1, 0], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]],
  ];
  const IDX = [0, 1, 2, 0, 2, 3];

  // push a box (optionally rotated around Y by r) into an array
  function pushBox(arr, cx, cy, cz, w, h, d, col, pat, em, alpha, indoor, r) {
    const c = r ? Math.cos(r) : 1, s = r ? Math.sin(r) : 0;
    for (const [n, cs] of FACES) {
      const nx = c * n[0] + s * n[2], nz = -s * n[0] + c * n[2];
      for (const i of IDX) {
        const p = cs[i];
        const lx = p[0] * w, ly = p[1] * h, lz = p[2] * d;
        arr.push(cx + c * lx + s * lz, cy + ly, cz - s * lx + c * lz, nx, n[1], nz,
          col[0], col[1], col[2], pat || 0, em ? 1 : 0, alpha == null ? 1 : alpha, indoor ? 1 : 0);
      }
    }
  }

  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec4 aEx;
uniform mat4 uVP; uniform mat4 uM;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vE;
void main(){
  vec4 w = uM*vec4(aPos,1.0);
  vW = w.xyz; vN = (uM*vec4(aNor,0.0)).xyz; vC = aCol; vE = aEx;
  gl_Position = uVP*w;
}`;

  const FS = `
precision mediump float;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec4 vE;
uniform vec3 uAmbIn; uniform vec3 uAmbOut; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uLP[8]; uniform vec3 uLC[8]; uniform float uLR[8]; uniform int uNL;
uniform vec3 uFog; uniform float uFogN; uniform float uFogF; uniform vec3 uCam;
uniform vec3 uWin; uniform float uTime; uniform float uHi; uniform float uDust; uniform vec3 uDustCol;
uniform float uAlpha; uniform float uExpo; uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform float uNight;
uniform vec3 uTint;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x),mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm(vec2 p){return nz(p)*0.55+nz(p*2.1+3.1)*0.3+nz(p*4.3+7.7)*0.15;}
vec3 lin(vec3 c){return c*c;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
void main(){
  float p = floor(vE.x+0.5);
  vec3 n = normalize(vN);
  vec3 V = normalize(uCam - vW);
  // ---- SKY ----
  if(p>99.0){
    vec3 d = normalize(vW-uCam);
    float t = clamp(d.y*1.6+0.08,0.0,1.0);
    vec3 col = mix(uSkyHor, uSkyTop, t);
    float sd = max(dot(d,-uSunDir),0.0);
    col += uSunCol*0.25*pow(sd,12.0) + uSunCol*1.5*smoothstep(0.9975,0.999,sd);
    if(uNight>0.3 && d.y>0.05){ float st=h2(floor(d.xz/(d.y+0.3)*180.0)); col+=vec3(step(0.996,st))*uNight*(0.5+0.5*sin(uTime*2.0+st*50.0)); }
    col = mix(col, uFog, clamp(1.0-d.y*5.0,0.0,1.0)*0.6);
    gl_FragColor = vec4(pow(col,vec3(1.0)),1.0);
    return;
  }
  // uv by dominant axis
  vec2 uv = abs(n.y)>0.5 ? vW.xz : (abs(n.x)>0.5 ? vec2(vW.z,vW.y) : vec2(vW.x,vW.y));
  vec3 col = vC; float shin = 16.0, ks = 0.04; float em = vE.y;
  if(p==0.0){ col*=0.95+0.07*nz(uv*3.0); }
  else if(p==1.0){ // wood planks
    float row=floor(vW.z*4.0); float g=fract(vW.z*4.0);
    float off=h2(vec2(row,1.7))*9.0; float seg=floor((vW.x+off)*0.7);
    float tone=0.78+0.32*h2(vec2(row,seg));
    float grain=0.9+0.1*sin((vW.x+off)*38.0+nz(vec2(vW.x*3.0,row)*2.0)*6.0);
    col*=tone*grain; if(g<0.045) col*=0.45; if(fract((vW.x+off)*0.7)<0.006) col*=0.5;
    shin=30.0; ks=0.14;
  } else if(p==2.0){ // floor tiles
    vec2 t=fract(uv*2.0); vec2 id=floor(uv*2.0);
    col*= (mod(id.x+id.y,2.0)<0.5?1.0:0.88)*(0.93+0.07*nz(uv*9.0));
    if(t.x<0.035||t.y<0.035) col*=0.55; shin=60.0; ks=0.3;
  } else if(p==3.0){ // damask wallpaper
    vec2 q=uv*vec2(3.0,3.0); vec2 c=fract(q)-0.5;
    float m=abs(c.x)+abs(c.y*1.4); float motif=smoothstep(0.32,0.28,m)-smoothstep(0.2,0.16,m);
    float dots=smoothstep(0.07,0.05,length(c));
    col*=0.9+0.08*(motif+dots); col*=0.94+0.08*fbm(uv*1.5);
  } else if(p==4.0){ col*=0.6+0.65*fbm(vW.xz*2.0)*(0.7+0.5*nz(vW.xz*14.0)); }
  else if(p==6.0){ col=mix(col,vec3(0.55,0.53,0.49),0.6)*(0.85+0.25*h2(floor(uv*40.0))); }
  else if(p==7.0){ col*=0.82+0.3*nz(uv*28.0)*nz(uv*9.0+2.0); }
  else if(p==8.0){ // window
    vec2 q=fract(uv*vec2(1.5,1.4));
    col=uWin*(0.85+0.3*V.y); em=1.0;
    if(q.x<0.06||q.y<0.06){ col=vec3(0.85,0.82,0.76); em=0.0; }
  } else if(p==9.0){ em=1.0; col*=0.6+0.8*nz(vec2(uv.x*5.0, uv.y*6.0-uTime*5.0)); }
  else if(p==10.0){ col*=0.72+0.4*fbm(uv*5.0); ks=0.05; }
  else if(p==11.0){ // brick
    vec2 b=uv*vec2(4.0,8.0); b.x+=step(1.0,mod(floor(b.y),2.0))*0.5;
    vec2 fb=fract(b); if(fb.x<0.06||fb.y<0.1) col=vec3(0.55,0.52,0.48)*0.7; else col*=0.8+0.3*h2(floor(b));
  } else if(p==12.0){ // furniture wood
    col*=0.9+0.05*sin(uv.x*40.0+nz(uv*vec2(3.0,30.0))*3.0)+0.07*nz(uv*vec2(6.0,40.0)); shin=40.0; ks=0.12;
  } else if(p==13.0){ col*=0.9+0.1*nz(uv*30.0); shin=80.0; ks=0.6; }
  else if(p==14.0){ // patterned rug (uses local stripe border)
    vec2 q=fract(uv*1.2); float b=step(0.12,q.x)*step(q.x,0.88)*step(0.12,q.y)*step(q.y,0.88);
    float d=abs(fract(uv.x*2.4+uv.y*2.4)-0.5);
    col*= mix(0.6, 0.9+0.25*step(0.35,d), b); col*=0.85+0.25*nz(uv*30.0);
  } else if(p==15.0){ // bathroom wall tile
    vec2 t=fract(uv*5.0); col*=0.95+0.05*h2(floor(uv*5.0)); if(t.x<0.05||t.y<0.05) col*=0.7; shin=70.0; ks=0.35;
  } else if(p==16.0){ col*=0.6+0.6*fbm(uv*7.0); }
  else if(p==17.0){ vec2 s=uv*vec2(3.0,6.0); s.x+=step(1.0,mod(floor(s.y),2.0))*0.5; vec2 f=fract(s); col*=0.75+0.3*h2(floor(s)); if(f.y<0.08) col*=0.5; }
  else if(p==18.0){ float b=fract(vW.y*5.0); col*=0.9+0.1*nz(uv*vec2(1.0,20.0)); if(b<0.08) col*=0.62; }
  else if(p==19.0){ shin=120.0; ks=0.9; col*=0.9; } // glass/mirror
  // dust / grime overlay (per-model uniform)
  if(uDust>0.001){
    float sp=0.75+0.45*h2(floor(uv*45.0))*nz(uv*6.0);
    col=mix(col,uDustCol*sp,clamp(uDust*0.85*(0.6+0.6*nz(uv*3.0)),0.0,1.0));
    ks*=1.0-uDust;
  }
  vec3 alb = lin(col);
  vec3 lit;
  if(em>0.5){ lit = alb*2.2; }
  else {
    bool indoor = vE.w>0.5;
    vec3 amb = indoor ? uAmbIn : uAmbOut;
    vec3 d = amb*(0.62+0.38*(n.y*0.5+0.5));
    vec3 spec = vec3(0.0);
    if(!indoor){
      float nl=max(dot(n,-uSunDir),0.0); d+=uSunCol*nl;
      vec3 H=normalize(-uSunDir+V); spec+=uSunCol*pow(max(dot(n,H),0.0),shin)*ks*nl;
    }
    for(int i=0;i<8;i++){
      if(i>=uNL) break;
      vec3 L=uLP[i]-vW; float dist=length(L); vec3 l=L/max(dist,0.001);
      float a=clamp(1.0-dist/uLR[i],0.0,1.0); a*=a;
      float nl=max(dot(n,l),0.0);
      d+=uLC[i]*a*(0.18+0.82*nl);
      vec3 H=normalize(l+V); spec+=uLC[i]*a*pow(max(dot(n,H),0.0),shin)*ks*nl;
    }
    if(abs(n.y)<0.5){ float base = vW.y>2.95?3.0:0.0; float y=vW.y-base;
      d*=mix(0.5,1.0,clamp(y*1.3,0.0,1.0)); if(indoor) d*=mix(1.0,0.82,clamp((y-2.3)*2.0,0.0,1.0)); }
    lit = alb*d + spec;
  }
  lit*=uTint;
  if(uHi>0.0){ float fr=pow(1.0-max(dot(n,V),0.0),2.0); lit+=vec3(1.0,0.78,0.35)*uHi*(0.12+0.55*fr)*(0.75+0.25*sin(uTime*5.0)); }
  float fd=length(vW-uCam);
  float f=clamp((fd-uFogN)/(uFogF-uFogN),0.0,1.0);
  lit=mix(lit,lin(uFog),f);
  vec3 outc = aces(lit*uExpo);
  outc = pow(outc, vec3(1.0/2.2));
  gl_FragColor=vec4(outc, vE.z*uAlpha);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let skyBuf;
  function init(c, opts) {
    canvas = c;
    const attrs = { antialias: !!(opts && opts.aa), alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL is not supported by this browser');
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    ['aPos', 'aNor', 'aCol', 'aEx'].forEach(n => A[n] = gl.getAttribLocation(prog, n));
    ['uVP', 'uM', 'uAmbIn', 'uAmbOut', 'uSunDir', 'uSunCol', 'uLP', 'uLC', 'uLR', 'uNL', 'uFog', 'uFogN', 'uFogF', 'uCam',
      'uWin', 'uTime', 'uHi', 'uDust', 'uDustCol', 'uAlpha', 'uExpo', 'uSkyTop', 'uSkyHor', 'uNight', 'uTint']
      .forEach(n => U[n] = gl.getUniformLocation(prog, n));
    const sky = []; pushBox(sky, 0, 0, 0, 1, 1, 1, [1, 1, 1], 100, 0, 1, 0);
    skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sky), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  function addBox(cx, cy, cz, w, h, d, col, pat, indoor, em, r) { pushBox(staticData, cx, cy, cz, w, h, d, col, pat, em, 1, indoor, r); }
  function buildStatic() {
    staticBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(staticData), gl.STATIC_DRAW);
    staticCount = staticData.length / STRIDE; staticData = null;
  }
  function attribs() {
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(A.aPos); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(A.aNor); gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, B, 12);
    gl.enableVertexAttribArray(A.aCol); gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, B, 24);
    gl.enableVertexAttribArray(A.aEx); gl.vertexAttribPointer(A.aEx, 4, gl.FLOAT, false, B, 36);
  }
  // build a model's buffer from its local-space parts
  function buildModel(m) {
    const arr = []; let trans = false;
    for (const p of m.parts) {
      const a = p.a == null ? 1 : p.a; if (a < 0.999) trans = true;
      pushBox(arr, p.o[0], p.o[1], p.o[2], p.s[0], p.s[1], p.s[2], p.c, p.pat, p.em || m.em, a, m.indoor !== false, p.r);
    }
    if (m._buf) gl.deleteBuffer(m._buf);
    m._buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, m._buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    m._n = arr.length / STRIDE; m._trans = trans; m.dirty = false;
  }
  function freeModel(m) { if (m && m._buf) { gl.deleteBuffer(m._buf); m._buf = null; } }

  // ---------- matrices ----------
  function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function lookAt(e, c, up) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
    let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
    l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    return [sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * e[0] + sy * e[1] + sz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), (fx * e[0] + fy * e[1] + fz * e[2]), 1];
  }
  function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const MM = new Float32Array(16);
  function modelMatrix(m) {
    const r = m.rotY || 0, c = Math.cos(r), s = Math.sin(r), k = m.scale || 1;
    const px = m.pitch || 0;
    if (m.roll) { // R = Ry * Rx * Rz  (used for clock hands)
      const cp = Math.cos(px), sp = Math.sin(px), cr = Math.cos(m.roll), sr = Math.sin(m.roll);
      const A = [[c, s * sp, s * cp], [0, cp, -sp], [-s, c * sp, c * cp]];
      const B = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
      for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) MM[col * 4 + row] = (A[row][0] * B[0][col] + A[row][1] * B[1][col] + A[row][2] * B[2][col]) * k;
      MM[3] = MM[7] = MM[11] = 0;
    } else if (px) { // rotation X then Y (used for held tools)
      const cp = Math.cos(px), sp = Math.sin(px);
      MM[0] = c * k; MM[1] = 0; MM[2] = -s * k; MM[3] = 0;
      MM[4] = s * sp * k; MM[5] = cp * k; MM[6] = c * sp * k; MM[7] = 0;
      MM[8] = s * cp * k; MM[9] = -sp * k; MM[10] = c * cp * k; MM[11] = 0;
    } else {
      MM[0] = c * k; MM[1] = 0; MM[2] = -s * k; MM[3] = 0;
      MM[4] = 0; MM[5] = k; MM[6] = 0; MM[7] = 0;
      MM[8] = s * k; MM[9] = 0; MM[10] = c * k; MM[11] = 0;
    }
    MM[12] = m.pos[0]; MM[13] = m.pos[1]; MM[14] = m.pos[2]; MM[15] = 1;
    return MM;
  }

  // ---------- frame timing / dynamic resolution ----------
  let frames = 0, acc = 0, lastT = performance.now();
  function tickFps() {
    const now = performance.now(); acc += now - lastT; lastT = now; frames++;
    if (acc >= 1000) {
      stats.fps = frames * 1000 / acc; frames = 0; acc = 0;
      if (quality.auto) {
        if (stats.fps < 42 && quality.scale > 0.45) quality.scale = Math.max(0.45, quality.scale - 0.1);
        else if (stats.fps > 57 && quality.scale < quality.maxScale) quality.scale = Math.min(quality.maxScale, quality.scale + 0.05);
      }
    }
  }

  function setUniformsEnv(cam, env, VP) {
    gl.uniformMatrix4fv(U.uVP, false, new Float32Array(VP));
    gl.uniform3fv(U.uAmbIn, env.ambIn); gl.uniform3fv(U.uAmbOut, env.ambOut);
    gl.uniform3fv(U.uSunDir, env.sunDir); gl.uniform3fv(U.uSunCol, env.sunCol);
    // choose nearest lights to the camera
    const maxL = Math.min(8, quality.lights);
    const ls = env.lights.slice().sort((a, b) => dist2(a.p, cam.eye) - dist2(b.p, cam.eye)).slice(0, maxL);
    const lp = new Float32Array(24), lc = new Float32Array(24), lr = new Float32Array(8);
    ls.forEach((l, i) => { lp.set(l.p, i * 3); const k = l.i * (l.f == null ? 1 : l.f); lc[i * 3] = l.c[0] * k; lc[i * 3 + 1] = l.c[1] * k; lc[i * 3 + 2] = l.c[2] * k; lr[i] = l.r; });
    gl.uniform3fv(U.uLP, lp); gl.uniform3fv(U.uLC, lc); gl.uniform1fv(U.uLR, lr); gl.uniform1i(U.uNL, ls.length);
    gl.uniform3fv(U.uFog, env.fog); gl.uniform1f(U.uFogN, env.fogN); gl.uniform1f(U.uFogF, env.fogF);
    gl.uniform3fv(U.uCam, cam.eye); gl.uniform3fv(U.uWin, env.win); gl.uniform1f(U.uTime, env.time);
    gl.uniform1f(U.uExpo, env.expo || 1.0);
    gl.uniform3fv(U.uSkyTop, env.skyTop); gl.uniform3fv(U.uSkyHor, env.skyHor); gl.uniform1f(U.uNight, env.night || 0);
    gl.uniform3fv(U.uTint, env.tint || [1, 1, 1]);
  }
  function dist2(a, b) { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; }

  function render(cam, models, env, overlayModels) {
    tickFps();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    stats.scale = quality.scale;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * quality.scale)), h = Math.max(1, Math.floor(canvas.clientHeight * dpr * quality.scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const P = persp(cam.fov || 1.2, w / h, 0.04, 160);
    const Vm = lookAt(cam.eye, cam.target, [0, 1, 0]);
    const VP = mul(P, Vm);
    gl.useProgram(prog);
    setUniformsEnv(cam, env, VP);
    stats.calls = 0;
    gl.uniform1f(U.uHi, 0); gl.uniform1f(U.uDust, 0); gl.uniform1f(U.uAlpha, 1);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); attribs();
    MM.set(IDENT); MM[0] = MM[5] = MM[10] = 200; MM[12] = cam.eye[0]; MM[13] = cam.eye[1]; MM[14] = cam.eye[2];
    gl.uniformMatrix4fv(U.uM, false, MM); gl.drawArrays(gl.TRIANGLES, 0, 36); stats.calls++;
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    // static
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf); attribs();
    gl.uniformMatrix4fv(U.uM, false, IDENT);
    gl.drawArrays(gl.TRIANGLES, 0, staticCount); stats.calls++;
    // dynamic
    const trans = [];
    for (const m of models) {
      if (!m.visible || m.ghost) continue;
      if (!m._buf || m.dirty) buildModel(m);
      if (m._trans || (m.alpha != null && m.alpha < 1)) { trans.push(m); continue; }
      drawModel(m);
    }
    if (trans.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for (const m of trans) drawModel(m);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    if (overlayModels && overlayModels.length) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      for (const m of overlayModels) { if (!m.visible) continue; if (!m._buf || m.dirty) buildModel(m); drawModel(m); }
    }
  }
  function drawModel(m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m._buf); attribs();
    gl.uniformMatrix4fv(U.uM, false, modelMatrix(m));
    gl.uniform1f(U.uHi, m.hi ? 1 : 0);
    gl.uniform1f(U.uDust, m.dust || 0);
    if (m.dust) gl.uniform3fv(U.uDustCol, m.dustCol || [0.55, 0.53, 0.49]);
    gl.uniform1f(U.uAlpha, m.alpha == null ? 1 : m.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, m._n); stats.calls++;
  }

  function setQuality(q) { Object.assign(quality, q); if (quality.maxScale == null) quality.maxScale = 1; if (!quality.auto) quality.scale = quality.maxScale; }

  return { init, addBox, buildStatic, render, buildModel, freeModel, setQuality, stats, get quality() { return quality; } };
})();
