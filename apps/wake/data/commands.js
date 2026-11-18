/*
 * 터미널이 사람을 위해 실행하는 명령: 앱이 선언한 명령 id와 인자만 보낸다(데스크톱이 commands.json의 같은 표로 다시 검사하고 만든다).
 * 화면은 복사·표시용 명령 글(line)을 그대로 쓰고, 실행할 때 그 글을 선언한 명령 하나로 되읽는다. 선언에 없는 글은 실행하지 않는다.
 *   specOf(line) -> { id, args, line, confirm } | null  (confirm: 데스크톱이 터미널에서 Enter를 기다린 뒤 실행하는 명령)
 */
import COMMANDS from '../commands.json' with { type: 'json' };

export const quote = v => `'${String(v).replace(/'/g, `'\\''`)}'`;
const unquote = s => s.slice(1, -1).replace(/'\\''/g, "'");
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 템플릿마다 한 번 만드는 읽기 식: {이름} 자리는 작은따옴표로 감싼 값 하나(같은 이름은 같은 값) */
const READERS = Object.entries(COMMANDS).map(([id, def]) => {
  const names = [];
  const source = def.template.split(/(\{\w+\})/).map(part => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) return escape(part);
    names.push(m[1]);
    return "('(?:[^']|'\\\\'')*')";
  }).join('');
  return { id, def, names, re: new RegExp(`^${source}$`) };
});
const valid = (def, args) => Object.entries(def.args || {}).every(([name, pattern]) => typeof args[name] === 'string' && new RegExp(`^(?:${pattern})$`).test(args[name]));

/** 명령 글 -> 선언한 명령(id·인자·글). 선언에 없거나 인자가 모양에 맞지 않으면 null */
export function specOf(line) {
  const text = String(line ?? '');
  for (const { id, def, names, re } of READERS) {
    const m = re.exec(text);
    if (!m) continue;
    const args = {};
    let same = true;
    names.forEach((name, i) => { const v = unquote(m[i + 1]); if (name in args && args[name] !== v) same = false; args[name] = v; });
    if (same && valid(def, args)) return { id, args, line: text, confirm: def.confirm === true };
  }
  return null;
}
