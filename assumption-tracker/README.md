# assumption-tracker (한국어판)

Claude가 작업하면서 세우는 가정을 하나하나 기록해요. 옆 패널에서 각 가정을 맞음·틀림으로 표시하면, 정정 내용이 Claude에게 전달되고 Claude가 그 가정에 기댄 작업을 고쳐요.

한국어판 제작: [robinade](https://github.com/robinade) · [mod 모음과 필요 조건](../README.md)

한국어판은 원본(0.2.0)에서 이렇게 바뀌었어요.

- Claude가 가정을 **한국어 한 문장**으로 기록해요.
- 패널·밴드·안내 문구와 Claude에게 가는 판정 메시지가 모두 한국어예요.
- 패널 단축키가 `y`/`n`에서 **`1`/`2`**로 바뀌었어요. 한글 입력 상태에서는 `y`·`n`이 `ㅛ`·`ㅜ`로 들어가 단축키가 먹지 않기 때문이에요. 숫자는 한/영 상태와 상관없이 작동해요.

## 설치

터미널에서 Claude Code를 열고, 입력창에:

```
/plugin install assumption-tracker --marketplace robinade/claude-mods-ko
```

처음 한 번은 `Add marketplace?`를 물어요. `y`를 누르고, 설치 범위는 맨 위의 `user`에서 Enter를 눌러요. 그 세션에서 바로 켜지고, 이후 여는 모든 세션에서도 켜져요.

- **업데이트**: `claude plugin marketplace update claude-mods-ko`를 실행한 다음 `claude plugin update assumption-tracker@claude-mods-ko`를 실행하고, Claude Code를 다시 시작해요.
- **필요 조건**(Claude Code 2.1.295 이상, 모델 호출 비용, `CLAUDE_CODE_ATTRIBUTION_HEADER`)과 6종을 한 번에 설치하는 방법은 [mod 모음 README](../README.md)에 있어요.
- **설치 없이 한 세션만 써 보기**: 레포를 받은 뒤(`git clone https://github.com/robinade/claude-mods-ko`) `claude --plugin-dir claude-mods-ko/assumption-tracker`로 실행해요.

## 사용법

- 빈 입력창에서 `0`을 누르거나 `/assumptions`를 입력하면 패널이 열려요. `0`은 입력창 위에 밴드가 보일 때 작동해요. 밴드는 Claude가 가정을 하나라도 기록했거나, 프로젝트에 이미 규칙이 있을 때 보여요.
- 패널에서 `1`은 가장 최근의 미확인 가정을 **맞음**, `2`는 **틀림**으로 표시해요. 여러 개를 연달아 키 하나씩 처리할 수 있어요.
- 가정 아래 입력칸에 정정 내용을 적고 `Enter`를 누르면 틀림으로 표시하고 정정을 보내요. 입력칸에 커서가 있는 동안에는 숫자를 쳐도 단축키가 눌리지 않아요.
- `확인한 것 지우기`는 Claude에게 이미 전달된 판정을 목록에서 지워요. `Esc`로 패널을 닫아요.

## 프로젝트 규칙

정정은 세션이 끝나도 남아요. 가정을 틀림으로 표시하고 어떻게 해야 맞는지 적으면, 그 정정이 지금 작업 중인 프로젝트(작업 디렉터리 기준)의 규칙으로 저장돼요. 그 디렉터리에서 여는 다음 세션부터는 Claude의 시스템 프롬프트에 "정정된 가정에서 배운 프로젝트 규칙"으로 들어가서, Claude가 같은 추측을 다시 하지 않아요.

- 정정 내용 없이 틀림만 표시하면 규칙은 생기지 않아요.
- 같은 가정을 다시 정정하면 새 규칙이 늘어나지 않고 기존 규칙이 바뀌어요.
- 나중에 그 가정을 맞음으로 표시하면 규칙이 지워져요.
- 패널 맨 위에 `가정 12개 · 틀림 3 · 규칙 2`처럼 개수가 나와요. 그 바로 아래, 가정 목록보다 위에 프로젝트 규칙이 있어서 목록이 길어져도 늘 보여요. 규칙마다 `✗ 삭제` 버튼이 있어요.

규칙은 Claude Code 설정 디렉터리 아래 이 모드 전용 저장소(`~/.claude/plugins/store/`)에 있어서 세션을 다시 시작해도 남아요. 원본 영어판에서 만든 규칙도 그대로 읽어요(저장 키가 같아요).

전체 키 목록과 판정이 Claude에게 전달되는 방식은 `RULES.md`에 있어요.
