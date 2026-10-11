# Claude Code mod 한국어판 (claude-mods-ko)

Claude Code의 화면과 동작을 바꾸는 mod 6종을 한국어 사용자에 맞게 고친 모음이에요. 영어 원본 mod 모음(claude-mods)을 바탕으로, 문구·Claude에게 주는 지시·한글 폭(터미널에서 2칸)·조사 처리·한글 입력 상태에서 먹히는 단축키를 고쳤어요.

한국어판 제작: [robinade](https://github.com/robinade)

| mod | 하는 일 | 시작 |
|---|---|---|
| [assumption-tracker](assumption-tracker/README.md) | Claude가 작업 중 내린 가정을 기록해요. 맞다/틀리다를 표시하면 정정 내용이 프로젝트 규칙이 돼요. | `0` 또는 `/assumptions` |
| [plain-talk](basic-claude/README.md) (폴더 이름 `basic-claude`) | 쉬운 한국어로, 혼자 읽어도 이해되게 답하게 해요. 답마다 검사하고, 어려우면 한 번 다시 쓰게 해요. | `/plain` |
| [idea-shelf](idea-shelf/README.md) | 작업 중 떠오른 딴 아이디어를 선반에 올려 두고, 나중에 맞는 때에 알려 줘요. | `/idea <내용>` |
| [prompt-enhancer](prompt-enhancer/README.md) | 대충 쓴 초안을 프로젝트 맥락에 맞는 구체적인 프롬프트로 다듬어 줘요. 세션 모델의 프롬프트 가이드 카드(`cards/`)도 반영해요. | `/enhance <초안>` |
| [session-monitor](session-monitor/README.md) | 모든 프로젝트에서 돌고 있는 Claude 세션을 한 패널에 보여 줘요. | `/monitor` |
| [session-tracker](session-tracker/README.md) | 같은 폴더의 다른 세션이 뭘 하는지 보여 주고, 같은 파일을 고치면 경고해요. | `/tracker` |

## 필요 조건

- **Claude Code 2.1.295 이상.** `claude --version`으로 확인하고, 낮으면 `claude update`로 올려요. mod 기능은 아직 미리보기(early access) 단계라 Claude Code 버전에 따라 동작이 바뀔 수 있어요.
- **터미널에서 설치해요.** 아래 `/plugin install` 줄은 터미널의 Claude Code 입력창에서만 받아요. 데스크톱 앱의 Code 탭에서는 쓸 수 없지만, 터미널에서 `user` 범위로 설치하면 데스크톱 앱의 로컬 세션에서도 켜져요.
- **모델 호출 비용이 들어요.** 일부 mod는 대화와 별도로 모델을 불러요. 그만큼 사용량이 늘어요.
  - plain-talk: 답변마다 작은 모델(haiku)로 한 번 검사하고, 실패한 답변은 Claude가 한 번 더 써요.
  - session-tracker: 턴이 끝날 때마다 haiku로 세션 요약을 한 번 만들어요.
  - prompt-enhancer: 다듬을 때마다 세션 모델을 한 번 불러요.
- **`CLAUDE_CODE_ATTRIBUTION_HEADER`를 `0`으로 두지 마세요.** `~/.claude/settings.json`의 `env`에 `CLAUDE_CODE_ATTRIBUTION_HEADER: "0"`이 있으면, mod가 따로 부르는 모델 호출이 매번 `429`로 막혀요. 아래 [문제 해결](#문제-해결)을 보세요.

## 설치

터미널에서 Claude Code를 열고, 입력창에 mod마다 한 줄씩 입력해요.

```
/plugin install assumption-tracker --marketplace robinade/claude-mods-ko
/plugin install plain-talk --marketplace robinade/claude-mods-ko
/plugin install idea-shelf --marketplace robinade/claude-mods-ko
/plugin install prompt-enhancer --marketplace robinade/claude-mods-ko
/plugin install session-monitor --marketplace robinade/claude-mods-ko
/plugin install session-tracker --marketplace robinade/claude-mods-ko
```

- 처음 한 번은 `Add marketplace?`(`github:robinade/claude-mods-ko`)를 물어요. `y`를 눌러요.
- 설치 범위는 맨 위의 `user`에서 Enter를 눌러요. `user` 범위는 이 컴퓨터의 모든 프로젝트에서 켜져요.
- `Installed <mod>. Plugin is now active.`가 나오면 그 세션에서 바로 켜지고, 이후 여는 세션에서도 켜져요.

필요한 것만 골라 설치해도 돼요. 터미널 명령으로 한 번에 설치하려면:

```
claude plugin marketplace add robinade/claude-mods-ko
for m in assumption-tracker plain-talk idea-shelf prompt-enhancer session-monitor session-tracker; do
  claude plugin install $m@claude-mods-ko
done
```

`claude`를 감싸는 래퍼(예: cmux) 안에서 `plugin` 하위 명령이 거부되면, 실제 실행 파일로 실행하세요. `which -a claude`로 찾을 수 있어요(예: `~/.local/bin/claude`).

## 업데이트

```
claude plugin marketplace update claude-mods-ko
claude plugin update prompt-enhancer@claude-mods-ko
```

- 첫 줄은 이 레포의 최신 mod 목록을 받아 와요. 둘째 줄은 mod 하나를 새 버전으로 바꿔요. 업데이트할 mod마다 둘째 줄을 실행해요.
- 업데이트한 뒤에는 Claude Code를 다시 시작해요.

## 관리

- 목록: `claude plugin list`
- 끄기/켜기: `claude plugin disable <이름>@claude-mods-ko` / `claude plugin enable <이름>@claude-mods-ko`
- 지우기: `claude plugin uninstall <이름>@claude-mods-ko`

## 설치 없이 한 세션만 써 보기

```
git clone https://github.com/robinade/claude-mods-ko
claude --plugin-dir claude-mods-ko/session-monitor
```

## 쓰는 법 공통

- **명령**: `/`를 치면 mod 명령이 기본 명령과 같이 보여요. 명령 이름은 영어지만 뒤에 붙이는 내용은 한국어로 써도 돼요.
- **프롬프트 위 밴드와 버튼**: 입력 중에는 키가 입력창으로 가요. `ctrl+x tab`(또는 밴드 클릭)으로 밴드에 포커스를 옮기고, `Tab`으로 버튼 사이를 이동, `Enter`로 누르고, `Esc`로 입력창에 돌아가요.
- **한/영 전환 주의**: 버튼의 글자 단축키(`e`, `s` 등)는 한글 입력 상태에서는 자모(ㄷ, ㄴ)로 들어가 동작하지 않아요. 영문 상태로 바꾸거나 `Tab`+`Enter`, 클릭을 쓰세요. 숫자 단축키는 입력 상태와 상관없이 동작해요.
- **패널**: `/monitor`, `/tracker`, `/idea`, `/assumptions`는 대화 옆에 패널을 열어요. 패널이 열리면 키 입력이 패널로 가요. `Esc`로 닫아요. 터미널 폭이 좁으면 패널이 바로 안 보일 수 있어요.
- **저장되는 것**: 규칙, 아이디어, 아는 용어, 프롬프트 기록은 프로젝트별로 `~/.claude/plugins/store/`에 저장돼서 재시작해도 남아요. session-tracker는 `~/.claude/session-tracker/`에 세션 기록을 남겨요. 이 기록은 컴퓨터마다 따로 쌓이고, 다른 컴퓨터로 옮겨지지 않아요.

## 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 다듬기·답변 검사·세션 요약이 `429`로 실패하고, 메시지에 `CLAUDE_CODE_ATTRIBUTION_HEADER`가 보여요 | `~/.claude/settings.json`의 `env`에 `CLAUDE_CODE_ATTRIBUTION_HEADER: "0"`이 있어요. mod가 따로 부르는 모델 호출은 Claude Code 머리말을 빼고 보내요. 이 값이 `0`이면 Claude Code 요청이라는 표시가 하나도 남지 않아서 구독 로그인 요청이 막혀요. 본 대화는 멀쩡해요. | 그 줄을 지우고 새 세션을 여세요. Anthropic API에 직접 연결하면 캐시에 영향이 없어요([공식 문서](https://code.claude.com/docs/en/llm-gateway-protocol#system-prompt-attribution-block)). |
| 다듬기 버튼이 "붙여 넣은 긴 글은 접혀 있어…"라고 해요 | 긴 붙여넣기는 입력창에 `[Pasted text #1 +45 lines]`로 접히고, 원문은 보낼 때만 펼쳐져요. | `/enhance ` 뒤에 붙여 넣고 Enter를 누르세요. |
| `plugin` 명령이 "not run from this spelling"이라며 거부돼요 | `claude`가 다른 프로그램(예: cmux)의 래퍼예요. | `which -a claude`로 실제 실행 파일을 찾아 그걸로 실행하세요. |
| plain-talk 알림 소리가 안 나요 | 알림 소리 파일은 저작권 때문에 레포에 넣지 않았어요. 소리 없이도 상태 줄과 밴드는 그대로 동작해요. | [plain-talk README](basic-claude/README.md#알림-소리)를 보세요. |
| 그 밖의 문제 | | `claude --debug-file <파일>`로 실행하고, 기록에서 `$.model.`이나 mod 이름으로 찾아보세요. mod의 훅이 실패하면 대화에 mod 이름과 이유가 흐린 줄로 표시돼요. |

## mod 고치기

레포를 받아서 고쳐요. 각 mod의 코드는 `<폴더>/hooks/register.tsx`에 있어요.

```
git clone https://github.com/robinade/claude-mods-ko
claude --plugin-dir ./claude-mods-ko/prompt-enhancer
```

- 둘째 줄은 고친 mod를 그 세션에서만 켜서 확인해요. 같은 mod를 GitHub에서 설치해 둔 컴퓨터라면, 겹치지 않게 먼저 `claude plugin disable <이름>@claude-mods-ko`로 꺼 두세요.
- 고친 판을 계속 쓰려면 그 폴더를 로컬 마켓플레이스로 등록해요: `claude plugin marketplace add ./claude-mods-ko`. 같은 이름(`claude-mods-ko`)의 마켓플레이스는 하나만 둘 수 있어서, GitHub 판을 등록한 컴퓨터에서는 이 방법을 쓰지 마세요. 로컬로 설치하면 고친 뒤 열려 있는 세션에서 `/reload-plugins`로 바로 다시 불러와요.
- 확인 명령:
  ```
  claude plugin validate ./claude-mods-ko
  cd claude-mods-ko && claude plugin test ./<폴더>
  ```
- 다른 컴퓨터가 새 버전으로 받게 하려면, 고친 mod의 `.claude-plugin/plugin.json`에서 `version`을 올린 뒤 올려 주세요.

## 라이선스

[MIT](LICENSE)
