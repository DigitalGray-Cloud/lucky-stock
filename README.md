# AI 주식 호재 검색기 (Stock Catalyst Finder)

실제 뉴스 기반 분석 대시보드를 보여주는 웹 서비스입니다.

## 버전

- `v1.1.0` (날짜 라벨 개선, 화이트 UI 고도화, 기업 로고 안정화)

## 배포 링크

- https://ai-product-9194a.web.app

## 실행

```bash
cd /home/user/luckstock
npm start
```

## 접속 링크

- 로컬 링크: http://localhost:8787
- 헬스체크: http://localhost:8787/api/health

## 백엔드 API

- `GET /api/autocomplete?q=nvda`
- `GET /api/news?q=NVIDIA`
- `GET /api/analyze?q=NVDA`

## 실제 데이터 소스

- 시세: Yahoo Finance Quote API
- 뉴스: Google News RSS

## 현재 배포 상태

Firebase CLI는 설치되어 있지만 이 작업공간은 현재 인증 계정이 없어(`firebase login` 필요) 퍼블릭 배포 링크 발급이 막혀 있습니다.
인증 후에는 Firebase Hosting 또는 Cloud Run으로 바로 배포할 수 있습니다.
