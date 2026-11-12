# GitHub에 올리는 순서

이 ZIP은 업로드용 전체 소스입니다. 기업 CSV, 설치 폴더, 생성 DB는 제외했습니다.

1. ZIP을 새 폴더에 압축 해제합니다.
2. GitHub에서 feature/wonjun-operations 브랜치가 선택되어 있는지 확인합니다.
3. 파일 목록 옆 + → Upload files를 누릅니다.
4. 압축 해제한 museum-strategy-hub 폴더를 엽니다. 그 안의 backend, frontend, data 및 루트 파일들을 업로드합니다. 바깥 museum-strategy-hub 폴더 자체나 ZIP을 올리지 않습니다.
5. 업로드 경로가 backend/app/main.py처럼 시작하는지 확인합니다. data 폴더에는 README.md만 있어야 합니다.
6. 커밋 메시지: feat: integrate facility comparison and operations tools
7. Commit directly to the feature/wonjun-operations branch를 선택해 저장합니다.
8. Pull requests → New pull request에서 base: main, compare: feature/wonjun-operations를 선택합니다.
9. 변경 파일을 확인한 뒤 PR을 만듭니다. 팀원이 검토하고 로컬에서 실행 확인한 후 Merge합니다.

통합 기준 커밋은 be7a61fb7e5d6bbc838c50552d4a7f2065aadf9f입니다. 이후 팀 코드가 추가로 바뀌었으면 먼저 차이를 확인합니다.
로컬 실행용 CSV를 복사한 폴더를 웹으로 업로드하지 마세요.

## PR 설명에 넣을 내용

팀의 방문 패턴 군집·유사 박물관 그룹을 유지하면서 시설 비교, 행사 전후 분석, 운영 캘린더를 통합했습니다. 행사 기록은 브라우저에 저장되며, 자료가 부족한 기간은 분석 대기로 표시합니다. 전후 변화는 인과적 행사 효과를 의미하지 않습니다.

검증: 백엔드 51개, 일정 저장 6개, React DOM 통합 검사, 빌드·ESLint 통과. 실제 Windows 실행 및 브라우저/모바일 배치는 팀 확인이 필요합니다. 기업 CSV와 생성 DB는 포함하지 않았습니다.
