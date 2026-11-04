# 말랑 동물 숨바꼭질: Kling AI 레퍼런스 영상 프롬프트

`lovisdotio/video-to-game` 스킬에 넣을 게임 레퍼런스 영상을 Kling AI로 만들기 위한 프롬프트 모음입니다.

## 1. video-to-game 레포를 읽고 정리한 내용

- **흐름**: 영상 생성 → `study_video.py`로 프레임·컨택트시트·팔레트·컷 추출 → 에이전트가 `SPEC.md`(카메라, 주인공, 메커닉,
  키 모먼트, 월드, 룩) 작성 → fal로 이미지·3D·사운드 생성 → Three.js 단일 `index.html` → 에이전트가 직접 플레이하고 녹화.
- **영상 규칙**(`prompts/gameplay-video-prompts.md`):
  - 한 문장으로 말할 수 있는 **오리지널 컨셉 하나**에 **동사 하나**. 기존 게임, 캐릭터, 브랜드, 레벨 구조는 쓰지 않습니다.
  - 세계만 보여주지 말고 **메커닉이 작동하는 장면과 그 결과**를 보여줍니다.
  - **플레이 가능한 카메라**: 3인칭 뒤, 측면, 탑다운 중 하나로, 흔들림 없이 주인공이 잘 보이게.
  - **HUD와 글자는 넣지 않습니다**(영상 모델이 가짜 UI와 깨진 글자를 만들어냅니다).
  - **아트 디렉션은 몇 단어로 강하게** 정합니다.
  - **10~15초, 1080p, 16:9**. 여러 개 뽑아서 메커닉이 가장 잘 읽히는 걸 고릅니다.
- **흔한 함정**(`study-the-video.md`): 생성 영상은 컷이 끊기고 화면이 흘러갑니다. 스킬은 *가장 긴 안정된 샷 하나*에서
  카메라와 룩을 가져갑니다. 그래서 길고 컷이 많은 영상은 오히려 손해입니다.

## 2. 길이, 수량, 볼륨 권장

"길수록 좋다"는 스킬 입장에서는 맞지 않습니다. 스킬은 **한 클립 = 한 메커닉 = 한 개의 안정된 샷**을 기준으로 만들어졌습니다.
그래서 **긴 영상 한 편보다 10초짜리 클립을 여러 개** 만드는 편이 좋습니다.

| 항목 | 권장 |
|---|---|
| 클립 길이 | **10초**(Kling 최대 단일 생성 길이). 필요하면 Extend로 한 번 늘려 15~20초까지 |
| 화면비 / 해상도 | 16:9, 1080p (Professional/Master 모드) |
| 메인 클립 | 아래 **#1 코어 메커닉** 하나. 이게 게임의 설계도가 됩니다 |
| 보조 클립 | #2~#8: 술래 시점, 잡기/던지기, 맵 전경, 캐릭터 시트 등. SPEC과 에셋 레퍼런스로 씁니다 |
| 테이크 수 | 프롬프트당 **3~4테이크** → 가장 잘 읽히는 1개 선택 |
| 전체 볼륨 | 8개 프롬프트 × 3테이크 ≈ **24회 생성**, 쓰는 영상은 8개(약 80초 분량) |
| 긴 트레일러 | 원하면 **#9 롱테이크**를 Extend로 30~60초까지. 분위기 참고용이고, 스킬 입력으로는 쓰지 않습니다 |
| 사운드 | Kling 네이티브 오디오는 켜도 되고 꺼도 됩니다(스킬은 fal로 사운드를 따로 생성합니다) |

**캐릭터 일관성 팁**: 먼저 #0 캐릭터 시트를 이미지로 뽑고, 그 이미지를 Kling의 **Image-to-Video / Elements(멀티 이미지 레퍼런스)**에
넣어 #1~#9를 만들면 클립마다 캐릭터가 바뀌지 않습니다.

**스타일 관련**: 특정 상용 게임 이름이나 캐릭터는 프롬프트에 넣지 않았습니다. 그 게임을 닮게 만드는 *요소*인
말랑한 봉제인형 체형, 흐물흐물한 래그돌 물리, 파스텔 장난감 세계를 글로 풀어 썼습니다. 스킬 규칙("No existing game,
character, brand")에도 맞고, 결과물을 오리지널 IP로 가져갈 수 있습니다.

## 3. 게임 컨셉 (한 문장)

> **Fuzzy Freeze**: 통통한 봉제인형 동물들이 거대한 장난감 가게에서 숨바꼭질을 합니다. 술래의 손전등이 지나가면 숨는 쪽은
> 진짜 인형인 척 **얼어붙어야** 하고, 조금이라도 흔들리면 술래가 낚아채서 던져버립니다.

- 핵심 동사: **freeze**(인형인 척 굳기)
- 숨는 쪽: 진열대, 인형 더미, 장난감 상자 속에서 포즈를 잡고 멈춤
- 술래: 손전등과 킁킁 냄새 맡기 → 흔들리는 인형을 잡아서 래그돌로 던짐

## 4. 공통 스타일 블록 (모든 프롬프트 앞에 붙이기)

```text
Stylized 3D party game, soft physics-based ragdoll animation. Characters are chubby round plush-toy animals
with oversized heads, tiny stubby arms and legs, soft fuzzy felt fur, big glossy button eyes, simple happy
faces, each wearing one bright accessory. Wobbly, floppy, bouncy movement with heavy squash and stretch,
exaggerated clumsy running, arms flailing. Warm pastel color palette, soft global illumination, gentle
rim light, subtle depth of field, cozy toy-like materials, clean readable silhouettes. No text, no HUD, no UI.
```

**네거티브 프롬프트**(Kling Negative Prompt 칸):

```text
text, letters, logo, watermark, HUD, user interface, health bar, realistic animals, scary, creepy, uncanny,
humans, low detail, flickering, morphing faces, extra limbs, fast camera cuts, shaky camera
```

## 5. 프롬프트

### #0 캐릭터 시트 (이미지 생성, Kling Image)

```text
Character turnaround sheet of six original chubby plush-toy animal characters for a cute 3D party game,
standing in a row on a plain light-cream background: a yellow duckling with a red bandana, a grey shark
with a tiny sailor hat, a pink bunny with one floppy ear and blue overalls, an orange corgi with a green
scarf, a white polar bear cub with round glasses, a purple cat with a party crown. Oversized round heads,
tiny stubby limbs, soft fuzzy felt fur, big glossy button eyes, simple happy faces. Front and three-quarter
views, soft studio lighting, pastel palette, high detail plush texture. No text.
```

### #1 코어 메커닉: 굳기 (메인 클립, 10초)

```text
[공통 스타일 블록]
Inside a giant cozy toy store at night, tall wooden shelves packed with real stuffed toys. Third-person
camera behind and slightly above a chubby yellow plush duckling with a red bandana. The duckling waddles
clumsily onto a low shelf and squeezes between real stuffed toys. A warm flashlight beam sweeps in from the
right. The duckling instantly freezes in a stiff, silly toy pose, arms out, eyes wide, perfectly still,
blending in with the other toys. The beam slides over it and moves away. The duckling lets out a relieved
wobble and flops forward. Steady camera, single continuous shot.
```

### #2 술래 시점: 수색 (10초)

```text
[공통 스타일 블록]
A chubby grey plush shark with a tiny sailor hat is the seeker, holding a big round flashlight. Third-person
camera behind the shark, steady. It waddles down a toy store aisle, swinging the flashlight beam across
shelves full of stuffed toys, stopping to sniff the air with exaggerated head bobs. On one shelf a pink plush
bunny trembles slightly while pretending to be a toy. The shark slowly turns toward it, leaning in suspiciously.
Single continuous shot.
```

### #3 발각 → 잡기 → 던지기 (10초)

```text
[공통 스타일 블록]
In a pastel toy store aisle, a chubby grey plush shark seeker shines a flashlight on a pink plush bunny
pretending to be a stuffed toy. The bunny sneezes and wobbles. The shark grabs the bunny in a big floppy
hug, spins clumsily, and tosses it; the bunny flies across the aisle in floppy ragdoll physics, bounces off
a pile of soft cushions and rolls into a toy basket. Confetti puffs on impact. Side-on 3D camera, steady,
wide enough to show both characters. Single continuous shot.
```

### #4 숨을 곳 찾기: 카운트다운 동안 질주 (10초)

```text
[공통 스타일 블록]
Wide high three-quarter camera over a huge pastel toy store. Five chubby plush animals (orange corgi with a
green scarf, polar bear cub with glasses, purple cat with a crown, pink bunny, yellow duckling) scatter in
all directions with wobbly clumsy running, arms flailing, tripping and bumping into each other. One dives
into a pile of plush toys, one climbs a shelf, one hides inside a toy box and closes the lid, one squeezes
into a row of teddy bears. Bouncy, comedic, readable. Steady camera, single continuous shot.
```

### #5 위장 다양성: 각자의 숨는 포즈 (10초)

```text
[공통 스타일 블록]
Slow steady dolly shot along a toy store shelf. Each spot hides one chubby plush animal pretending to be a
stuffed toy: an orange corgi sitting stiffly among real plush dogs, a polar bear cub frozen upside down in a
bin of toy balls, a purple cat posed like a display figure with a price-tag-shaped paper, a duckling sitting
inside a row of rubber ducks. Each one blinks or twitches very slightly when the camera passes. Warm night
lighting, flashlight glow in the distance. Single continuous shot.
```


### #6 맵 전경: 레벨 레이아웃 (10초)

```text
[공통 스타일 블록]
Slow aerial orbit over a giant cozy toy store diorama seen from above at a 45 degree angle: long aisles of
wooden shelves, a central pile of giant plush cushions, a toy train track looping around, a ball pit, a
stack of toy boxes, a checkout counter with a giant music box. Tiny chubby plush animals scurrying between
aisles. Warm lamplight pools and soft blue night shadows. Clear readable layout, no text, steady camera.
```

### #7 탑다운 게임 카메라 버전 (10초)

```text
[공통 스타일 블록]
Top-down 3D game camera looking straight down at a toy store floor. A grey plush shark seeker with a
flashlight walks through, its cone of warm light sweeping across the floor. Small chubby plush animals
freeze in place whenever the light cone touches them and move again when it passes, scurrying from shelf
shadow to shelf shadow. Clean readable composition, steady camera, single continuous shot.
```

### #8 라운드 종료: 승리 연출 (10초)

```text
[공통 스타일 블록]
In the middle of a pastel toy store, the surviving chubby plush animals pop out of their hiding spots and
celebrate: the duckling jumps out of a toy box, the corgi rolls off a shelf, the polar bear bursts from a
ball pit, balls flying. They do clumsy wobbly happy dances while the grey shark seeker flops face-down onto
a giant cushion in defeat. Soft confetti and sparkles. Third-person camera at character height, steady.
```

### #9 롱테이크 트레일러 (선택: 10초 생성 후 Extend 2~5회)

시작 프롬프트:

```text
[공통 스타일 블록]
Cinematic trailer for a cute hide-and-seek party game in a giant toy store at night. Opening: the camera
glides through the dark store as a big wall clock ticks, and chubby plush animals peek out from shelves.
```

Extend할 때마다 이어 붙일 문장:

1. `A grey plush shark seeker switches on its flashlight and starts searching, sniffing the air.`
2. `A pink bunny hiding among stuffed toys tries not to sneeze, trembling while the light gets closer.`
3. `The bunny sneezes, the shark grabs it and tosses it in floppy ragdoll physics into a ball pit.`
4. `The other plush animals sprint in wobbly panic to new hiding spots as the beam sweeps.`
5. `Last survivors burst out cheering, confetti falls, the shark flops onto a cushion in defeat.`

## 6. 만든 영상을 스킬에 넣는 방법

```bash
claude plugin marketplace add lovisdotio/video-to-game
claude plugin install video-to-game@video-to-game
```

영상 `gameplay.mp4`(#1 메인 클립)와 프롬프트 `gameplay.txt`를 프로젝트에 두고, 보조 클립은 `refs/` 폴더에 넣은 뒤 요청합니다:

> Turn `gameplay.mp4` into a playable browser game with the video-to-game skill. The prompt that made it is in
> `gameplay.txt`. The mechanic is "freeze to pretend to be a plush toy when the seeker's flashlight passes".
> Use the clips in `refs/` for the seeker, the grab-and-toss and the level layout. Generate every asset with fal,
> match the video's look, local multiplayer (1 seeker + up to 3 hiders), and show me side-by-side pairs and a
> recorded take of you playing it.

필요한 것: Python 3.9+, ffmpeg, Node 18+ (`playwright-core`), `pip install fal-client`, `FAL_KEY`.

## 7. 30초 게임플레이 영상 (원테이크)

Kling 한 번 생성은 보통 10초(모델에 따라 최대 15초)라서, 30초는 **10초 × 3구간**으로 만듭니다.

- **방법 A (권장)**: 구간 1을 생성 → 마음에 드는 테이크에서 **Extend**에 구간 2 문장 → 다시 Extend에 구간 3 문장.
- **방법 B**: 구간마다 따로 생성하고, 앞 구간의 **마지막 프레임을 다음 구간의 첫 프레임(Image-to-Video)**으로 넣은 뒤 편집기로 이어 붙이기.
- **방법 C**: 30초 단일 생성이나 멀티샷을 지원하는 모드라면 아래 "통합 프롬프트"를 한 번에 넣기.

카메라를 바꾸지 않는 것이 핵심입니다. 세 구간 모두 같은 카메라(주인공 뒤 3인칭)를 써야 "실제 플레이 녹화"처럼 보이고,
video-to-game 스킬에 넣었을 때도 안정된 샷으로 읽힙니다.

### 통합 프롬프트 (30초)

```text
[공통 스타일 블록]
30-second continuous gameplay recording of a cute 3D hide-and-seek party game, captured from a real play
session. One unbroken shot, third-person game camera locked behind and slightly above the player character,
smooth game-like follow with slight lag, no cuts, no cinematic angles.
The player is a chubby yellow plush duckling with a red bandana inside a giant cozy toy store at night,
tall wooden shelves packed with real stuffed toys, warm lamplight pools and soft blue shadows.
0-10s: the duckling sprints in wobbly clumsy steps down an aisle while other plush animals (orange corgi,
pink bunny, polar bear cub) scatter to hide; it trips, rolls, gets up and climbs onto a low shelf between
real stuffed toys.
10-20s: a grey plush shark seeker with a big flashlight waddles into the aisle; the beam sweeps across the
shelf; the duckling freezes in a stiff silly toy pose and the beam passes over it; further down the aisle
the pink bunny wobbles, the shark grabs it and tosses it in floppy ragdoll physics into a ball pit.
20-30s: the shark turns away; the duckling hops down and dashes to a safer hiding spot inside an open toy
box, closing the lid just as the flashlight returns; the beam lingers, then moves on; the lid lifts
slightly and the duckling peeks out with a relieved wobble.
Consistent characters and lighting throughout, readable game composition. No text, no HUD, no UI.
```

### 구간별 프롬프트 (Extend / 이어 붙이기용)

**구간 1 (0~10초): 숨을 곳 찾기**

```text
[공통 스타일 블록]
Continuous gameplay recording, third-person game camera locked behind and slightly above a chubby yellow
plush duckling with a red bandana, smooth follow, no cuts. Inside a giant cozy toy store at night, tall
wooden shelves full of real stuffed toys. The duckling sprints in wobbly clumsy steps down the aisle while
an orange corgi, a pink bunny and a polar bear cub scatter to hide around it. The duckling trips, rolls,
pops back up and climbs onto a low shelf, squeezing between real stuffed toys.
```

**구간 2 (10~20초): 손전등 통과 + 다른 플레이어 발각** (Extend 문장)

```text
Same camera behind the duckling. A grey plush shark seeker with a big flashlight waddles into the aisle,
sniffing the air. The warm beam sweeps across the shelf; the duckling freezes in a stiff silly toy pose and
the light passes over it. Further down the aisle the pink bunny wobbles; the shark grabs it in a floppy hug
and tosses it in ragdoll physics into a ball pit, balls bouncing everywhere.
```

**구간 3 (20~30초): 탈출과 재은신** (Extend 문장)

```text
Same camera behind the duckling. The shark turns away; the duckling hops down and dashes in wobbly steps to
an open toy box, dives in and closes the lid just as the flashlight swings back. The beam lingers on the
box, then moves on. The lid lifts slightly and the duckling peeks out with a relieved wobble.
```

**팁**
- 구간마다 3테이크 정도 뽑고, 캐릭터 얼굴과 색이 가장 덜 변한 것을 이어 갑니다.
- #0 캐릭터 시트를 레퍼런스 이미지로 넣으면 30초 동안 오리가 다른 캐릭터로 변하는 일이 크게 줄어듭니다.
- 스킬에 넣을 때는 30초 전체를 `gameplay.mp4`로 넣어도 되지만, 스킬은 그중 가장 안정된 10초 정도를 기준으로 삼습니다.
