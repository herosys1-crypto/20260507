# 거래처 견적서 관리

과거 엑셀 견적서를 검색 데이터로 만들고, 새 견적서 초안을 작성한 뒤 엑셀 견적서 파일로 저장하는 로컬 업무 도구입니다.

## 실행

처음 한 번만 필요한 Python 패키지를 설치합니다.

```text
install_dependencies.bat
```

`start_app.bat`를 실행한 뒤 브라우저에서 아래 주소를 사용합니다.

```text
http://localhost:8787
```

## 기본 사용 흐름

1. 검색창에서 부품명, 모델명, 업체명을 검색합니다.
2. 과거 견적 단가를 확인합니다.
3. 필요한 품목을 새 견적 초안에 추가합니다.
4. `VAT incl` 또는 `VAT excl` 단가를 조정합니다.
5. `견적서 파일 만들기`를 눌러 새 엑셀 견적서를 생성합니다.
6. 생성된 견적서는 `data/exports`와 `data/raw_estimates/견적서/거래처명`에 저장됩니다.
7. 직접 만든 견적서는 `data/raw_estimates/견적서/업체명`에 넣고 웹의 `데이터 갱신`을 누릅니다.

## 데이터 폴더

```text
data/raw_estimates   원본 견적서 보관
data/processed       검색용 CSV/엑셀/캐시
data/exports         새로 생성한 견적서
```

`data/` 아래 원본과 결과물은 GitHub에 올리지 않습니다.

## 지원 파일

```text
.xlsx 자동 추출
.xls 자동 추출
```

`.xls` 추출에는 `xlrd` 패키지가 필요합니다.
