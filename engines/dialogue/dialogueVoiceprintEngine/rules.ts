// English function words excluded from "distinctive words" (they say nothing about a voice).
export const STOPWORDS = new Set(
  (
    "a an the and or but if then so of to in on at by for with from up down out over under again further once " +
    "i me my mine myself we us our ours you your yours he him his she her hers it its they them their theirs " +
    "what which who whom this that these those am is are was were be been being have has had do does did doing " +
    "will would shall should can could may might must not no nor only own same too very just don't can't won't " +
    "i'm you're it's that's there here when where why how all any both each few more most other some such than " +
    "s t d ll m re ve y into about against between through during before after above below off also get got let"
  ).split(" ")
);
/** A phrase (3+ words) used at least this many times by one speaker is flagged as repeated phrasing. */
export const REPEAT_MIN_OCCURRENCES = 3;
export const NGRAM = 3;
export const TOP_WORDS = 5;
