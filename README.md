# LuckyStock Backend (Production Spec)

LuckyStock 백엔드는 한국 주식 분석 API, DB 스키마, 배치 워커를 포함합니다.

## Architecture

- Frontend: Cloudflare Pages (정적 페이지)
- Backend API: Node.js + Express
- Database: PostgreSQL
- AI Analysis: OpenAI API
- Batch Worker: Node.js scripts + Cron

## Core Features

- `GET /api/analyze?code=005930`
- `GET /api/top-stocks`
- `GET /api/recent-analysis`
- `GET /api/health`
- `GET /api/db-status`
- `GET /api/autocomplete?q=삼성`
- `GET /api/visitors/today`

## Analysis Cache Policy

- `analysis_cache = 24시간`
- 분석 데이터(`stock_analysis.updated_at`)가 24시간 이내면 DB 캐시 즉시 반환
- 24시간 초과 시 OpenAI 재분석 후 저장

## Environment Variables

`.env` 파일 예시:

```bash
PORT=8787
DATABASE_URL=postgres://user:password@localhost:5432/luckystock
VISITOR_API_BASE_URL=https://api.example.com
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
ANALYSIS_CACHE_HOURS=24
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
PGSSL=disable
```

## Install & Run

```bash
npm install
npm run migrate
npm run batch:stocks
npm run batch:daily
npm run batch:ranking
npm start
```

## Database Schema

마이그레이션 파일: `sql/001_init.sql`

- `stocks`
- `stock_analysis`
- `stock_ranking`
- `batch_runs`

## Batch Jobs

- Daily 00:10: `npm run batch:stocks`
- Market hours sync (every 10m): `npm run batch:market-sync`
- Daily 00:30: `npm run batch:daily`
- Hourly: `npm run batch:ranking`

예시 crontab:

```cron
10 0 * * * cd /home/user/luckstock && /usr/bin/npm run batch:stocks >> /var/log/luckystock-stocks.log 2>&1
*/10 * * * * cd /home/user/luckstock && /usr/bin/npm run batch:market-sync >> /var/log/luckystock-market-sync.log 2>&1
30 0 * * * cd /home/user/luckstock && /usr/bin/npm run batch:daily >> /var/log/luckystock-daily.log 2>&1
0 * * * * cd /home/user/luckstock && /usr/bin/npm run batch:ranking >> /var/log/luckystock-ranking.log 2>&1
```

`batch:market-sync`는 내부에서 KST 기준 평일 09:00~15:30만 실행하고, 그 외 시간은 자동 skip 합니다.

## Visitor Counter

- 방문자 수 집계는 PostgreSQL `daily_visitors` 테이블을 기준으로 처리합니다.
- 고유 사용자 수는 `visit_date + ip_hash` 조합으로 계산합니다.
- 프론트에는 TODAY 숫자만 노출하고, 내부적으로는 `unique_visitors`와 `total_hits`를 함께 저장합니다.
- Cloudflare Pages 함수는 직접 카운트하지 않고 `VISITOR_API_BASE_URL`로 지정한 백엔드 `/api/visitors/today`로 프록시합니다.

## API Examples

### Analyze

`GET /api/analyze?code=005930`

```json
{
  "code": "005930",
  "summary": "AI 반도체 시장 성장 수혜 기업",
  "favor_score": 82,
  "signal": "상승 가능",
  "bull_points": ["...", "...", "..."],
  "future_outlook": "...",
  "risk": "...",
  "foreign_flow": "...",
  "updated_at": "2026-03-08T07:30:00.000Z",
  "cache_hit": true,
  "analysis_source": "cache"
}
```
