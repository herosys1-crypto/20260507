# 거래처 견적서 관리

과거 작업 견적서를 검색 데이터로 만들고, 새 견적서 초안을 빠르게 작성한 뒤 실제 견적서 파일로 저장하는 로컬 업무 도구입니다.

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

1. 검색창 또는 부품별 검색칸에서 부품명, 모델명, 업체명을 검색합니다.
2. 검색 결과는 품목별로 나뉘고, 각 품목 안에서 최근 견적일 우선으로 표시됩니다.
3. 기존 견적 단가의 `VAT excl` / `VAT incl`를 확인합니다.
4. 필요한 품목은 `추가`를 눌러 견적 초안에 담습니다.
5. 오른쪽 초안에서 수량과 단가를 조정합니다.
6. `견적서 파일 만들기`를 누르면 새 견적서가 생성되고 Excel로 열립니다.

## 수동 견적서 추가

직접 만든 신규 견적서는 한 곳에만 넣습니다.

```text
data/manual_inbox
```

예:

```text
C:\Users\user\OneDrive\문서\거래처견적서\data\manual_inbox\케이제이씨_최선현팀장_12400F.xlsx
```

파일명에는 업체명 또는 개인 이름을 넣어두는 것을 권장합니다. 사람이 업체별 폴더를 만들 필요는 없습니다.

웹앱 왼쪽의 `데이터 갱신`을 누르면 시스템이 `data/manual_inbox` 안의 견적서를 아래 폴더로 월별 정리한 뒤 검색 데이터에 반영합니다.

```text
data/raw_estimates/견적서/수동정리/YYYY-MM
```

## 데이터 폴더

```text
data/manual_inbox    수동 견적서 투입함
data/raw_estimates   정리된 원본 견적서 보관
data/processed       검색용 CSV/엑셀/캐시
data/exports         새로 생성한 견적서
data/templates       견적서 양식
```

`data/` 아래 원본과 결과물은 GitHub에 올리지 않습니다. `data/manual_inbox/.gitkeep`만 폴더 유지를 위해 커밋됩니다.

## 지원 파일

```text
.xlsx 자동 추출
.xls 자동 추출
```

`.xls` 추출에는 `xlrd` 패키지가 필요합니다.

## 견적서 양식

`data/templates/quote_template.xlsx`가 있으면 새 견적서 생성 때 이 파일을 양식으로 사용합니다. 로고, 회사 정보, 도장이 들어간 기존 견적서를 이 이름으로 두면 생성 견적서에서도 유지됩니다.

이미지와 도장을 안정적으로 보존하기 위해 Windows Excel 자동화를 우선 사용합니다. `pywin32`가 설치되어 있으면 Excel을 백그라운드에서 열고 필요한 값만 수정한 뒤 저장합니다.
