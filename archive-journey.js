(function(root, factory){
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PoppyArchiveJourneyCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const DEFAULT_SPEED = 1;
  const SPEEDS = [0.5, 1, 1.5, 2];

  function cleanIndex(value, fallback = 0){
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  }

  function cleanSpeed(value){
    const n = Number(value);
    return SPEEDS.includes(n) ? n : DEFAULT_SPEED;
  }

  function normalizeState(raw){
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      articleIndex: cleanIndex(source.articleIndex),
      blockIndex: cleanIndex(source.blockIndex),
      speed: cleanSpeed(source.speed)
    };
  }

  function nextPosition(state, blockCounts){
    const counts = Array.isArray(blockCounts) ? blockCounts : [];
    const current = normalizeState(state);
    if (!counts.length) return {articleIndex:0, blockIndex:0, done:true};

    const articleIndex = Math.min(current.articleIndex, counts.length - 1);
    const blockCount = Math.max(0, Number(counts[articleIndex]) || 0);
    if (blockCount === 0) return {articleIndex, blockIndex:0, done:true};

    const blockIndex = Math.min(current.blockIndex, blockCount - 1);
    if (blockIndex + 1 < blockCount){
      return {articleIndex, blockIndex:blockIndex + 1, done:false};
    }
    if (articleIndex + 1 < counts.length){
      return {articleIndex:articleIndex + 1, blockIndex:0, done:false};
    }
    return {articleIndex, blockIndex, done:true};
  }

  function progressPercent(articleIndex, blockIndex, blockCounts){
    const counts = Array.isArray(blockCounts) ? blockCounts.map(v => Math.max(0, Number(v) || 0)) : [];
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!total) return 0;

    const ai = Math.max(0, Math.min(cleanIndex(articleIndex), counts.length - 1));
    const completedBeforeArticle = counts.slice(0, ai).reduce((sum, n) => sum + n, 0);
    const bi = Math.max(0, cleanIndex(blockIndex));
    const completed = Math.min(total, completedBeforeArticle + bi);
    return Math.round((completed / total) * 100);
  }

  function readingDuration(text, speed){
    const length = String(text || '').trim().length;
    const base = Math.max(1500, Math.min(9000, 900 + length * 24));
    return Math.round(base / cleanSpeed(speed));
  }

  return {DEFAULT_SPEED, SPEEDS, normalizeState, nextPosition, progressPercent, readingDuration};
});
