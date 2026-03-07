# LuckyStock AI

AI 한국 주식 투자 판단 엔진.

- 프로덕션: https://luckystock.pages.dev
- 배포 플랫폼: Cloudflare Pages
- 타깃: KOSPI, KOSDAQ

## 핵심 UX

검색하면 3초 내 아래 순서로 결과 제공:

1. AI Decision (BUY/HOLD/SELL)
2. 지금 사는 이유
3. 주의 사항
4. 상승 확률 (1M/3M/1Y)
5. 외국인·기관 수급 (최근 5일)
6. 기술적 분석
7. 밸류에이션

## 점수 체계

Catalyst Score (0~100):

- 뉴스 긍정도 20%
- 실적 성장률 20%
- 외국인 수급 15%
- 기관 수급 15%
- 산업 성장성 20%
- 투자 심리 10%

## AdSense 적용 원칙

- 광고/콘텐츠 명확 구분(광고 라벨 표시)
- 콘텐츠 우선, 광고 후순위 배치
- 과도한 광고 밀도/오해 유도 배치 금지

