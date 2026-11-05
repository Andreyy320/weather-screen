/* ---------- реалистичное небо: WebGL-шейдер ---------- */
  var cv = $('bg'), vid = $('vid');
  var QS = parseFloat(params.q) || 0.5;            // качество: 0.5 = половина разрешения (мягче и легче). ?q=1 — максимум
  cv.width = Math.round(SW * QS); cv.height = Math.round(SH * QS);
  var gl = null, prog = null, U = {}, hasGL = false;
  var SKY = { cover: 0.3, dark: 0, rain: 0, snow: 0, fog: 0, day: 1, sun: 1, sx: 0.4, sy: 0.7, drift: 0, flash: 0 };
  var nextFlash = Date.now() + 4000, t0 = Date.now(), lastT = 0;

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 res; uniform vec2 sp;',
    'uniform float t, cover, dark, rain, snow, fog, day, sun, drift, flash;',

    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }',
    'float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }',

    'float rainL(vec2 uv,float asp,float sc,float spd,float seed){',
    '  vec2 p=vec2(uv.x*asp+uv.y*0.3, uv.y);',
    '  float col=floor(p.x*sc); float fx=fract(p.x*sc);',
    '  float h=hash(vec2(col,seed));',
    '  float y=fract(p.y*0.9+t*spd*(0.8+h*0.5)+h*9.0);',
    '  float w=1.0-smoothstep(0.0,0.16,abs(fx-0.5));',
    '  float s=pow(1.0-y,10.0)*smoothstep(0.0,0.02,y);',
    '  return w*s*step(0.45,h); }',

    'float snowL(vec2 uv,float asp,float sc,float spd,float seed){',
    '  vec2 g=vec2(uv.x*asp,uv.y)*sc;',
    '  g.y+=t*spd; g.x+=sin(t*0.6+g.y*1.7+seed)*0.35;',
    '  vec2 id=floor(g); vec2 f=fract(g)-0.5;',
    '  float h=hash(id+seed);',
    '  vec2 o=vec2(hash(id+seed+3.1),hash(id+seed+7.7))-0.5;',
    '  float d=length(f-o*0.6);',
    '  return (1.0-smoothstep(0.02,0.11,d))*step(0.55,h); }',

    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/res; float asp=res.x/res.y;',

    /* небо */
    '  vec3 topD=vec3(0.09,0.36,0.83), horD=vec3(0.60,0.80,0.98);',
    '  vec3 topN=vec3(0.012,0.03,0.11), horN=vec3(0.07,0.13,0.30);',
    '  vec3 top=mix(topN,topD,day), hor=mix(horN,horD,day);',
    '  vec3 sky=mix(hor,top,pow(uv.y,0.8));',
    '  float lum=dot(sky,vec3(0.333));',
    '  vec3 grey=vec3(lum)*vec3(0.92,0.97,1.04)*(1.0-dark*0.55);',
    '  sky=mix(sky,grey,clamp(cover*0.5+dark*0.5,0.0,1.0));',

    /* солнце: свечение за облаками */
    '  vec2 d2=(uv-sp)*vec2(asp,1.0); float dist=length(d2);',
    '  float sunI=sun*day;',
    '  vec3 sunCol=vec3(1.0,0.93,0.72);',
    '  sky+=sunCol*(exp(-dist*5.5)*0.45+exp(-dist*16.0)*0.55)*sunI;',

    /* ночь: звёзды и луна */
    '  float nightK=1.0-day;',
    '  vec2 sg=uv*vec2(asp*60.0,60.0); vec2 sid=floor(sg); float shh=hash(sid);',
    '  float st=step(0.985,shh)*(1.0-smoothstep(0.0,0.35,length(fract(sg)-0.5)))*(0.6+0.4*sin(t*2.0+shh*60.0));',
    '  sky+=vec3(1.0)*st*nightK*(1.0-cover*0.9)*(0.3+0.7*uv.y);',
    '  vec2 mp=vec2(0.72,0.66); float md=length((uv-mp)*vec2(asp,1.0));',
    '  float moon=1.0-smoothstep(0.043,0.05,md);',
    '  sky=mix(sky,vec3(0.95,0.96,0.9)*(0.9+0.1*noise(uv*vec2(asp,1.0)*40.0)),moon*nightK);',
    '  sky+=vec3(0.5,0.6,0.9)*exp(-md*7.0)*0.35*nightK*(1.0-cover*0.5);',

    /* облака */
    '  vec2 q=vec2(uv.x*asp*1.1+drift, uv.y*1.9);',
    '  float n=fbm(q+vec2(0.0,3.0));',
    '  float n2=fbm(q*2.3+vec2(drift*0.6,7.0));',
    '  float nn=n*0.75+n2*0.25;',
    '  float th=mix(0.74,0.30,cover);',
    '  float c=smoothstep(th,th+0.22,nn);',
    '  vec2 ld=normalize(vec2((sp.x-uv.x)*asp,(sp.y-uv.y))+0.0001)*0.06;',
    '  float nl=fbm(q+ld*3.0+vec2(0.0,3.0));',
    '  float lit=clamp(0.5+(n-nl)*4.5,0.0,1.0);',
    '  vec3 litC=mix(vec3(1.0,0.99,0.96),vec3(0.78,0.80,0.86),dark);',
    '  vec3 shC=mix(vec3(0.52,0.62,0.80),vec3(0.20,0.23,0.30),dark);',
    '  float core=smoothstep(th+0.1,th+0.45,nn);',
    '  vec3 cc=mix(shC,litC,lit);',
    '  cc=mix(cc,shC*0.85,core*0.45*(0.4+dark));',
    '  vec3 nightTint=vec3(0.16,0.20,0.34);',
    '  cc=mix(nightTint*(0.5+0.5*lit),cc,day);',
    '  cc+=sunCol*exp(-dist*3.0)*sunI*0.35*(1.0-core*0.7);',
    '  sky=mix(sky,cc,c*mix(0.96,1.0,dark));',

    /* диск солнца и блики объектива — поверх, но сквозь облака */
    '  float tr=1.0-c;',
    '  float disc=1.0-smoothstep(0.03,0.055,dist);',
    '  sky+=vec3(1.0,0.98,0.9)*disc*1.4*sunI*tr+sunCol*exp(-dist*30.0)*sunI*tr*0.6;',
    '  vec2 ax=vec2(0.5,0.5)-sp;',
    '  float g1=length((uv-(sp+ax*0.45))*vec2(asp,1.0));',
    '  float g2=length((uv-(sp+ax*0.9))*vec2(asp,1.0));',
    '  sky+=vec3(1.0,0.8,0.5)*(1.0-smoothstep(0.0,0.07,g1))*0.05*sunI*tr;',
    '  sky+=vec3(0.6,0.8,1.0)*(1.0-smoothstep(0.0,0.11,g2))*0.04*sunI*tr;',

    /* туман */
    '  float fg=fbm(vec2(uv.x*asp*0.9+drift*0.5,uv.y*1.5)+5.0);',
    '  vec3 fogC=mix(vec3(0.18,0.22,0.30),vec3(0.80,0.84,0.88),day);',
    '  sky=mix(sky,fogC*(0.85+0.3*fg),clamp(fog*(0.55+0.4*fg),0.0,1.0));',

    /* дождь */
    '  float r=rainL(uv,asp,38.0,1.5,1.0)+rainL(uv,asp,60.0,2.0,2.0)*0.8+rainL(uv,asp,95.0,2.7,3.0)*0.6;',
    '  sky+=vec3(0.75,0.85,1.0)*r*0.5*rain;',
    '  sky=mix(sky,vec3(0.5,0.58,0.7)*mix(0.35,1.0,day),rain*0.18*(1.0-uv.y));',

    /* снег */
    '  float s=snowL(uv,asp,10.0,0.35,1.0)+snowL(uv,asp,18.0,0.55,2.0)*0.8+snowL(uv,asp,32.0,0.8,3.0)*0.6;',
    '  sky+=vec3(1.0)*s*snow*0.9;',

    /* молния */
    '  sky+=vec3(0.7,0.76,1.0)*flash*(0.3+0.7*c)*0.9;',

    /* виньетка и дизеринг против бандинга */
    '  sky*=1.0-0.16*pow(abs(uv.x-0.5)*2.0,2.0);',
    '  sky+=(hash(gl_FragCoord.xy+fract(t))-0.5)*0.012;',
    '  gl_FragColor=vec4(clamp(sky,0.0,1.0),1.0);',
    '}'
  ].join('\n');

  function initGL() {
    try { gl = cv.getContext('webgl', { antialias: false, alpha: false }) || cv.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return false;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) { if (window.console) console.log(e); gl = null; return false; }
    gl.useProgram(prog);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['res','sp','t','cover','dark','rain','snow','fog','day','sun','drift','flash'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.viewport(0, 0, cv.width, cv.height);
    return true;
  }
  hasGL = initGL();

  /* запасной вариант, если у устройства нет WebGL: простой градиент */
  var THEMES = {
    clear_day: ['#1a6ee0', '#8fd2ff'], clear_night: ['#050c26', '#1b3178'],
    clouds_day: ['#3a63a6', '#8db4e0'], clouds_night: ['#0b1632', '#2b4170'],
    fog: ['#566f93', '#aebfd4'], rain: ['#16284c', '#41639a'],
    snow: ['#294670', '#8eaed4'], storm: ['#0a0e22', '#2d3666']
  };
  function themeKey() {
    var c = weather.cat;
    if (c === 'clear') return weather.day ? 'clear_day' : 'clear_night';
    if (c === 'clouds') return weather.day ? 'clouds_day' : 'clouds_night';
    return c;
  }
  var fbKey = '';
  function fallbackBg() {
    var k = themeKey(); if (k === fbKey) return; fbKey = k;
    var th = THEMES[k] || THEMES.clouds_day;
    stage.style.background = 'linear-gradient(180deg,' + th[0] + ',' + th[1] + ')';
  }

  function requestScene() {}
  function buildScene() {}

  /* целевые параметры неба по текущей погоде */
  function targets() {
    var c = weather.cat, code = weather.code, cl = (typeof weather.cloud === 'number') ? weather.cloud / 100 : 0.3;
    var T = { cover: 0.2, dark: 0, rain: 0, snow: 0, fog: 0, sun: 1 };
    if (c === 'clear') { T.cover = (code === 1 ? 0.28 : 0.08) + 0.2 * cl; }
    else if (c === 'clouds') { T.cover = code === 2 ? 0.5 : 0.86; T.dark = code === 3 ? 0.25 : 0; T.sun = code === 2 ? 1 : 0.5; }
    else if (c === 'fog') { T.cover = 0.55; T.fog = 1; T.dark = 0.1; T.sun = 0.3; }
    else if (c === 'rain') { T.cover = 0.95; T.dark = 0.6; T.rain = (code === 51 || code === 53 || code === 61) ? 0.55 : 1; T.sun = 0; }
    else if (c === 'snow') { T.cover = 0.85; T.dark = 0.15; T.snow = (code === 71) ? 0.6 : 1; T.sun = 0.1; }
    else if (c === 'storm') { T.cover = 1; T.dark = 0.9; T.rain = 1; T.sun = 0; }
    T.day = weather.day ? 1 : 0;
    return T;
  }
  /* солнце идёт по дуге от восхода до заката */
  function sunPos() {
    var d = localNow(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    function hm(s) { var p = (s || '').split(':'); return p.length > 1 ? (+p[0]) + (+p[1]) / 60 : NaN; }
    var a = hm(weather.sr), b = hm(weather.ss);
    if (isNaN(a)) a = 7; if (isNaN(b)) b = 17;
    var p = Math.max(0, Math.min(1, (h - a) / (b - a)));
    return [0.12 + 0.76 * p, 0.38 + 0.42 * Math.sin(Math.PI * p)];
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastT < 1000 / FPS) return;
    var dt = Math.min(0.2, (ts - lastT) / 1000 || 0.04); lastT = ts;
    if (!hasGL) { fallbackBg(); return; }

    var T = targets(), k = 1 - Math.exp(-dt / 1.6), key;
    for (key in T) SKY[key] += (T[key] - SKY[key]) * k;
    var sp = sunPos(); SKY.sx = sp[0]; SKY.sy = sp[1];
    SKY.drift += dt * (0.012 + (weather.wind || 3) * 0.0025);

    var now = Date.now();
    if (weather.cat === 'storm' && now > nextFlash) {
      SKY.flash = 1; nextFlash = now + 4000 + Math.random() * 5000;
      if (Math.random() < 0.5) setTimeout(function () { SKY.flash = 0.9; }, 140);
    }
    SKY.flash *= 0.88; if (SKY.flash < 0.01) SKY.flash = 0;

    gl.uniform2f(U.res, cv.width, cv.height);
    gl.uniform2f(U.sp, SKY.sx, SKY.sy);
    gl.uniform1f(U.t, ((now - t0) / 1000) % 600);
    gl.uniform1f(U.cover, SKY.cover); gl.uniform1f(U.dark, SKY.dark);
    gl.uniform1f(U.rain, SKY.rain); gl.uniform1f(U.snow, SKY.snow);
    gl.uniform1f(U.fog, SKY.fog); gl.uniform1f(U.day, SKY.day);
    gl.uniform1f(U.sun, SKY.sun); gl.uniform1f(U.drift, SKY.drift);
    gl.uniform1f(U.flash, SKY.flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* необязательно: настоящее видео неба. Положи файлы в папку bg/ и открой страницу с ?video=1
     имена: clear_day, clear_night, clouds_day, clouds_night, fog, rain, snow, storm  (.mp4) */
  var vidKey = '';
  function updateVideo() {
    if (params.video !== '1') return;
    var key = themeKey(); if (key === vidKey) return; vidKey = key;
    vid.style.opacity = 0;
    vid.muted = true;
    vid.onerror = function () { vid.style.opacity = 0; };
    vid.oncanplay = function () { vid.style.opacity = 1; var p = vid.play(); if (p && p.catch) p.catch(function () {}); };
    vid.src = 'bg/' + key + '.mp4';
  }
  setInterval(updateVideo, 2000);