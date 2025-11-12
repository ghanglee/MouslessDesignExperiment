# Revit MCP send_code_to_revit 사용 가이드

## 개요

`send_code_to_revit`는 revit-mcp 프로젝트에서 제공하는 도구로, AI가 생성한 C# 코드를 Revit에서 직접 실행할 수 있게 해주는 강력한 기능입니다. 이 문서는 해당 도구를 올바르게 사용하기 위한 상세한 가이드입니다.

## 핵심 개념

### 템플릿 구조
- 작성한 코드는 미리 정의된 템플릿의 `Execute` 메서드 내부에 삽입됩니다
- 템플릿에는 이미 필요한 using 문과 클래스 구조가 포함되어 있습니다
- 사용자는 Execute 메서드 내부에서 실행될 코드만 작성해야 합니다
- **중요**: send_code_to_revit는 자동으로 트랜잭션을 관리합니다. 직접 트랜잭션을 생성하면 오류가 발생합니다

### 메서드 시그니처
```csharp
public object Execute(Document document, object[] parameters)
{
    // 여기에 사용자 코드가 삽입됩니다
}
```

## 사용 가능한 변수

### 1. document (Document 타입)
- 현재 Revit 문서에 대한 참조
- Revit API의 모든 Document 관련 작업에 사용
- 예시:
  ```csharp
  var activeView = document.ActiveView;
  var title = document.Title;
  ```

### 2. parameters (object[] 타입)
- 도구 호출 시 전달된 추가 파라미터 배열
- 기본적으로 빈 배열이거나 null일 수 있음
- 사용 전 null 체크 권장:
  ```csharp
  var paramCount = parameters?.Length ?? 0;
  ```

## 코드 작성 규칙

### 필수 규칙

1. **반드시 return 문 포함**
   ```csharp
   // 올바른 예
   TaskDialog.Show("테스트", "완료");
   return "성공";
   
   // 잘못된 예 - return 문 없음
   TaskDialog.Show("테스트", "완료");
   ```

2. **Execute 메서드 내부 코드만 작성**
   ```csharp
   // 올바른 예
   var walls = new FilteredElementCollector(document)
       .OfCategory(BuiltInCategory.OST_Walls)
       .ToElements();
   return walls.Count + "개의 벽을 찾았습니다";
   
   // 잘못된 예 - using 문 포함
   using System;
   using Autodesk.Revit.DB;
   
   public class MyClass
   {
       // 코드
   }
   ```

3. **문자열 보간 사용 불가**
   ```csharp
   // 올바른 예 - 일반 문자열 연결
   string message = "벽 개수: " + wallCount;
   
   // 잘못된 예 - 문자열 보간
   string message = $"벽 개수: {wallCount}";
   ```

### 금지 사항

1. **using 문 작성 금지**
   - 모든 필요한 네임스페이스는 이미 템플릿에 포함되어 있음
   - 주의: System.Linq는 포함되지 않으므로 LINQ 사용 불가

2. **클래스나 메서드 선언 금지**
   - 코드는 이미 Execute 메서드 내부에서 실행됨
   - 로컬 함수 선언도 불가능
   - 람다식(Func, Action)은 사용 가능

3. **네임스페이스 선언 금지**

4. **static 필드나 메서드 선언 금지**

5. **직접적인 트랜잭션 생성 금지**
   - send_code_to_revit가 자동으로 트랜잭션을 관리함
   - Transaction 객체를 직접 생성하면 오류 발생

## UIDocument 접근 방법

Document만으로는 UI 관련 작업(선택, 뷰 조작 등)을 할 수 없습니다. UIDocument가 필요한 경우:

```csharp
// UIApplication 인스턴스 생성
UIApplication uiapp = new UIApplication(document.Application);

// UIDocument 가져오기
UIDocument uidoc = uiapp.ActiveUIDocument;

// 이제 선택된 엘리먼트 가져오기 가능
ICollection<ElementId> selectedIds = uidoc.Selection.GetElementIds();
```

## 트랜잭션 관리

### 자동 트랜잭션 처리
**중요**: `send_code_to_revit`는 자동으로 트랜잭션을 관리합니다. 따라서:
- 모델 수정 작업(엘리먼트 생성, 수정, 삭제 등)을 직접 수행할 수 있습니다
- Transaction 객체를 직접 생성하지 마세요 (오류 발생)
- 모든 모델 수정은 도구가 자동으로 처리하는 트랜잭션 내에서 실행됩니다

### 올바른 사용 예시
```csharp
// 트랜잭션 없이 직접 벽 생성
Level level = new FilteredElementCollector(document)
    .OfClass(typeof(Level))
    .FirstElement() as Level;

WallType wallType = new FilteredElementCollector(document)
    .OfClass(typeof(WallType))
    .FirstElement() as WallType;

Line wallLine = Line.CreateBound(new XYZ(0, 0, 0), new XYZ(20, 0, 0));
Wall wall = Wall.Create(document, wallLine, wallType.Id, level.Id, 10, 0, false, false);

return "벽 생성 완료: " + wall.Id.ToString();
```

### 잘못된 사용 예시
```csharp
// 이렇게 하지 마세요!
Transaction trans = new Transaction(document, "내 작업");
trans.Start();  // 오류 발생!
// ...
```

## 예외 처리

### 기본 패턴
```csharp
try
{
    // 메인 코드
    return "성공";
}
catch (Exception ex)
{
    TaskDialog.Show("오류", "오류 발생: " + ex.Message);
    return "실패: " + ex.Message;
}
```

### 트랜잭션과 함께 사용
```csharp
Transaction trans = new Transaction(document, "작업");
try
{
    trans.Start();
    // 작업 수행
    trans.Commit();
    return "성공";
}
catch (Exception ex)
{
    if (trans.HasStarted())
        trans.RollBack();
    return "오류: " + ex.Message;
}
```

## 실제 사용 예시

### 예시 1: 선택된 엘리먼트의 ID 표시
```csharp
UIApplication uiapp = new UIApplication(document.Application);
UIDocument uidoc = uiapp.ActiveUIDocument;
ICollection<ElementId> selectedIds = uidoc.Selection.GetElementIds();

if (selectedIds.Count == 0)
{
    TaskDialog.Show("알림", "엘리먼트를 선택하세요.");
    return "선택된 엘리먼트 없음";
}

string idList = "";
foreach (ElementId id in selectedIds)
{
    Element elem = document.GetElement(id);
    idList += "ID: " + id.ToString() + " - " + elem.Name + "\n";
}

TaskDialog.Show("선택된 엘리먼트", idList);
return "완료";
```

### 예시 2: 모든 벽 개수 확인
```csharp
FilteredElementCollector collector = new FilteredElementCollector(document)
    .OfCategory(BuiltInCategory.OST_Walls)
    .WhereElementIsNotElementType();

int wallCount = collector.GetElementCount();
TaskDialog.Show("벽 개수", "프로젝트의 벽 개수: " + wallCount);

return "벽 개수: " + wallCount;
```

### 예시 3: 텍스트 노트 생성 (트랜잭션 불필요)
```csharp
View activeView = document.ActiveView;

// 텍스트 노트 타입 가져오기
FilteredElementCollector textNoteTypes = new FilteredElementCollector(document)
    .OfClass(typeof(TextNoteType));
TextNoteType textNoteType = textNoteTypes.FirstElement() as TextNoteType;

if (textNoteType == null)
{
    return "텍스트 노트 타입을 찾을 수 없음";
}

// 텍스트 노트 생성 위치
XYZ position = new XYZ(0, 0, 0);

// 텍스트 노트 옵션
TextNoteOptions options = new TextNoteOptions();
options.TypeId = textNoteType.Id;
options.HorizontalAlignment = HorizontalTextAlignment.Center;

// 텍스트 노트 생성 - 트랜잭션 없이 직접 생성
TextNote textNote = TextNote.Create(document, activeView.Id, position, "Hello Revit!", options);

return "텍스트 노트 생성 완료: " + textNote.Id.ToString();
```

### 예시 4: 엘리먼트 수정
```csharp
// 벽의 파라미터 수정
Wall wall = /* 벽 가져오기 */;
Parameter commentsParam = wall.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
if (commentsParam != null && !commentsParam.IsReadOnly)
{
    commentsParam.Set("수정된 값");
    return "파라미터 수정 완료";
}
```

### 예시 5: 엘리먼트 변환 (이동, 복사, 회전)
```csharp
// 엘리먼트 이동
XYZ translationVector = new XYZ(3.28084, 0, 0); // 1000mm in feet
ElementTransformUtils.MoveElement(document, elementId, translationVector);

// 엘리먼트 복사
XYZ copyVector = new XYZ(0, 6.56168, 0); // 2000mm in feet
ICollection<ElementId> copiedIds = ElementTransformUtils.CopyElement(document, elementId, copyVector);

// 엘리먼트 회전
Line axis = Line.CreateBound(centerPoint, centerPoint + XYZ.BasisZ);
double angleRadians = 45.0 * Math.PI / 180.0;
ElementTransformUtils.RotateElement(document, elementId, axis, angleRadians);

return "변환 완료";
```

### 예시 6: 패밀리 인스턴스 배치
```csharp
// 패밀리 심볼 찾기
FamilySymbol symbol = new FilteredElementCollector(document)
    .OfCategory(BuiltInCategory.OST_Furniture)
    .OfClass(typeof(FamilySymbol))
    .FirstElement() as FamilySymbol;

// 심볼 활성화
if (!symbol.IsActive)
{
    symbol.Activate();
    document.Regenerate();
}

// 인스턴스 생성
Level level = document.ActiveView.GenLevel;
XYZ location = new XYZ(10, 10, 0);
FamilyInstance instance = document.Create.NewFamilyInstance(
    location, 
    symbol, 
    level, 
    Autodesk.Revit.DB.Structure.StructuralType.NonStructural
);

return "패밀리 배치 완료: " + instance.Id.ToString();
```

### 예시 7: 엘리먼트 ID 태깅 (중요 기능)
```csharp
// 현재 뷰의 모든 엘리먼트에 ID 태그 생성
View activeView = document.ActiveView;

// 텍스트 노트 타입 가져오기 (가장 작은 크기)
var textNoteTypes = new FilteredElementCollector(document)
    .OfClass(typeof(TextNoteType))
    .ToElements();

TextNoteType smallestType = null;
double smallestSize = double.MaxValue;

foreach (Element elem in textNoteTypes)
{
    TextNoteType tnt = elem as TextNoteType;
    if (tnt != null)
    {
        Parameter sizeParam = tnt.get_Parameter(BuiltInParameter.TEXT_SIZE);
        if (sizeParam != null && sizeParam.HasValue)
        {
            double size = sizeParam.AsDouble();
            if (size < smallestSize && size > 0)
            {
                smallestSize = size;
                smallestType = tnt;
            }
        }
    }
}

// 텍스트 옵션 설정
TextNoteOptions options = new TextNoteOptions();
options.TypeId = smallestType.Id;
options.HorizontalAlignment = HorizontalTextAlignment.Center;

// 모든 모델 엘리먼트 찾기
var elements = new FilteredElementCollector(document, activeView.Id)
    .WhereElementIsNotElementType()
    .ToElements();

int tagCount = 0;
foreach (Element elem in elements)
{
    // 태그 가능한 카테고리만 처리
    if (elem.Category == null) continue;
    if (elem is TextNote || elem is IndependentTag) continue;
    
    // 위치 가져오기
    XYZ location = null;
    LocationPoint locPoint = elem.Location as LocationPoint;
    if (locPoint != null)
    {
        location = locPoint.Point;
    }
    else
    {
        LocationCurve locCurve = elem.Location as LocationCurve;
        if (locCurve != null)
        {
            location = locCurve.Curve.Evaluate(0.5, true);
        }
    }
    
    if (location == null) continue;
    
    // ID 태그 생성
    string idText = "[" + elem.Id.ToString() + "]";
    XYZ tagLocation = new XYZ(location.X, location.Y + 2, location.Z);
    
    try
    {
        TextNote tag = TextNote.Create(document, activeView.Id, tagLocation, idText, options);
        if (tag != null) tagCount++;
    }
    catch { }
}

return "ID 태그 생성 완료: " + tagCount + "개";
```

### 예시 8: 기존 ID 태그 정리 및 재생성
```csharp
// 기존 ID 태그 삭제 (대괄호로 시작하는 텍스트)
var textNotes = new FilteredElementCollector(document, document.ActiveView.Id)
    .OfClass(typeof(TextNote))
    .ToElements();

List<ElementId> idsToDelete = new List<ElementId>();
foreach (Element elem in textNotes)
{
    TextNote tn = elem as TextNote;
    if (tn != null && tn.Text != null && tn.Text.StartsWith("["))
    {
        idsToDelete.Add(tn.Id);
    }
}

if (idsToDelete.Count > 0)
{
    document.Delete(idsToDelete);
}

return "삭제된 ID 태그: " + idsToDelete.Count + "개";
```



## 디버깅 팁

1. **TaskDialog 활용**
   ```csharp
   TaskDialog.Show("디버그", "변수 값: " + myVariable);
   ```

2. **단계별 실행**
   - 복잡한 코드는 작은 단위로 나누어 테스트
   - 각 단계에서 TaskDialog로 상태 확인

3. **반환값 활용**
   - return 문을 통해 실행 결과와 디버그 정보 반환
   ```csharp
   return "처리된 엘리먼트: " + count + ", 실패: " + failCount;
   ```

## 일반적인 오류와 해결방법

### 1. "코드 경로 중 일부만 값을 반환합니다"
- **원인**: return 문이 없거나 조건문에서 일부 경로에만 return이 있음
- **해결**: 모든 코드 경로에 return 문 추가

### 2. "개체 참조가 필요합니다"
- **원인**: static 메서드를 인스턴스 메서드처럼 호출하거나 반대의 경우
- **해결**: 올바른 호출 방식 사용

### 3. "예기치 않은 '$' 문자입니다"
- **원인**: 문자열 보간 사용
- **해결**: 일반 문자열 연결 사용

### 4. "'Document'은(는) '형식'이지만 '변수'처럼 사용됩니다"
- **원인**: Document를 변수명으로 사용 (타입명과 충돌)
- **해결**: document (소문자) 사용

## 성능 고려사항

1. **FilteredElementCollector 효율적 사용**
   ```csharp
   // 효율적 - 뷰 기반 필터링
   var collector = new FilteredElementCollector(document, activeView.Id);
   
   // 비효율적 - 전체 문서 검색
   var collector = new FilteredElementCollector(document);
   ```

2. **대량 작업 시 단일 트랜잭션 사용**
   ```csharp
   Transaction trans = new Transaction(document, "대량 작업");
   trans.Start();
   
   // 여러 작업 수행
   foreach (var item in items)
   {
       // 작업 수행
   }
   
   trans.Commit();
   ```

## 단위 변환

### Revit 내부 단위
Revit API는 내부적으로 Imperial 단위를 사용합니다:
- **길이**: Feet (피트)
- **각도**: Radians (라디안)

### 변환 공식
```csharp
// 밀리미터 ↔ 피트
double mm_to_feet = mm / 304.8;
double feet_to_mm = feet * 304.8;

// 도 ↔ 라디안
double degrees_to_radians = degrees * Math.PI / 180.0;
double radians_to_degrees = radians * 180.0 / Math.PI;

// 람다식으로 변환 함수 정의
Func<double, double> mmToFeet = (mm) => mm / 304.8;
Func<double, double> feetToMm = (feet) => feet * 304.8;
```

## 주의사항

1. **Revit API 버전 호환성**
   - 일부 API는 Revit 버전에 따라 다를 수 있음
   - 예: `ElementId.IntegerValue`는 Revit 2024에서 deprecated
   - 대안: `elem.Id.Value` 사용

2. **실행 시간 제한**
   - 너무 오래 실행되는 코드는 타임아웃 될 수 있음
   - 대량 작업은 작은 단위로 나누어 처리

3. **메모리 관리**
   - 대량의 엘리먼트 처리 시 메모리 사용량 주의
   - 필요시 결과를 나누어 처리

4. **뷰 종속적 작업**
   - 일부 작업은 특정 뷰에서만 가능
   - 예: 텍스트 노트는 평면도나 단면도에서만 생성 가능

5. **패밀리 심볼 활성화**
   - 패밀리 인스턴스 생성 전 심볼 활성화 필요
   - `symbol.Activate()` 후 `document.Regenerate()` 호출

## 고급 팁과 노하우

### 사용 가능한 C# 기능
- **기본 C# 문법**: var, if, for, foreach, while, try-catch 등
- **람다식**: Func<T>, Action<T> 사용 가능
- **컬렉션**: List<T>, Dictionary<TKey, TValue>, 배열
- **날짜/시간**: DateTime, TimeSpan
- **수학**: Math 클래스의 모든 메서드

### 사용 불가능한 C# 기능
- **LINQ**: System.Linq 미포함 (Where, Select, GroupBy 등 사용 불가)
- **문자열 보간**: $ 문법 사용 불가
- **널 조건 연산자**: ?. ?? 사용 불가
- **로컬 함수**: 메서드 내 함수 선언 불가
- **async/await**: 비동기 프로그래밍 불가
- **StringBuilder**: System.Text.StringBuilder 미포함

### 특수 Revit 타입 제한
일부 Revit 타입은 직접 사용할 수 없고 Element로만 처리 가능:
- Room, Space 등의 특수 타입
- 대신 파라미터를 통해 접근

### 성능 최적화 팁
1. **반복문 최적화**: LINQ 대신 전통적인 for/foreach 사용
2. **메모리 관리**: 대량 데이터 처리 시 배치 처리
3. **필터 효율성**: FilteredElementCollector에 뷰 ID 전달로 범위 제한

## 문제 해결 팁

### 타임아웃 오류
"실행 코드 실패: 코드 실행 타임아웃"
- 복잡한 연산을 여러 단계로 분할
- 대량 데이터 처리 시 배치 크기 제한

### 컴파일 오류
- using 문 제거
- 문자열 보간($) 대신 + 연산자 사용
- 널 조건 연산자(?.) 대신 명시적 null 체크

### 런타임 오류
- 트랜잭션 직접 생성 금지
- 모든 코드 경로에 return 문 포함
- 파라미터 null 체크 철저히

## 결론

`send_code_to_revit`는 Revit 자동화를 위한 강력한 도구입니다. 특히 자동 트랜잭션 관리 기능 덕분에 모델 수정 작업을 간단하게 수행할 수 있습니다. 

이 가이드에서 설명한 규칙과 제약사항을 이해하고 사용하면, 효과적으로 Revit 자동화 코드를 작성할 수 있습니다.

### 핵심 요약
1. **트랜잭션 자동 처리** - 직접 생성 불필요
2. **Execute 메서드 내부 코드만 작성**
3. **모든 코드 경로에 return 문 포함**
4. **LINQ, 문자열 보간 사용 불가**
5. **단위 변환 주의** (feet/mm, radians/degrees)

### 상황별 활용 예시

#### 프로젝트 분석
- 엘리먼트 개수 확인
- 카테고리별 통계
- 파라미터 값 추출

#### 모델 수정
- 엘리먼트 생성 (벽, 문, 창, 가구 등)
- 파라미터 일괄 수정
- 엘리먼트 이동/복사/회전/삭제

#### 시각화 및 주석
- ID 태그 자동 생성
- 텍스트 노트 배치
- 치수선 생성
- 상세선 그리기

#### 데이터 처리
- 룸 면적 계산
- 그리드 라인 생성
- 뷰 관리 및 필터링

### 마무리

이 가이드는 실제 테스트를 통해 검증된 내용을 기반으로 작성되었습니다. `send_code_to_revit`는 Revit 자동화를 위한 강력한 도구이며, 이 가이드를 참고하여 효율적인 BIM 자동화를 구현할 수 있습니다.

문의사항이나 추가 예제가 필요한 경우, 새로운 테스트를 통해 가이드를 업데이트하겠습니다.