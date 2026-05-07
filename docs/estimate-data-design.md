# 거래처 견적서 데이터 정리 설계

## 목표

기존 엑셀 견적서에서 품목 데이터를 모아 빠르게 검색하고, 신규 견적서를 작성할 때 이전 견적 단가와 유사 부품 견적 이력을 참고할 수 있게 한다.

## 원본 보관 원칙

- `data/raw_estimates/` 아래 원본 견적서를 그대로 보관한다.
- 원본 파일은 수정하지 않는다.
- 폴더명은 업체명 또는 거래처 힌트로 사용한다.
- 정리된 데이터는 `data/processed/` 아래 별도 파일로 만든다.
- 새로 만든 견적서는 `data/exports/` 아래 저장한다.

## 현재 원본 구조

현재 원본은 아래 폴더에 있다.

```text
data/raw_estimates/견적서
```

확인된 주요 하위 폴더:

```text
마인드온
성우
스마트라이프텍
엠에스파워
위메이드
이에이트
케이제이씨
허블_퍼널스
```

## 표준 필드

견적서 파일 단위 필드:

- `source_path`: 원본 파일 경로
- `source_file`: 원본 파일명
- `source_folder`: 원본 폴더명
- `customer_hint`: 폴더명 또는 파일명에서 추정한 거래처
- `quote_date`: 견적일
- `recipient`: 수신
- `attention`: 참조
- `quote_title`: 견적명
- `sheet_name`: 시트명
- `file_modified_at`: 파일 수정일
- `file_extension`: 파일 확장자

품목 단위 필드:

- `item_no`: 품목 번호
- `item_category`: 품명 또는 부품 구분
- `part_name`: 부품명 또는 모델명
- `spec`: 규격
- `quantity`: 수량
- `unit`: 단위
- `quoted_unit_price`: 기존 견적 단가
- `amount`: 금액
- `normalized_part_key`: 검색용 정규화 키

향후 보강 필드:

- `market_unit_price`: 시장 조사 적용 단가
- `market_source`: 시장 조사 출처
- `margin_rate`: 마진율
- `recommended_unit_price`: 추천 견적 단가
- `price_note`: 가격 판단 메모

## 추출 규칙

현재 `xlsx` 샘플 기준으로 견적 품목 표는 대체로 아래 형태다.

```text
No. | 품 명 (Model) | 규 격 (Specification) | 수량 | 단위 | 단가 | 금액
```

다만 표가 A열이 아니라 B열부터 시작하는 경우가 많으므로, 고정 열이 아니라 `No.`가 적힌 셀을 먼저 찾고 그 오른쪽 열들을 품목 데이터로 읽는다.

## 검색 기준

신규 견적 작성 시 아래 순서로 과거 데이터를 찾는다.

1. 같은 거래처의 같은 부품명 또는 모델명
2. 같은 거래처의 비슷한 규격
3. 전체 거래처 중 같은 모델명
4. 전체 거래처 중 같은 부품 구분과 유사 스펙
5. 최신 견적일 기준 단가

검색 시 중요도:

- 정확한 모델명 일치
- 거래처 일치
- 최근 견적일
- 동일 부품 구분
- 수량 차이

## 1차 구현 범위

1차는 `xlsx` 파일에서 품목 데이터를 추출한다.

- `.xlsx`: 자동 추출
- `.xls`: 변환 또는 추가 라이브러리 확인 후 2차 처리

결과 파일:

```text
data/processed/estimate_items.csv
data/processed/estimate_files.csv
data/processed/estimate_search.xlsx
```

## 다음 단계

1. `scripts/extract_estimate_items.py`로 `xlsx` 품목을 추출한다.
2. 추출 결과를 확인해 잘못 읽힌 행을 보정한다.
3. `.xls` 파일 변환 방식을 결정한다.
4. 검색용 간단한 화면 또는 엑셀 출력 파일을 만든다.
5. 신규 견적서 템플릿 자동 작성 기능을 만든다.

## 현재 사용 방법

원본 견적서를 다시 읽어 CSV를 재생성한다.

```powershell
python scripts\extract_estimate_items.py
```

검색용 엑셀 파일을 만든다.

```powershell
python scripts\build_estimate_search_workbook.py
```

원본 재추출과 검색용 엑셀 생성을 한 번에 실행한다.

```powershell
python scripts\update_estimate_database.py
```

추출기는 `data/processed/estimate_extract_cache.json` 캐시를 사용한다. 같은 파일은 다시 열지 않고, 새로 추가되거나 수정된 견적서만 다시 읽는다.

터미널에서 바로 검색한다.

```powershell
python scripts\search_estimate_items.py 5060 --limit 20
python scripts\search_estimate_items.py 12400F 케이제이씨 --limit 20
python scripts\search_estimate_items.py 마이크론 1TB --limit 20
```

엑셀에서 검색하려면 아래 파일을 연다.

```text
data/processed/estimate_search.xlsx
```

`견적품목검색` 시트에서 `Ctrl+F` 또는 필터를 사용해 부품명, 업체명, 수신, 참조, 단가를 찾는다.

## 브라우저 화면 사용

로컬 웹앱을 실행한다.

```powershell
node app\server.js
```

브라우저에서 아래 주소를 연다.

```text
http://localhost:8787
```

화면에서 할 수 있는 일:

- 과거 견적 품목 검색
- 업체/품목 필터
- 과거 견적단가 확인
- 검색 결과를 새 견적 초안에 추가
- 초안 수량과 단가 수정
- 초안 합계 확인
- 초안을 클립보드로 복사
- 초안을 기존 견적서 양식 기반의 새 `.xlsx` 파일로 저장

생성된 견적서 파일은 아래 폴더에 저장된다.

```text
data/exports
```

## 앞으로 새 견적서를 쌓는 방법

새 견적서를 만들거나 받은 뒤에는 원본 파일을 아래 폴더에 복사한다.

```text
data/raw_estimates/견적서
```

업체가 분명하면 업체별 폴더에 넣는다.

```text
data/raw_estimates/견적서/케이제이씨
data/raw_estimates/견적서/스마트라이프텍
data/raw_estimates/견적서/성우
```

업체가 애매하면 일단 `견적서` 바로 아래에 넣고, 나중에 정리한다.

파일명은 검색 품질에 영향을 주므로 아래 형식을 권장한다.

```text
YYYYMMDD_업체명_담당자_핵심부품_수량.xlsx
```

예:

```text
20260507_케이제이씨_최선현팀장_12400F_5060_30대.xlsx
20260507_스마트라이프텍_최지웅_P310_1TB_5대.xlsx
```

파일을 추가한 뒤에는 아래 명령으로 데이터와 검색 엑셀을 갱신한다.

```powershell
python scripts\update_estimate_database.py
```

그러면 아래 파일이 최신 상태가 된다.

```text
data/processed/estimate_items.csv
data/processed/estimate_files.csv
data/processed/estimate_search.xlsx
```

중요:

- 원본 견적서는 `data/raw_estimates/`에 보관한다.
- 원본 파일을 직접 수정하지 않는다.
- 검색용 파일은 `data/processed/estimate_search.xlsx`를 사용한다.
- GitHub에는 원본 견적서와 처리 결과를 올리지 않는다.
