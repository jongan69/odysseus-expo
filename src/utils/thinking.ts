export function splitThinking(raw: string): { answer: string; thinking: string } {
  const openTag = "<think>";
  const closeTag = "</think>";
  let answer = "";
  let thinking = "";
  let cursor = 0;

  while (cursor < raw.length) {
    const open = raw.indexOf(openTag, cursor);
    if (open === -1) {
      answer += raw.slice(cursor);
      break;
    }

    answer += raw.slice(cursor, open);
    const close = raw.indexOf(closeTag, open + openTag.length);
    if (close === -1) {
      thinking += raw.slice(open + openTag.length);
      break;
    }

    thinking += raw.slice(open + openTag.length, close);
    cursor = close + closeTag.length;
  }

  return { answer, thinking };
}
