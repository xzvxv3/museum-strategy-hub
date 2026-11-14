# 상황별 두더지

현재 표시 자산은 파란 모자·크림색 수염으로 통일했습니다. 색상 편집 프롬프트는 [BLUE_MASCOTS.md](BLUE_MASCOTS.md)를 참고하세요. 아래는 최초 생성 기록입니다.

내장 `image_gen` 도구로 기존 `mole-explorer.png`를 참조해 생성했습니다. 화면 구성은 유지하고 이미지의 역할만 구분합니다.

| 파일 | 사용 위치 | 동작 |
| --- | --- | --- |
| mole-explorer.png | 사이드바 로고 | 기본 캐릭터 |
| mole-welcome.png | 로그인 | 손을 흔들며 인사 |
| mole-strategy.png | 홈 운영전략 카드 | 새싹 화분 돌보기 |
| mole-investigate.png | 박물관 유형 판정 대기·확인 안내 | 돋보기와 탐사 수첩으로 조사 |
| mole-success.png | 저장 완료 안내 | 기록 수첩을 안고 엄지 올리기 |

공통 생성 프롬프트:

> Create a new pose of the exact mole character in the reference. Preserve identity, warm chestnut brown body, cream peach round face/belly, large pink oval nose, shiny black oval eyes, pink cheeks, sage green miner cap with forest green strap and pale yellow oval lamp. Same soft simple hand-painted storybook illustration, clean rounded silhouettes. Single character isolated on genuinely transparent background. No backdrop, text, lettering, UI, border, floor, extra characters, or floating decorative symbols. Keep the complete silhouette and props visible with 12% transparent margin. Readable at small UI size.

각 이미지에 추가한 프롬프트:

- Welcome: Friendly welcoming mole, one paw raised high waving hello, cheerful open smile, other paw resting on belly. Slightly turned body. A welcoming login illustration. Bust view including both paws and belly.
- Strategy: Thoughtful gardening mole with a small cream terracotta plant pot held in both paws, a clear two-leaf sage green seedling growing in it. Looking fondly at the seedling with a soft happy smile, head slightly tilted. The seedling symbolizes nurturing an operating strategy. Bust view, clearly different pose from reference.
- Investigate: Curious detective mole peering through a round magnifying glass held beside and in front of one eye, eye visibly slightly magnified, other paw holds a small blank cream field notebook. Focused friendly expression, head tilted to the side. Bust view. The magnifier is large and easy to recognize, not covering pink nose.
- Success: Delighted mole hugging a small closed cream field notebook with green cover trim, eyes curved into joyful closed-eye arcs, one paw raised in a clear thumbs-up gesture. Tiny smile. Celebrating a saved record. Bust view. No checkmark or other floating icon.
