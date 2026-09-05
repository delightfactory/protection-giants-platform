// @ts-expect-error - bidi-js is a pure JavaScript package without bundled type declarations
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

export type VisualRun = {
  text: string;
  level: number;
};

/**
 * Reorders a text string into visual runs governed by the Unicode Bidirectional Algorithm (UAX #9).
 * - Determines paragraph direction and character embedding levels according to UAX #9.
 * - Segments text into contiguous directional runs with matching embedding levels.
 * - Applies UAX #9 rule L2 to reorder runs into visual left-to-right coordinate sequence.
 * - Leaves glyph-level cursive shaping to OpenType font engines (e.g. fontkit) for RTL runs.
 */
export function getVisualRuns(text: string): VisualRun[] {
  if (!text) return [];

  // Fast-path: if text contains no RTL characters, return as a single LTR run
  const hasRtl = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text);
  if (!hasRtl) {
    return [{ text, level: 0 }];
  }

  // Fast-path: if text contains only RTL and neutral characters, return as a single RTL run
  const hasLtr = /[a-zA-Z0-9\u00C0-\u024F]/.test(text);
  if (!hasLtr) {
    return [{ text, level: 1 }];
  }

  const embedding = bidi.getEmbeddingLevels(text);
  const levels = embedding.levels;

  // Segment into contiguous runs of the same embedding level
  const rawRuns: { start: number; end: number; level: number; text: string }[] = [];
  let currentStart = 0;
  let currentLevel = levels[0];

  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || levels[i] !== currentLevel) {
      rawRuns.push({
        start: currentStart,
        end: i,
        level: currentLevel,
        text: text.slice(currentStart, i),
      });
      currentStart = i;
      if (i < text.length) currentLevel = levels[i];
    }
  }

  // UAX #9 rule L2: reverse levels from highest level down to lowest odd level
  let minLevel = Infinity;
  let maxLevel = -Infinity;
  for (const run of rawRuns) {
    if (run.level < minLevel) minLevel = run.level;
    if (run.level > maxLevel) maxLevel = run.level;
  }
  const minOdd = minLevel % 2 === 1 ? minLevel : minLevel + 1;

  const orderedRuns = [...rawRuns];
  for (let lvl = maxLevel; lvl >= minOdd; lvl--) {
    let seqStart = -1;
    for (let i = 0; i <= orderedRuns.length; i++) {
      if (i < orderedRuns.length && orderedRuns[i].level >= lvl) {
        if (seqStart === -1) seqStart = i;
      } else {
        if (seqStart !== -1) {
          const reversed = orderedRuns.slice(seqStart, i).reverse();
          orderedRuns.splice(seqStart, i - seqStart, ...reversed);
          seqStart = -1;
        }
      }
    }
  }

  return orderedRuns.map((r) => ({ text: r.text, level: r.level }));
}
