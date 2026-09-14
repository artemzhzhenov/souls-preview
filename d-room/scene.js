/* Вариант D · The Room — сцена.
 *
 * Кадры романа висят в тёплой темноте на разной глубине; скролл ведёт
 * сквозь них камеру. Раскадровка — в beats.js, здесь только механика.
 *
 * Главный приём: текстурами служат те самые <img>, что лежат в разметке
 * для фолбэка. Картинка скачивается один раз, страница без WebGL читается
 * целиком сама по себе, а alt остаётся доступен экранному диктору.
 */

import * as THREE from '../assets/vendor/three.slim.js';
import { FRAMES, GLOW, BEATS } from './beats.js';

const canvas = document.getElementById('room');

/* Каст — единственное место, где кадр сцены и вёрстка спорят за одно и то
 * же фото. Ниже 900px `.cast` в shared/base.css становится свайп-каруселью
 * (карточка «фото + имя», общая для всех четырёх вариантов); в A/B/C фото
 * лежит внутри карточки и едет вместе с ней. В D фото вынуто в сцену — на
 * узком экране оно осталось бы неподвижным в пространстве, а мимо него
 * ехали бы только текстовые карточки: имя не под тем лицом, портрет виден
 * дважды. На узком экране эти три меша не показываем вовсе — работает
 * карусель из base.css, как в остальных вариантах. Используется и в cull()
 * (гасить каст-мешы), и при создании кадра (пометить, какие именно). */
const CAST_IDS = new Set(['tessa', 'sam', 'ethan']);

/* ── Материал кадра ─────────────────────────────────────────────────────── */
/* Своя пара шейдеров, а не готовый материал, ради двух вещей: мягких краёв
 * и тумана, который гасит альфу, а не подмешивает цвет.
 *
 * Почему альфу: фон страницы и цвет тумана — один и тот же --night. Если
 * подмешивать цвет и при этом рисовать полупрозрачно, дальний кадр темнеет
 * дважды и проваливается в черноту раньше времени. */
const VERT = `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec2 uFeather;
  uniform float uFog;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    // Растушёвка по каждой оси отдельно и с разными порогами.
    //
    // UV нормированы на свою сторону, а стороны у кадра 9:16 отличаются в
    // 1.78 раза: один порог на обе оси даёт по горизонтали полосу во столько
    // же раз уже, и боковые края читаются жёстким швом, тогда как верх и низ
    // растворяются. Порог по X пересчитывается из пропорций кадра при
    // создании материала.
    vec2 d = abs(vUv - 0.5) * 2.0;
    float ax = 1.0 - smoothstep(uFeather.x, 1.0, d.x);
    float ay = 1.0 - smoothstep(uFeather.y, 1.0, d.y);
    float fog = 1.0 - exp(-uFog * uFog * vDepth * vDepth);
    float a = ax * ay * uOpacity * (1.0 - fog);
    if (a < 0.004) discard;
    gl_FragColor = vec4(tex.rgb, a);
  }
`;

const GLOW_FRAG = `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, r));
    gl_FragColor = vec4(uColor, a * a * uStrength);
  }
`;

/* Плотность тумана принадлежит остановке, а не сцене целиком.
 *
 * Причина — два кадра раскадровки требуют противоположного. На «Читателях»
 * камера отъезжает на 54 единицы и должна увидеть разом все десять кадров;
 * на «Финале» кадры за спиной должны быть едва различимы. Одна плотность на
 * всю сцену обслуживает либо то, либо другое: при 0.045 с «Читателей» видны
 * только ближние пять, при 0.020 на «Финале» кадры читаются отчётливо.
 *
 * Один и тот же объект uniform передаётся всем материалам кадров, поэтому
 * значение меняется в одном месте и применяется сразу ко всем. */
const uFog = { value: BEATS[0].fog };

/* ── Рендерер и сцена ───────────────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
/* Цвет не перекодируем: текстуры отдаются как есть, вывод — тоже.
 * Так кадр в сцене совпадает по тону с тем же кадром в фолбэке и с
 * фоном --night вокруг. Физического света в сцене нет, конвертировать
 * нечего. */
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
camera.position.set(BEATS[0].cam[0], BEATS[0].cam[1], BEATS[0].cam[2]);

/* Титул смотрит на первый кадр не в лоб, а со смещением в 23.5° — на
 * широком экране это лёгкий разворот, кадр остаётся у правого края.
 * Вертикальный FOV камеры фиксирован (42°), поэтому горизонтальный
 * целиком зависит от aspect: на портретном телефоне (390×844 из плана
 * проверки — aspect ≈ 0.46) половина горизонтального FOV — около 10°,
 * меньше самого смещения. Камера в упор смотрит мимо кадра, и «rain»
 * пропадает с телефона целиком — на прежней остановке буквально нечего
 * снимать.
 *
 * На узком экране целимся в 82% от доступной половины горизонтального
 * FOV — кадр входит в конус обзора с запасом, не впритык к краю. Полностью
 * увести яркий блик у лица из-под строки .line сдвигом одной лишь камеры
 * не вышло — при любом угле, который ещё держит кадр в кадре, тёплая
 * засветка достаёт до текста; контраст для .line в этом месте отдельно
 * поднят тенью в room.css (см. комментарий там). На широких экранах
 * (aspect ≥ опорного) исходное смещение не трогаем — там всё уже
 * выверено и работает.
 *
 * aspect — не свойство устройства, а свойство текущего окна: телефон,
 * открытый в альбомной ориентации (844×390, aspect 2.16 — шире опорного
 * 1.6), проходит эту проверку не сужая смещение, а поворот в портрет
 * (390×844) меняет aspect на лету. Поэтому считаем не один раз при
 * загрузке, а функцией, которую можно звать повторно — из resize(), тем
 * же путём, каким уже пересчитывается narrow для каста. Функция также
 * обязана уметь ВЕРНУТЬ угол к исходному, если экран стал широким, — иначе
 * поворот в альбом навсегда оставил бы суженное смещение. */
function computeTitleLookX() {
  const REF_ASPECT = 1440 / 900;
  const aspect0 = window.innerWidth / window.innerHeight;
  if (aspect0 >= REF_ASPECT) return BEATS[0].look[0];
  // THREE.MathUtils нет в слим-сборке (assets/vendor/three.slim.js) — перевод
  // градусов в радианы руками, без обращения к несуществующему хелперу.
  const halfV = (camera.fov / 2) * (Math.PI / 180);
  const halfHNow = Math.atan(Math.tan(halfV) * aspect0);
  const dx = BEATS[0].look[0] - BEATS[0].cam[0];
  const dz = BEATS[0].look[2] - BEATS[0].cam[2];
  const angle = halfHNow * 0.82;
  return BEATS[0].cam[0] + Math.tan(angle) * Math.abs(dz) * Math.sign(dx);
}
const titleLook = BEATS[0].look.slice();
titleLook[0] = computeTitleLookX();
camera.lookAt(titleLook[0], titleLook[1], titleLook[2]);

const group = new THREE.Group();
scene.add(group);

/* ── Кадры ──────────────────────────────────────────────────────────────── */
const geometry = new THREE.PlaneGeometry(1, 1);

/* Доля полустороны, на которой кадр растворяется в темноте. Задаётся по
 * вертикали; по горизонтали пересчитывается из пропорций кадра, чтобы полоса
 * растушёвки была одинаковой ширины со всех четырёх сторон. */
const FEATHER = 0.62;

function makeFrame(spec, img) {
  const texture = new THREE.Texture(img);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;

  // Пропорции исходника нужны дважды: для ширины плоскости (кадры в
  // shared/img/ не все одного формата — sam-portrait шире прочих, растягивать
  // их нельзя) и для порога растушёвки по горизонтали.
  const aspect = img.naturalWidth / img.naturalHeight;
  const featherX = 1.0 - (1.0 - FEATHER) / aspect;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: 1.0 },
      uFeather: { value: new THREE.Vector2(featherX, FEATHER) },
      uFog: uFog
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(spec.height * aspect, spec.height, 1);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  mesh.rotation.y = spec.rotY;
  // Помечаем каст отдельно от отсечения по дистанции в cull() — см.
  // комментарий у CAST_IDS выше.
  mesh.userData.cast = CAST_IDS.has(spec.id);
  return mesh;
}

/* Каждый кадр встаёт в сцену сам по себе, как только его пиксели готовы.
 *
 * Два решения, которые здесь важнее, чем кажутся:
 *
 * 1. Никакого Promise.all. Камера не ждёт последнюю текстуру — на медленной
 *    сети читатель смотрел бы в пустоту, пока докачается десятый кадр.
 *
 * 2. Фолбэк-кадр прячется поштучно, классом на самом кадре, а не общим
 *    классом на документе. Спрятать все разом — значит убрать со страницы
 *    и те кадры, чьи текстуры не доехали: содержание пропало бы совсем. */
function buildFrames() {
  for (const spec of FRAMES) {
    const img = document.querySelector('img[data-frame="' + spec.id + '"]');
    if (!img) continue;
    // decode() ждёт настоящей готовности пикселей: complete бывает true
    // ещё до того, как картинка пригодна как текстура.
    const wait = img.complete && img.naturalWidth
      ? Promise.resolve()
      : img.decode().catch(function () { return null; });
    wait.then(function () {
      if (!img.naturalWidth) return;
      group.add(makeFrame(spec, img));
      const box = img.closest('.shot, .cast-frame');
      if (box) {
        box.classList.add('frame-on');
        // Кадр ушёл из потока — высоты секций изменились, маршрут надо
        // пересчитать. Десять вызовов за загрузку страницы, по одному на
        // кадр, девять чтений offsetTop каждый: цена незаметная.
        measure();
      }
      if (reduced.matches) {
        // Без requestAnimationFrame-цикла settle() сама себя не перезапустит:
        // сбрасываем remembered-остановку, чтобы её пересчитали по свежей
        // вёрстке, — иначе при восстановленной прокрутке камера так и
        // останется там, где встала до того, как кадры покинули поток.
        staticBeat = -1;
        settle();
      } else {
        render();
      }
    });
  }
}

/* Свет у остановки «Автор» — единственный объект, который не фотография. */
function buildGlow() {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0xD9A05B) },
      uStrength: { value: 0.5 }
    },
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Обе стороны, как у кадров: плоскость развёрнута на GLOW.rotY, и при
  // проезде камера проходит мимо неё с той стороны, где односторонний
  // материал просто исчез бы.
  material.side = THREE.DoubleSide;
  mesh.scale.set(GLOW.size[0], GLOW.size[1], 1);
  mesh.position.set(GLOW.pos[0], GLOW.pos[1], GLOW.pos[2]);
  mesh.rotation.y = GLOW.rotY;
  scene.add(mesh);
}

/* ── Потеря контекста ───────────────────────────────────────────────────── */
/* Браузер отбирает контекст WebGL, когда не хватает памяти или вкладка долго
 * висит в фоне, — на телефоне это не экзотика.
 *
 * Для обычной сцены потеря контекста означает замерший кадр. Здесь — хуже:
 * фолбэк-кадры спрятаны классом frame-on, и читатель остался бы с текстом
 * и без единой фотографии. Поэтому возвращаем страницу ровно в то
 * состояние, в котором она работает без WebGL: кадры обратно в вёрстку,
 * сцена выключена.
 *
 * Восстановление контекста не отслеживаем намеренно: собрать сцену заново
 * означало бы заново завести текстуры, материалы и маршрут, а страница в
 * фолбэке уже полноценна — читатель ничего не теряет, кроме движения. */
let alive = true;

canvas.addEventListener('webglcontextlost', function (e) {
  // Без preventDefault браузер не считает потерю обработанной.
  e.preventDefault();
  alive = false;
  document.documentElement.classList.remove('scene-on');
  const hidden = document.querySelectorAll('.frame-on');
  for (let i = 0; i < hidden.length; i++) hidden[i].classList.remove('frame-on');
});

/* ── Пыль ───────────────────────────────────────────────────────────────── */
/* Не эффект ради эффекта: без неё пустые остановки (пролог, автор) читаются
 * как пустой чёрный экран, а не как воздух комнаты. Частиц мало и они
 * тусклые — они дают глубину, а не блеск. */
const DUST_VERT = `
  attribute float seed;
  uniform float uTime;
  uniform float uSize;
  uniform float uDpr;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.12 + seed) * 0.35;
    p.x += cos(uTime * 0.09 + seed * 1.7) * 0.30;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    // Вблизи частицы гасим: пылинка перед самым объективом читается как
    // грязь на экране, а не как воздух.
    float near = smoothstep(0.8, 4.0, depth);
    float far = 1.0 - smoothstep(8.0, 34.0, depth);
    vAlpha = near * far * (0.25 + 0.75 * abs(sin(seed + uTime * 0.2)));
    // Обмер на «первых строках» и «авторе» показал: без нижнего порога
    // размер на среднем удалении (10–30 единиц, как раз рабочая глубина
    // этих остановок) падает ниже пикселя и точка технически рисуется —
    // альфа-канал ненулевой, — но физически неразличима на экране. Порог
    // держит пылинку на грани заметности и не трогает ближний план: там
    // формула и так даёт точку крупнее порога.
    gl_PointSize = max(uSize * uDpr / max(depth, 0.6), 3.0 * uDpr);
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * 0.5);
  }
`;

let dust = null;

function buildDust(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = 2 - Math.random() * 56;
    seeds[i] = Math.random() * 6.283;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 26 },
      uDpr: { value: 1 },
      uColor: { value: new THREE.Color(0xD9A05B) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  dust = new THREE.Points(geom, material);
  scene.add(dust);
}

/* ── Размер ─────────────────────────────────────────────────────────────── */
let dpr = 1;
/* Потолок, который опускает адаптация под слабое устройство. Обратно не
 * поднимаем: качать разрешение туда-сюда заметнее, чем просто держать
 * ниже. */
let adaptiveCap = Infinity;

/* Тот же порог, что и в shared/base.css у карусели каста
 * (`@media (max-width: 899.98px)`): 900px — граница между «уже карусель
 * из вёрстки» и «ещё сетка из трёх колонок». Обновляется в resize(), а не
 * читается заново при каждом cull() — cull() дергается каждый кадр цикла,
 * matchMedia/innerWidth там ни к чему. Пересчёт при повороте телефона —
 * через тот же resize(), см. слушатель `resize` внизу файла. */
let narrow = window.innerWidth < 900;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cap = Math.min(w < 700 ? 1.75 : 2, adaptiveCap);
  dpr = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(dpr);
  if (dust) dust.material.uniforms.uDpr.value = dpr;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  narrow = w < 900;
  // Поворот телефона меняет aspect так же, как первая загрузка страницы, —
  // пересчитываем смещение взгляда титула на каждый resize(), не только
  // один раз при старте. computeTitleLookX() объявлена выше по файлу,
  // curveLook — ниже (создаётся из titleLook на строке её объявления), но
  // сама mutating-запись ниже выполняется только здесь, внутри resize():
  // к моменту первого вызова resize() (внутри start()) curveLook уже
  // существует — resize() при загрузке модуля не вызывается ни разу.
  titleLook[0] = computeTitleLookX();
  curveLook.points[0].x = titleLook[0];
}

function render() {
  renderer.render(scene, camera);
}

/* ── Маршрут камеры ─────────────────────────────────────────────────────── */
/* Две кривые Catmull-Rom через девять остановок: одна для положения камеры,
 * вторая для точки, на которую она смотрит. Кривые, а не отрезки: по
 * ломаной камера на каждой остановке дёргалась бы изломом. */
const curveCam = new THREE.CatmullRomCurve3(
  BEATS.map(function (b) { return new THREE.Vector3(b.cam[0], b.cam[1], b.cam[2]); })
);
const curveLook = new THREE.CatmullRomCurve3(
  BEATS.map(function (b, i) {
    // Первая точка — titleLook, пересчитанный выше под текущий aspect,
    // не сырой BEATS[0].look: иначе кривая всё равно целится мимо кадра
    // «rain» на портретном экране, а camera.lookAt() выше — впустую.
    const look = i === 0 ? titleLook : b.look;
    return new THREE.Vector3(look[0], look[1], look[2]);
  })
);
const LAST = BEATS.length - 1;

/* Центры секций, а не их верх: секции бывают разной высоты (у «Эпизодов»
 * список растёт), и равномерное деление прогресса по странице развалилось
 * бы при первом же новом ролике. */
let centers = [];

function measure() {
  centers = BEATS.map(function (b) {
    const el = document.getElementById(b.id);
    return el ? el.offsetTop + el.offsetHeight / 2 : 0;
  });
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* Положение на маршруте: целое число — ровно остановка, дробь — перегон. */
function targetT() {
  const probe = window.scrollY + window.innerHeight / 2;
  if (!centers.length || probe <= centers[0]) return 0;
  if (probe >= centers[LAST]) return LAST;
  let i = 0;
  while (i < LAST && probe > centers[i + 1]) i++;
  const span = centers[i + 1] - centers[i];
  const u = span > 0 ? (probe - centers[i]) / span : 0;
  // Камера стоит, пока секция читается, и трогается с места на четверти
  // перегона: смещение занимает оставшиеся 65% и совпадает со сменой текста.
  return i + smoothstep(0.25, 0.9, u);
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

function apply(t) {
  const u = t / LAST;
  curveCam.getPoint(u, camPos);
  curveLook.getPoint(u, camLook);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Туман густеет и редеет вместе с проездом. По прямой, а не по кривой:
  // Catmull-Rom проскакивает за крайние значения, а отрицательная плотность
  // в шейдере даёт не туман, а свечение.
  const i = Math.min(LAST - 1, Math.floor(t));
  const k = t - i;
  uFog.value = BEATS[i].fog + (BEATS[i + 1].fog - BEATS[i].fog) * k;
}

/* ── Цикл ───────────────────────────────────────────────────────────────── */
let position = 0;
let lastTime = 0;
let running = false;

/* Скользящее среднее по 60 кадрам. Один тяжёлый кадр — это сборка мусора
 * или загрузка текстуры, а не слабое железо; реагировать надо на серию. */
let samples = 0;
let elapsed = 0;

/* Кадр, который туман погасил полностью, не должен доходить до шейдера:
 * discard по альфе всё равно прогоняет фрагмент по всей площади плоскости.
 * Кадров всего десять, выигрыш небольшой, но на телефоне он в заполнении
 * экрана, а не в числе объектов.
 *
 * Порог считается от текущей плотности тумана, а не фиксированной дистанцией.
 * Фиксированная отсекала бы кадры, которые на разреженном тумане «Читателей»
 * обязаны быть видны: альфа = exp(−k²d²), и порог 0.02 даёт d = 1.98/k —
 * 44 единицы при плотности 0.045 и 99 при 0.020. Одно число обслуживало бы
 * только одну остановку. */
const camVec = new THREE.Vector3();

function cull() {
  camVec.copy(camera.position);
  const limit = 1.98 / uFog.value;
  for (let i = 0; i < group.children.length; i++) {
    const mesh = group.children[i];
    // На узком экране каст живёт в вёрстке (карусель из base.css, фото
    // внутри карточки) — эти три меша в сцене гасим целиком, иначе портрет
    // виден и в карточке, и в пространстве одновременно. См. CAST_IDS.
    if (narrow && mesh.userData.cast) { mesh.visible = false; continue; }
    mesh.visible = mesh.position.distanceTo(camVec) < limit;
  }
}

function budget(dt) {
  elapsed += dt * 1000;
  samples++;
  if (samples < 60) return;
  const avg = elapsed / samples;
  samples = 0;
  elapsed = 0;
  if (avg > 22 && dpr > 1) {
    adaptiveCap = Math.max(1, dpr - 0.25);
    resize();
  }
}

function frame(now) {
  if (!running || !alive) return;
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  budget(dt);

  // Экспоненциальное сглаживание: колесо мыши даёт скачки по сто пикселей,
  // камера не должна их повторять.
  const target = targetT();
  position += (target - position) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - position) < 0.0002) position = target;

  apply(position);
  if (dust) dust.material.uniforms.uTime.value = now / 1000;
  cull();
  render();
  requestAnimationFrame(frame);
}

/* ── Запуск ─────────────────────────────────────────────────────────────── */
/* Камерой управляет JS, поэтому общее правило «animation: none» из
 * base.css её не касается — запрос читаем сами. */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* Без движения: камера переставляется на ближайшую остановку и сцена
 * рисуется один раз. Никакого непрерывного цикла. */
let staticBeat = -1;
let staticQueued = false;

function settle() {
  staticQueued = false;
  const beat = Math.round(targetT());
  if (beat === staticBeat) return;
  staticBeat = beat;
  apply(beat);
  cull();
  render();
}

function onStaticScroll() {
  if (staticQueued) return;
  staticQueued = true;
  requestAnimationFrame(settle);
}

function start() {
  measure();
  resize();
  if (reduced.matches) {
    settle();
    window.addEventListener('scroll', onStaticScroll, { passive: true });
    return;
  }
  position = targetT();
  apply(position);
  render();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

document.documentElement.classList.add('scene-on');
buildGlow();
if (!reduced.matches) buildDust(window.innerWidth < 700 ? 250 : 600);
buildFrames();
start();

/* Страховка на поздние сдвиги вёрстки: шрифты, подгрузка, смена ориентации.
 * Основной пересчёт центров идёт в buildFrames, по факту скрытия каждого
 * кадра, — сюда событие load почти всегда приходит слишком рано. */
window.addEventListener('load', measure);

/* Скрытая вкладка не должна греть телефон. Проверки «сцена в кадре» нет:
 * canvas растянут на весь экран и виден всегда, пока видна страница. */
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    running = false;
    return;
  }
  if (!reduced.matches && !running) {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }
});

window.addEventListener('resize', function () {
  resize();
  measure();
  if (!running) { staticBeat = -1; settle(); }
});
