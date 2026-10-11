# session-tracker (한국어판)

같은 폴더에서 돌고 있는 Claude 세션들이 각자 무엇을 했고(완료), 무엇을 하고 있고(진행), 다음에 무엇을 할지(다음) 보여 줘요. 한 프로젝트에 세션을 여러 개 띄워 둘 때 쓸모 있어요.

한국어판 제작: [robinade](https://github.com/robinade) · [mod 모음과 필요 조건](../README.md)

## 설치

터미널에서 Claude Code를 열고, 입력창에:

```
/plugin install session-tracker --marketplace robinade/claude-mods-ko
```

처음 한 번은 `Add marketplace?`를 물어요. `y`를 누르고, 설치 범위는 맨 위의 `user`에서 Enter를 눌러요. 그 세션에서 바로 켜지고, 이후 여는 모든 세션에서도 켜져요.

- **업데이트**: `claude plugin marketplace update claude-mods-ko`를 실행한 다음 `claude plugin update session-tracker@claude-mods-ko`를 실행하고, Claude Code를 다시 시작해요.
- **필요 조건**(Claude Code 2.1.295 이상, 모델 호출 비용, `CLAUDE_CODE_ATTRIBUTION_HEADER`)과 6종을 한 번에 설치하는 방법은 [mod 모음 README](../README.md)에 있어요.
- **설치 없이 한 세션만 써 보기**: 레포를 받은 뒤(`git clone https://github.com/robinade/claude-mods-ko`) `claude --plugin-dir claude-mods-ko/session-tracker`로 실행해요.

## 쓰는 법

- 같은 폴더에 다른 세션이 돌고 있으면 입력창 위에 그 세션들의 요약이 나와요. `접기` / `펼치기`로 줄이거나 펼쳐요.
- `/tracker`를 입력하면 전체 패널이 열려요.
- 상태 줄에는 `👥 다른 세션 2개`처럼 같은 폴더의 다른 세션 수가 나와요.

## 요약은 어떻게 만드나요

턴이 끝날 때마다 작은 모델(haiku)을 한 번 불러 세션 상태를 `TITLE / DONE / DOING / NEXT` 네 줄로 요약해요. 라벨은 영어 그대로 두고 내용은 한국어 개조식(예: `폼 화면 만듦`, `API 연결 중`)으로 쓰게 해요. 턴마다 haiku 호출이 한 번씩 있어 비용이 조금 들어요.

요약을 만들지 못하면 세션마다 한 번만 대화에 이유를 적어요. 원래는 턴마다 `summary skipped` 줄이 찍혔어요. `CLAUDE_CODE_ATTRIBUTION_HEADER`가 함께 보이면 `~/.claude/settings.json`의 `env`에서 `CLAUDE_CODE_ATTRIBUTION_HEADER: "0"`을 지우고 새 세션을 여세요. 이 값이 `0`이면 모드가 따로 부르는 모델 호출이 매번 429로 막혀요.

## 파일 충돌 경고

Claude가 파일을 고치거나 쓰기 전에, 같은 폴더의 다른 세션이 최근 30분 안에(이 세션이 그 파일을 마지막으로 고친 뒤에) 같은 파일을 고쳤는지 확인해요. 그랬다면:

- 파일 이름, 그 세션, 그 세션이 하는 일을 알려 주는 알림이 떠요.
- 수정은 그대로 진행되지만, Claude에게 "다른 세션이 이 파일을 바꿨으니 다시 고치기 전에 다시 읽고, 그 세션의 변경은 그대로 두라"는 안내가 도구 결과 뒤에 붙어요.
- 입력창 위에 `⚠ 충돌:` 줄이 나오고, `/tracker` 패널 맨 위에 최근 30분 안의 충돌이 모두 나와요.

바뀐 내용 하나당 한 번만 경고해요. 이 세션이 그 파일을 다시 고친 뒤에는, 다른 세션이 또 고치기 전까지 조용해요. 서브에이전트가 고친 파일은 추적하지 않아요.

## 한국어판에서 바뀐 점

- 패널·입력창 위 줄·알림·시간 표기(`2분 전`, `방금`)를 한국어로 바꿨어요.
- 세션 요약과 Claude에게 붙는 충돌 안내를 한국어로 받아요. 요약 줄에 `**DONE:**`처럼 굵게 쓰거나 전각 콜론(`：`)을 써도 읽어 내요.
- 한글은 터미널에서 2칸을 차지하므로 세션 이름·작업 내용은 글자 수가 아니라 화면 폭 기준으로 잘라요. 패널의 `완료 / 진행 / 다음 / 할 일 / 파일` 라벨도 폭 기준으로 줄을 맞춰요.
- macOS가 한글 파일 이름을 자모로 쪼개 저장(NFD)해도 같은 파일로 알아봐요.
- 폴더 이름에 한글이 들어간 프로젝트는 기록 폴더 이름 뒤에 짧은 해시를 붙여요. 원래 방식은 한글을 모두 `-`로 바꿔서, 예를 들어 `/work/가나`와 `/work/다라`가 같은 기록 폴더를 써 서로 다른 프로젝트 세션이 섞였어요. 영문 폴더는 기록 위치가 그대로예요.
- 기록 파일 형식(`~/.claude/session-tracker/` 아래 JSON 필드 이름)은 원본과 같아요.
