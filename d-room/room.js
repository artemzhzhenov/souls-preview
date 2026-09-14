/* Вариант D · The Room — точка входа.
 *
 * Единственная работа этого файла — решить, запускать ли сцену. Проверка
 * живёт отдельно от сцены не ради красоты: иначе полмегабайта Three.js
 * скачивалось бы и на устройства, где WebGL недоступен, — то есть ровно
 * на самые слабые.
 */

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    // Ровно WebGL 2: вендоренный срез Three.js 0.186 запрашивает только
    // "webgl2" (единственная строка контекста в three.slim.js). Устройство
    // с одним лишь WebGL 1 калитку проходить не должно — иначе оно скачает
    // сцену и тут же получит исключение при её запуске.
    const ctx = window.WebGLRenderingContext && c.getContext('webgl2');
    // Пробный контекст сцене больше не нужен — освобождаем его сразу.
    const lose = ctx && ctx.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return !!ctx;
  } catch (e) {
    return false;
  }
}

if (document.getElementById('room') && hasWebGL()) {
  import('./scene.js').catch(function (err) {
    // Сцена не поднялась — страница остаётся обычной вёрсткой со всеми
    // кадрами. Предупреждение, а не ошибка: ничего не сломалось.
    console.warn('room: сцена не запустилась —', err && err.message);
  });
}
