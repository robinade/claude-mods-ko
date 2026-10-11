# session-monitor (한국어판)

모든 프로젝트에서 실행 중인 Claude Code 세션을 한 패널에 모아 보여 줘요. 세션마다 **작업 중**, **확인 필요**(내 답을 기다리는 중), **완료**로 표시되고, 원하는 세션으로 이어 가거나 기다리는 세션에 바로 답장할 수 있어요.

한국어판 제작: [robinade](https://github.com/robinade) · [mod 모음과 필요 조건](../README.md)

## 설치

터미널에서 Claude Code를 열고, 입력창에:

```
/plugin install session-monitor --marketplace robinade/claude-mods-ko
```

처음 한 번은 `Add marketplace?`를 물어요. `y`를 누르고, 설치 범위는 맨 위의 `user`에서 Enter를 눌러요. 그 세션에서 바로 켜지고, 이후 여는 모든 세션에서도 켜져요.

- **업데이트**: `claude plugin marketplace update claude-mods-ko`를 실행한 다음 `claude plugin update session-monitor@claude-mods-ko`를 실행하고, Claude Code를 다시 시작해요.
- **필요 조건**(Claude Code 2.1.295 이상, 모델 호출 비용, `CLAUDE_CODE_ATTRIBUTION_HEADER`)과 6종을 한 번에 설치하는 방법은 [mod 모음 README](../README.md)에 있어요.
- **설치 없이 한 세션만 써 보기**: 레포를 받은 뒤(`git clone https://github.com/robinade/claude-mods-ko`) `claude --plugin-dir claude-mods-ko/session-monitor`로 실행해요.

## 쓰는 법

- 입력창 위의 `세션` 버튼을 누르거나 `/monitor`를 입력하면 패널이 열려요. 다시 누르거나 `Esc`로 닫아요.
- 입력창 위 줄에는 `? 확인 필요 1  ● 작업 중 2  ✓ 완료 3`처럼 상태별 세션 수가 나와요.
- 패널의 각 줄: 상태, 세션 제목(없으면 이름이나 폴더), 기다리는 이유(예: `선택 대기`, `입력 필요`), 마지막 변화 시각(`2분 전`), 폴더 이름.
- **이어하기** (이 세션을 뺀 모든 줄): `cd <폴더> && claude --resume <id>` 명령을 클립보드에 복사하고 알림으로도 보여 줘요. 다른 터미널에 붙여 넣으면 그 세션을 이어 갈 수 있어요. 모드가 다른 세션으로 화면을 바로 옮기거나 그 창을 앞으로 가져올 방법은 Claude Code에 없어서, 명령을 건네주는 방식이에요.
- **답장** (확인 필요인 줄): 목록 아래에 한 줄 입력칸이 열려요. Enter를 누르면 그 세션에 메시지로 보내요(SendMessage 도구와 같은 방식). 비운 채 Enter를 누르면 취소돼요. "보냈어요"는 대기열에 들어갔다는 뜻이고, 그 세션이 다음 차례에 읽어요. 그 세션에 떠 있는 권한 확인 창에 대신 답하지는 않아요. 모바일 앱에는 입력칸이 없어서 답장 버튼이 나오지 않아요.

## 한국어판에서 바뀐 점

- 버튼·상태·알림·시간 표기(`2분 전`)를 한국어로 바꿨어요.
- 세션이 기다리는 이유(`dialog open`, `input needed` 등 Claude Code가 남기는 값)를 한국어로 풀어 보여 줘요. 모르는 값은 원문 그대로 보여요.
- 한국어 세션 제목도 그대로 읽어 와요. 긴 제목은 터미널 폭에 맞춰 엔진이 잘라요(한글 2칸 폭 반영).
