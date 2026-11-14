# Museum Flow
박물관 운영자용 대시보드 프로젝트

박물관 방문 데이터를 시각화하고, 관객 특성과 시설 간 연관성을 분석해 운영 전략 수립을 돕습니다.

## 실행 준비

Python 3.9 이상과 Node.js 22.12 이상인 LTS 버전을 설치하세요. Windows에서 Python 설치 시 **Add python.exe to PATH**를 선택하세요.

원본 데이터는 저장소에 포함하지 않습니다. 실행 전에 `data/` 폴더에 아래 패턴에 맞는 CSV를 각각 하나씩 직접 추가하세요. 임의의 CSV가 아닌 프로그램에서 요구하는 컬럼과 형식의 데이터여야 합니다.

- `*_FST_TBL.csv`: 일별 방문 데이터
- `*_SECD_TBL.csv`: 월별 시설 간 연관 데이터

백엔드 첫 실행 시 CSV를 검증하고 로컬 DB를 자동 생성합니다. CSV는 이후 서버 시작 시에도 필요합니다. 생성된 DB, 분석 보고서(`analysis/`), 내부 문서(`docs/`)는 저장소에서 제외합니다.

## Mac / Windows 실행 방법

GitHub에서 받은 ZIP은 먼저 압축을 풀고 CSV 두 개를 `data/`에 넣으세요.

아래 명령은 프로젝트 루트 폴더에서 실행합니다. 첫 설치에는 인터넷 연결이 필요합니다.

### Mac: 백엔드

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

### Windows: 백엔드 (PowerShell)

```powershell
py -3 -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

`py` 명령이 없고 `python --version`이 설치한 Python을 표시한다면 첫 명령의 `py -3` 대신 `python`을 사용하세요. 가상환경 활성화는 필요하지 않습니다.

### 프런트엔드 (Mac / Windows 공통)

별도 터미널을 프로젝트 루트 폴더에서 열고 실행하세요.

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Windows PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

브라우저에서 http://127.0.0.1:5173 에 접속합니다. 실행 중에는 터미널 두 개를 열어 두고, 종료할 때는 **각 터미널에서 Ctrl+C**를 누르세요. 이후 실행 시에는 가상환경 생성과 패키지 설치 명령을 생략하고 각 서버 실행 명령만 사용하면 됩니다. 의존성 파일이 바뀌면 패키지를 다시 설치하세요.

8000 또는 5173 포트를 다른 서버가 사용 중이면 기존 서버를 종료한 뒤 실행하세요. `.venv`와 `node_modules`는 운영체제 간 복사하지 말고 각 컴퓨터에서 설치하세요.

## 데모 로그인

로그인 화면이 표시되면 아래 공통 데모 계정을 사용하세요.

- 아이디: `abcd`
- 비밀번호: `1234`

프런트엔드 코드에 고정된 UI 체험용 계정입니다. 실제 사용자 인증이나 접근 권한 보호 기능은 제공하지 않습니다.

## 상세 안내

- [프런트엔드 실행 안내](frontend/README.md)
- [FastAPI + DuckDB 백엔드 실행 및 API 안내](backend/README.md)

## 추가 기능 수정본

시설 비교·행사 전후 분석·운영 캘린더를 추가했습니다. Windows 실행 파일과 상세 사용법은 [추가기능_사용안내.md](추가기능_사용안내.md)를 참고하세요. 이번 통합 ZIP은 GitHub 업로드용 소스 코드입니다. 기업 CSV는 포함하지 않습니다. 로컬 실행 시 별도로 받은 CSV 두 개를 data/에 넣으세요. 팀의 방문 패턴 군집·유사 박물관 그룹 기능도 유지했습니다.
