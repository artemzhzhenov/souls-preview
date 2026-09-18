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
import { FRAMES, GLOW, BEATS, RING, REEL } from './beats.js';

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

/* Точка взгляда остановки с учётом бокового сдвига aside.
 *
 * В beats.js look — центр кадра, aside — на сколько единиц кадр должен стоять
 * правее центра экрана. Сдвиг откладывается влево от look вдоль
 * горизонтальной «правой» оси камеры на этой остановке, поэтому не зависит
 * от того, куда камера повёрнута: на титуле она смотрит вглубь по −Z, на
 * финале — обратно по +Z, формула одна.
 *
 * Узкий экран (< 900px по ширине окна) — другая композиция вовсе: сдвига нет,
 * кадр стоит по центру за текстом (см. room.css), функция возвращает
 * несдвинутую точку взгляда. Зажим до 82 % от доступной половины
 * горизонтального угла работает только на ширине ≥ 900px и только в полосе
 * aspect < REF_ASPECT (1440/900) — там, где горизонтальный угол уже опорного
 * настолько, что несжатый сдвиг увёл бы точку взгляда мимо кадра. На широких
 * экранах с aspect ≥ REF_ASPECT aside берётся как есть.
 *
 * aspect — свойство окна, не устройства: поворот телефона меняет его на лету.
 * Функция чистая и зовётся из resize() на каждый поворот, поэтому поворот в
 * альбом возвращает полный сдвиг, а не оставляет суженный навсегда. */
const REF_ASPECT = 1440 / 900;
const upVec = new THREE.Vector3(0, 1, 0);
const fwdVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();

function lookOf(beat, out) {
  out.set(beat.look[0], beat.look[1], beat.look[2]);
  const aside = beat.aside || 0;
  if (!aside) return out;
  // Горизонтальная проекция направления взгляда: сдвиг вбок не должен
  // задирать или ронять точку взгляда, если камера смотрит под наклоном.
  fwdVec.set(beat.look[0] - beat.cam[0], 0, beat.look[2] - beat.cam[2]);
  const dist = fwdVec.length();
  if (dist < 1e-6) return out;
  fwdVec.divideScalar(dist);
  let shift = aside;
  // Узкий экран — другая композиция: кадр по центру ЗА текстом (спека,
  // «Текст поверх полноэкранных кадров»); тот же порог 900px, что включает
  // тени под текст в room.css. Сдвиг вбок тут только уводил бы кадр вправо:
  // по ширине он и так шире экрана. Порог по ширине окна, а не по aspect:
  // окно 1200×900 по CSS широкое (без теней), а по aspect — уже опорного.
  if (window.innerWidth < 900) return out;
  const aspect0 = window.innerWidth / window.innerHeight;
  if (aspect0 < REF_ASPECT) {
    // THREE.MathUtils нет в слим-сборке (assets/vendor/three.slim.js) —
    // перевод градусов в радианы руками.
    const halfV = (camera.fov / 2) * (Math.PI / 180);
    const halfH = Math.atan(Math.tan(halfV) * aspect0);
    shift = Math.min(aside, Math.tan(halfH * 0.82) * dist);
  }
  rightVec.crossVectors(fwdVec, upVec);
  return out.addScaledVector(rightVec, -shift);
}
camera.lookAt(lookOf(BEATS[0], new THREE.Vector3()));

const group = new THREE.Group();
scene.add(group);

/* Кольцо копий (см. RING в beats.js). Группа стоит в центре кольца, дети —
 * в локальных координатах круга; масштаб группы сжимает кольцо на узком
 * экране (resize()), вращение делается не поворотом группы, а движением
 * детей по кругу в spinRing(): копии должны смотреть на камеру, а поворот
 * группы ломал бы их ориентацию. */
const ring = new THREE.Group();
ring.position.set(RING.center[0], RING.center[1], RING.center[2]);
scene.add(ring);
let ringAngle = 0;

/* Только для проверок из Playwright (план 2026-09-17). Код страницы этим
 * не пользуется. */
export const probe = { group: group, ring: ring, reel: null };

/* ── Кадры ──────────────────────────────────────────────────────────────── */
const geometry = new THREE.PlaneGeometry(1, 1);

/* Доля полустороны, на которой кадр растворяется в темноте. Задаётся по
 * вертикали; по горизонтали пересчитывается из пропорций кадра, чтобы полоса
 * растушёвки была одинаковой ширины со всех четырёх сторон. */
const FEATHER = 0.62;

/* Материал кадра: общий для фотографий и для видео на финале.
 * Пропорции нужны для порога растушёвки по горизонтали (см. FRAG).
 * side задаётся только при doubleSided: THREE.FrontSide в срезе не
 * экспортирован, а `side: undefined` Material.setValues встречает
 * предупреждением; отсутствие ключа даёт FrontSide по умолчанию. */
function makeMaterial(texture, aspect, doubleSided) {
  const featherX = 1.0 - (1.0 - FEATHER) / aspect;
  const params = {
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: 1.0 },
      uFeather: { value: new THREE.Vector2(featherX, FEATHER) },
      uFog: uFog
    },
    transparent: true,
    depthWrite: false
  };
  if (doubleSided) params.side = THREE.DoubleSide;
  return new THREE.ShaderMaterial(params);
}

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
  const material = makeMaterial(texture, aspect, true);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(spec.height * aspect, spec.height, 1);
  mesh.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  mesh.rotation.y = spec.rotY;
  // Помечаем каст отдельно от отсечения по дистанции в cull() — см.
  // комментарий у CAST_IDS выше.
  mesh.userData.cast = CAST_IDS.has(spec.id);
  mesh.userData.id = spec.id;
  return mesh;
}

/* Копия кадра для кольца: та же геометрия и тот же материал, что у
 * оригинала в коридоре, — текстура одна на двоих, лишних загрузок нет.
 * Слот по индексу кадра в FRAMES, а не по порядку загрузки: копии не
 * должны меняться местами от того, какая картинка доехала первой. */
function addToRing(spec, img) {
  const original = group.children.find(function (m) { return m.userData.id === spec.id; });
  if (!original) return;
  const aspect = img.naturalWidth / img.naturalHeight;
  const copy = new THREE.Mesh(geometry, original.material);
  copy.scale.set(RING.height * aspect, RING.height, 1);
  copy.userData.slot = FRAMES.indexOf(spec) / FRAMES.length;
  ring.add(copy);
  placeRing();
}

/* Расставляет копии по кругу под текущим углом и разворачивает к камере.
 * Группа не повёрнута и масштабирована равномерно, поэтому кватернион
 * камеры можно копировать в детей напрямую. */
function placeRing() {
  for (let i = 0; i < ring.children.length; i++) {
    const copy = ring.children[i];
    const a = (copy.userData.slot + ringAngle) * Math.PI * 2;
    copy.position.set(Math.cos(a) * RING.radius, 0, Math.sin(a) * RING.radius);
    copy.quaternion.copy(camera.quaternion);
  }
}

/* Оборот за RING.period секунд; в цикле без движения не зовётся. */
function spinRing(dt) {
  ringAngle = (ringAngle + dt / RING.period) % 1;
  placeRing();
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
      addToRing(spec, img);
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

/* ── Видео на финале ────────────────────────────────────────────────────── */
/* <video> из секции follow — и фолбэк, и источник текстуры, как <img> у
 * кадров. Три правила:
 *   1. Ни байта видео, пока читатель не доехал до «Следующей книги»: за одну
 *      остановку до финала, не раньше — на первый экран ролик не давит.
 *   2. Играет только пока финал на экране: телефон не греется на остановке,
 *      где видео не видно.
 *   3. Звук включает только кнопка. Автозапуск — всегда muted. */
let reelVideo = null;
let reelMesh = null;
let followVisible = false;

function syncReelPlayback() {
  // Пока меша нет, играть нечего: до loadeddata видео — обычная фигура в
  // вёрстке, и play() тут запустил бы её со звуком.
  if (!reelMesh) return;
  if (followVisible && !document.hidden) {
    const p = reelVideo.play();
    // Отказ в автозапуске — не ошибка сцены: фолбэк-плеер остаётся.
    if (p && p.catch) p.catch(function () {});
  } else {
    reelVideo.pause();
  }
}

function onReelReady() {
  const video = reelVideo;
  // Плеер и фокус отбираем только теперь, когда сцена действительно берёт
  // видео: если файл не доехал, фигура в вёрстке остаётся полноценной.
  video.controls = false;
  video.tabIndex = -1;
  const texture = new THREE.Texture(video);
  // Мипмапы для видео не строим: генерировать их тридцать раз в секунду
  // дорого и незачем — кадр на финале показан почти в натуральную величину.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const aspect = video.videoWidth / video.videoHeight;
  reelMesh = new THREE.Mesh(geometry, makeMaterial(texture, aspect, false));
  reelMesh.scale.set(REEL.height * aspect, REEL.height, 1);
  reelMesh.position.set(REEL.pos[0], REEL.pos[1], REEL.pos[2]);
  reelMesh.rotation.y = REEL.rotY;
  scene.add(reelMesh);
  probe.reel = reelMesh;

  const box = video.closest('.shot-video');
  if (box) {
    box.classList.add('frame-on');
    measure();
  }
  syncReelPlayback();
  render();
}

function buildReel() {
  const video = document.querySelector('video[data-frame="reel"]');
  // Без движения видео в сцену не берём: остаётся фигурой с плеером.
  if (!video || reduced.matches) return;
  reelVideo = video;
  // Звук включает только читатель. Клик — жест пользователя, браузер
  // разрешает снять muted; сами мы этого не делаем никогда.
  const soundBtn = document.querySelector('button.sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      if (!video.muted) video.volume = 1;
      soundBtn.setAttribute('aria-pressed', String(!video.muted));
      soundBtn.textContent = video.muted ? 'Sound' : 'Mute';
    });
  }
  video.addEventListener('loadeddata', onReelReady, { once: true });

  // Загрузка: как только «Следующая книга» или сам финал вошли в экран.
  // Финал тоже наблюдаем — читатель по ссылке #follow «Следующую книгу» не
  // проходит вовсе. muted — здесь, до load(): ни один play() не должен
  // застать видео со звуком.
  const loader = new IntersectionObserver(function (entries) {
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    loader.disconnect();
    video.muted = true;
    // load() под preload="none" в Safari может не дойти до loadeddata —
    // раз уж решили грузить, грузим по-настоящему. До этой строки ни байта.
    video.preload = 'auto';
    video.src = narrow ? video.dataset.srcSm : video.dataset.src;
    video.load();
  });
  loader.observe(document.getElementById('next'));
  loader.observe(document.getElementById('follow'));

  const watcher = new IntersectionObserver(function (entries) {
    followVisible = entries[0].isIntersecting;
    syncReelPlayback();
  });
  watcher.observe(document.getElementById('follow'));
}

/* Кадр видео в текстуру и провал в темноту на шве петли. Зовётся из цикла
 * на каждый отрисованный кадр; когда видео стоит, ничего не делает. */
function updateReel() {
  if (!reelMesh || reelVideo.paused || reelVideo.readyState < 2) return;
  reelMesh.material.uniforms.uMap.value.needsUpdate = true;
  const t = reelVideo.currentTime;
  const d = reelVideo.duration;
  const seam = d > 0 ? Math.max(0, Math.min(1, t / REEL.dip, (d - t) / REEL.dip)) : 1;
  reelMesh.material.uniforms.uOpacity.value = seam;
  // Со звуком шов слышен так же, как виден: громкость идёт за яркостью.
  if (!reelVideo.muted) reelVideo.volume = seam;
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
  // Видео возвращается в вёрстку плеером: controls и фокус обратно.
  if (reelVideo) {
    reelVideo.controls = true;
    reelVideo.tabIndex = 0;
    reelVideo.pause();
    reelVideo.muted = false;
    // Меш мёртв вместе с контекстом; без него syncReelPlayback() выходит
    // сразу — наблюдатель #follow больше не сможет запустить play() у
    // размьюченного видео без жеста читателя.
    reelMesh = null;
    probe.reel = null;
  }
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
  const s = narrow ? RING.narrowScale : 1;
  ring.scale.set(s, s, s);
  // Поворот телефона меняет aspect так же, как первая загрузка страницы, —
  // пересчитываем сдвиги aside всех остановок на каждый resize(). curveLook
  // объявлена ниже по файлу, но resize() при загрузке модуля не вызывается
  // ни разу — первый вызов из start(), когда кривая уже есть.
  for (let i = 0; i < BEATS.length; i++) lookOf(BEATS[i], curveLook.points[i]);
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
/* Точки взгляда — через lookOf(), не сырые BEATS[i].look: сдвиг aside и его
 * сжатие на узком экране должны попасть в саму кривую, иначе camera.lookAt()
 * при старте поставит камеру верно, а маршрут apply(t) при первом же скролле
 * потянет её к несдвинутой точке. Те же объекты Vector3 перезаписываются в
 * resize() при смене aspect — CatmullRomCurve3 читает points при каждом
 * getPoint(), кэша нет. */
const curveLook = new THREE.CatmullRomCurve3(
  BEATS.map(function (b) { return lookOf(b, new THREE.Vector3()); })
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
  const scrollMid = window.scrollY + window.innerHeight / 2;
  if (!centers.length || scrollMid <= centers[0]) return 0;
  if (scrollMid >= centers[LAST]) return LAST;
  let i = 0;
  while (i < LAST && scrollMid > centers[i + 1]) i++;
  const span = centers[i + 1] - centers[i];
  const u = span > 0 ? (scrollMid - centers[i]) / span : 0;
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
const worldVec = new THREE.Vector3();

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
  // Копии в кольце — дети группы со смещением и масштабом: сравнивать надо
  // мировую позицию, локальная тут ничего не значит. Каст в кольце не
  // гасим: карусель из вёрстки спорила с портретами в коридоре, а не с
  // кольцом над ним.
  ring.updateMatrixWorld();
  for (let i = 0; i < ring.children.length; i++) {
    const copy = ring.children[i];
    copy.getWorldPosition(worldVec);
    copy.visible = worldVec.distanceTo(camVec) < limit;
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
  spinRing(dt);
  updateReel();
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
  placeRing();
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
buildReel();
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
    syncReelPlayback();
    return;
  }
  if (!reduced.matches && !running) {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }
  syncReelPlayback();
});

window.addEventListener('resize', function () {
  resize();
  measure();
  if (!running) { staticBeat = -1; settle(); }
});
