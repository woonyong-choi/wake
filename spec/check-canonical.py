#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inspect registered normative expressions/links; --references emits CSV."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Iterator

ROOT = Path(__file__).resolve().parent
PATTERN_DATA = [
    [
        "RULE-STATE",
        "정상[·ㆍ/].*(?:로딩|불러오는 중).*연결|정상·빈 성공·연결 안 됨|S[1-7] (?:기본|부분 실패)|부분 실패는 (?:별도|상태)|(?:수집.?주기|collectionIntervalMs).*(?:2배|두 배)|on-demand.*60초|2I\\+1ms|t0\\+2I|빈 셀.*(?:N/A|대시|가짜\\s*0)|(?:null|빈 셀).*(?:실제 0|권한 상태)|(?:poll|갱신).*(?:2회|두 번).*누락|(?:수집)?주기\\s*(?:의\\s*)?2배\\s*초과",
    ],
    [
        "RULE-TONE",
        "정상은 아이콘|정상.*아이콘만|busy.*회전.*warn|critical.*(?:빨강|위험).*high|숫자.*(?:아이콘 없이|상태 아이콘.*(?:금지|없))|심각도.*중립.*(?:분류|톤)|severity 원문·중립|pending\\s*(?:진행|주의)|resolved\\s*(?:정상|중립)|firing\\s*(?:오류|위험)|숫자.*주의색|한 셀.*(?:두 의미|한 의미)|심각도\\s*역할색|반복.*(?:흐린 글자|배지 바탕)|횟수 배지|x 대신.*배지",
    ],
    [
        "RULE-SORT",
        "(?:danger|위험).*(?:warn|주의).*(?:namespace|이름|UID)|최신 시각.*불변 키|시각 내림.*불변|동점.*(?:불변 키|namespace).*오름|결손.*(?:양방향|오름|내림).*마지막|숫자.*tabular-nums|모든 (?:열|머리).*왼쪽|Unicode 코드포인트|기본 정렬: 문제 행|기본 정렬: 최신|(?:머리|숫자).*왼쪽 정렬|문제 톤 danger → warn|critical\\s*→\\s*warning|정확 일치.*접두.*포함|total.*내림.*allocation|Warning.*count.*내림.*Reason|전 열 왼쪽 정렬",
    ],
    [
        "RULE-WIDTH",
        "(?:Restarts|초기|내용).*?(?:64px|91px)|fit.*1px|이름.*220px|optional.*오른쪽|오른쪽.*optional|Name 220px|이름 220px|kit\\s*(?:행\\s*)?40\\s*(?:px)?[·, /]+.*Wake\\s*(?:본문\\s*행\\s*)?28\\s*(?:px)?",
    ],
    [
        "RULE-TIME",
        "HH:mm|HH:MM|YYYY-MM-DD HH|초가 있는 원문은 초 보존|시작 칸.*상대|연도 누락|변경 칸.*5분 경과|상대 나이.*(?:과거|스냅숏).*계산",
    ],
    [
        "RULE-RANGE",
        "1h[/·→ ].*6h[/·→ ].*24h|전 기간 비교.*(?:지원|제외|자료|구현)|비교 자료.*(?:숨|탭|구간)|D00612.*(?:구현|비교)|(?:15분|15m|1시간|1h)\\s*[/·→,].*(?:6시간|6h).*?(?:24시간|24h)|프리셋(?:은|는|을|의|에서|공통|기본|목록|선택|집합|[:：·→= ]|\\s)*(?:15분|1시간|6시간|24시간|7일|15m|1h|6h|24h|7d)|(?:신호|기록|로그).*초기.*(?:1시간|7일)|24\\s*(?:h|시간)\\s*[/·→,]\\s*7\\s*(?:d|일)\\s*[/·→,]\\s*30\\s*(?:d|일)",
    ],
    [
        "RULE-CHART",
        "과거.*(?:pulse|브리딩|실시간 이동|움직임을 멈)|X축.*더블클릭.*Y축|축 글자.*11px|높이.*160.*360|마지막.*구간.*브리딩|plot.*우상단|plot.*분기.*(?:중복 선|clip)|최소\\s*160\\s*[/·~].*최대\\s*360\\s*px|범주형.*(?:최대|상한)\\s*240\\s*px",
    ],
    [
        "RULE-SANKEY",
        "열당.*(?:7개|6개)|상위 6개.*기타|띠.*(?:최소 ?4px|4px 미만)|이름.*2줄.*말줄임|툴팁.*10개|tooltip.*10개|실패.*띠.*(?:계속|흐름|멈추)|노드.*아이콘 크기.*변화",
    ],
    [
        "FLOW-APR-001",
        "자동.*Argo.*Draft PR|수동.*Argo.*command|정책 미확인.*(?:pr|PR)|gitops-manual-drift|gitops-sync-unknown",
    ],
    [
        "RULE-APPROVAL",
        "항상 허용.*없|승인.*(?:실행 완료가 아니|실행 성공으로|실행·복구.*표시)|첫 결정.*(?:중복|replayed)|허용.*복사.*적용 시각",
    ],
    [
        "RULE-RETENTION",
        "(?:대화|Event|감사|source-checks)[^。.;]{0,45}(?:90일|365일|7일)|(?:90일|365일|7일)[^。.;]{0,25}TTL|(?:보관|TTL)[^。.;]{0,25}(?:90|365)일|(?:alert-history|audit|approvals|승인/실행|승인·실행|실행 기록).*90일",
    ],
    [
        "RULE-RECOVERY",
        "30초.*(?:5분|11개)|5분.*11개|연속 ?10분.*(?:누락|빠지|결손)|누락.*inconclusive|24시간.*(?:repeat|재발|같은 ID)|5분\\s*관찰\\s*없이\\s*복구",
    ],
    [
        "RULE-PERFORMANCE",
        "150ms|(?:layout.shift|레이아웃 이동).*0\\.01|데이터 완성.*1초|첫 그림.*데이터.*1초|IPC.*p95.*50ms|CPU.*1%|event loop.*p99.*20ms|(?:저장|파일 byte).*1/5|데이터.*(?:1000ms|1초 이하)|정상군.*1000ms|50ms.*(?:프레임|긴 프레임)|(?:프레임|fit).*50ms|1%\\s*이하.*20ms|수치 확정 전 필수 합격선|동일 관측 중복 원본 요청\\s*0|해제 후 연결·타이머\\s*0|RSS 증가.*0.*수렴",
    ],
    [
        "RULE-AI",
        "AI.*(?:읽기 전용|읽기·제안|읽기와 제안)|모델.*실행.*사람.*승인|(?:AI\\s*(?:답변|문장|출력)|답변\\s*본문).*(?:합니다체|한다체|~다/합니다)|한다체/합니다체.*(?:단정|미결)",
    ],
    [
        "RULE-SECRET",
        "Secret.*(?:get/list/watch|get,list,watch|PartialObjectMetadata|호출 0|호출.*금지)|Secret.*(?:메타데이터만|메타데이터.*거절)|Helm.*권한 범위 밖",
    ],
    [
        "RULE-PANE",
        "사방.*8px|(?:칸|창).*16px.*(?:원형|반경)|p<R|p≥R|superellipse.*1\\.4|페이지 면.*23px|(?:surface|row-side).*(?:23\\s*px|8\\s*px).*원형",
    ],
    ["RULE-SIDEBAR", "클러스터 → 북마크 →|열린 인시던트.*대화.*(?:위|먼저)"],
    [
        "RULE-CHIPS",
        "included.*health.*openable|같은 UID.*(?:receipt|칩)|(?:칩|receipt).*일시.*(?:유지|실패)|연결(?:된)? 공급자만|아이콘.*(?:한 줄|겹침).*\\+N|로고.*(?:바깥|외곽).*흰 원|내부 흰색.*겹침|Watchdog.*(?:목록|집계).*(?:제외|포함되면 실패)|로고.*겹침 금지",
    ],
    [
        "RULE-SKELETON",
        "최초.*(?:뼈대|skeleton).*재조회|실제.*(?:열·행 자리|머리·탭·열·카드)|재조회.*마지막 성공값",
    ],
    [
        "RULE-FOLD",
        "100ms.*(?:펼침|열림|첫 그림|판단)|(?:첫 그림|첫 판단).*100ms|늦은.*(?:응답|자료).*자동.*펼|사람.*접.*(?:응답|갱신).*유지|최초 유효 자료.*자동 펼|첫.*응답.*자동 펼",
    ],
    [
        "RULE-EVIDENCE",
        "발췌.*300자|실패한 get_evidence.*(?:근거|이름표)|실제 성공.*근거.*(?:인용|링크)",
    ],
    [
        "RULE-RESTARTS",
        "Restarts.*(?:주의색|주의 톤|경과|양수)|경과시간은 기본 톤|경과시간까지 주의색|횟수만 주의|5\\s*\\(3m ago\\)|Restarts.*(?:전문 보장|전체 표시|space-16으로 고정)",
    ],
]

PATTERNS = [(topic, re.compile(pattern)) for topic, pattern in PATTERN_DATA]
REFERENCE = re.compile(r"\[(RULE-[A-Z]+|FLOW-APR-001)\]\(([^)]+)\)")
IDENTIFIER = re.compile(r"\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b")
FACT_FIELDS = {"현재", "차이", "현재 구현", "현재·차이", "구현 차이"}
SOURCE_FIELDS = {
    "출처",
    "원문",
    "원천",
    "근거 원문",
    "원본 코드",
    "원천 발췌",
    "선택 이유·범위",
    "제외하거나 다른 영역에 맡긴 내용·이유",
    "이 영역에서 반영하지 않은 이유·소유 영역",
}
NORMATIVE = re.compile(
    r"목표|기대|실패(?:다|\s*[:：]| 조건| 판정)|면 실패|(?:해|어|여|아)야|필수|합격선|보장|허용|금지|필요하다|요구한다"
)


@dataclass(frozen=True)
class Fragment:
    line: int
    part: str
    text: str
    owner: str
    subject: str = ""


def _parts(line: str) -> list[str]:
    protected: list[str] = []

    def protect(match: re.Match) -> str:
        protected.append(match.group())
        return f"\x00{len(protected) - 1}\x00"

    masked = re.sub(r"(`+).*?\1", protect, line.strip().strip("|"))
    cells = re.split(r"(?<!\\)\|", masked)
    return [
        re.sub(
            r"\x00(\d+)\x00", lambda match: protected[int(match.group(1))], cell
        ).strip()
        for cell in cells
    ]


def _is_source_section(title: str) -> bool:
    return bool(
        re.search(
            r"반영 decisions|결정별|원문|과거 관측|현재 (?:행|계산|선언)|원천.*(?:대응|발췌)|수정.*표본",
            title,
        )
    )


def _fragments(text: str, name: str) -> Iterator[Fragment]:
    headers: list[str] = []
    section = owner = item_field = ""
    code = False
    lines = text.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            item_field = ""
        if stripped.startswith(("```", "~~~")):
            code = not code
            continue
        if code:
            continue
        if stripped.startswith("#"):
            section, headers, item_field = stripped, [], ""
            match = IDENTIFIER.search(stripped)
            owner = match.group() if match else ""
        if _is_source_section(section):
            continue
        if stripped.startswith("|"):
            item_field = ""
            cells = _parts(stripped)
            if all(re.fullmatch(r":?-+:?", cell) for cell in cells):
                continue
            if index + 1 < len(lines) and re.match(
                r"^\s*\|[\s:|-]+\|\s*$", lines[index + 1]
            ):
                headers = cells
                continue
            match = IDENTIFIER.search(cells[0])
            row_owner = match.group() if match else owner
            subject = re.sub(r"<[^>]*>", "", cells[0])
            for column, cell in enumerate(cells):
                field = (
                    headers[column] if column < len(headers) else f"cell {column + 1}"
                )
                yield Fragment(index + 1, field, cell, row_owner, subject)
        elif re.match(
            r"^\s*(?:[-*+] |\d+[.)] |(?:목표|톤|현재|차이|고정 장치|기대|실패|추가 조건|검사|점검)[:：])",
            line,
        ):
            item = re.sub(r"^\s*(?:[-*+] |\d+[.)] )", "", line)
            match = re.match(r"([^:：]+)[:：]\s*(.*)", item)
            field, value = match.groups() if match else ("항목", item)
            item_field = field
            yield Fragment(index + 1, field, value, owner, section)
        elif item_field and line[:1].isspace() and stripped:
            yield Fragment(index + 1, item_field, stripped, owner, section)


def _normative_text(fragment: Fragment) -> str:
    if fragment.part in SOURCE_FIELDS or re.search(
        r"원천 요구|당시|과거 관측|이전 지시|원문|원인|고유 입력|규칙 ID·반례|현재 대조 규칙 ID",
        fragment.part,
    ):
        return ""
    clean = re.sub(r"\[[^\]]*\]\([^)]*\)", "", fragment.text)
    is_fact = fragment.part in FACT_FIELDS or bool(
        re.search(r"현재|차이|남은 지적|남은 검증|실제 코드 계약", fragment.part)
    )
    clean = clean.replace("`", "")
    if is_fact:
        sentences = re.split(r"(?<=\.)\s+|<br>|; ", clean)
        clean = " ".join(
            sentence for sentence in sentences if NORMATIVE.search(sentence)
        )
    if "입력" in clean and "기대" in clean:
        clean = re.split(r"기대\s*[:：]?", clean, maxsplit=1)[1]
    return clean.strip()


def _hits(fragment: Fragment) -> list[str]:
    clean = _normative_text(fragment)
    if not clean or re.fullmatch(r"[\s→;.,·]+", clean):
        return []
    subject = "Restarts" if "Restarts" in fragment.subject else ""
    if re.search(r"프리셋|기간 선택|초기 기간", fragment.part):
        subject += " 프리셋"
    if fragment.subject in {
        "심각도",
        "surface",
        "row-side",
        "동일 관측 중복 원본 요청",
        "해제 후 연결·타이머",
        "24시간 상당 RSS 증가",
        "IPC p95",
        "유휴 메인 CPU / 이벤트 루프 p99",
        "alert-history",
        "audit",
        "승인·실행",
    }:
        subject += " " + fragment.subject
    sentences = re.split(r"(?<=\.)\s+|<br>|; ", clean)
    return [
        topic
        for topic, pattern in PATTERNS
        if not (topic == "FLOW-APR-001" and fragment.owner == topic)
        and any(pattern.search(f"{subject} {sentence}") for sentence in sentences)
    ]


def _table_shape_errors(text: str) -> list[tuple[int, int, int]]:
    lines = text.splitlines()
    expected = 0
    code = False
    errors = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(("```", "~~~")):
            code = not code
        if code:
            continue
        if not stripped or stripped.startswith("#"):
            expected = 0
        if not stripped.startswith("|"):
            continue
        count = len(_parts(stripped))
        if index + 1 < len(lines) and re.match(
            r"^\s*\|[\s:|-]+\|\s*$", lines[index + 1]
        ):
            expected = count
        elif expected and count != expected:
            errors.append((index + 1, expected, count))
    return errors


def _check(root: Path) -> int:
    remaining: list[tuple] = []
    broken: list[tuple] = []
    malformed: list[tuple] = []
    links = cells = items = 0
    for path in sorted(root.rglob("*.md")):
        text = path.read_text()
        lines = text.splitlines()
        malformed.extend(
            (str(path.relative_to(root)), *error) for error in _table_shape_errors(text)
        )
        if path.name != "rules.md":
            for fragment in _fragments(text, path.name):
                if lines[fragment.line - 1].lstrip().startswith("|"):
                    cells += 1
                else:
                    items += 1
                for topic in _hits(fragment):
                    remaining.append(
                        (
                            str(path.relative_to(root)),
                            fragment.line,
                            fragment.part,
                            topic,
                            fragment.text,
                        )
                    )
        for number, line in enumerate(text.splitlines(), 1):
            for label, dest in REFERENCE.findall(line):
                links += 1
                filename, separator, anchor = dest.partition("#")
                target = path.parent / filename if filename else path
                if (
                    not separator
                    or anchor != label
                    or not target.is_file()
                    or f'<a id="{anchor}"></a>' not in target.read_text()
                ):
                    broken.append((str(path.relative_to(root)), number, dest))
    for entry in remaining:
        print("REDEFINITION", *entry)
    for entry in broken:
        print("BROKEN", *entry)
    for entry in malformed:
        print("MALFORMED_TABLE", *entry)
    ids = re.findall(r'<a id="(RULE-[A-Z]+)"></a>', (root / "rules.md").read_text())
    print("TOPICS", len(set(ids)) + 1)
    print("CHECKED_CELLS", cells)
    print("CHECKED_ITEMS", items)
    print("CANONICAL_LINKS", links)
    print("REDEFINITIONS", len(remaining))
    print("BROKEN_CANONICAL_LINKS", len(broken))
    print("MALFORMED_TABLES", len(malformed))
    return int(
        bool(
            remaining
            or broken
            or malformed
            or len(ids) != len(set(ids))
            or len(ids) != 21
        )
    )


def _references(root: Path) -> None:
    writer = csv.writer(sys.stdout)
    writer.writerow(["file", "line", "rule", "canonical", "part"])
    for path in sorted(root.rglob("*.md")):
        if path.name in {"rules.md", "README.md"}:
            continue
        for fragment in _fragments(path.read_text(), path.name):
            ids = list(
                dict.fromkeys(label for label, _ in REFERENCE.findall(fragment.text))
            )
            if ids:
                writer.writerow(
                    [
                        str(path.relative_to(root.parent)),
                        fragment.line,
                        fragment.owner,
                        ";".join(ids),
                        fragment.part,
                    ]
                )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--references", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        if args.references:
            _references(args.root)
            return 0
        return _check(args.root)
    except (OSError, UnicodeError) as error:
        print(f"cannot check canonical documents: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
