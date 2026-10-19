# inapp-add-to-calendar

웹페이지에서 Apple·Google·삼성 캘린더에 **일정 하나를 추가**합니다. 카카오톡·네이버·인스타그램 같은 인앱 브라우저에서도 동작합니다. 캘린더를 **구독**시키지 않습니다.

Add a single event to Apple or Google Calendar from a web page, including inside in-app browsers (KakaoTalk, Naver, Instagram, …). It adds the event; it never subscribes the user to a calendar. No dependencies. About 150 lines.

## 왜 만들었나

모바일 청첩장의 "캘린더에 등록" 버튼을 만들면서 겪은 문제들입니다.

| 상황                                        | 흔한 구현에서 생기는 일                                                                                                                                                       | 이 라이브러리                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| iPhone Safari                               | `webcal://`이나 `.ics` 주소를 OS에 넘기면 캘린더 앱의 **"구독 캘린더 추가"** 화면이 열립니다                                                                                  | 숨은 iframe으로 `.ics`를 엽니다. 페이지 위에 **"캘린더에 추가"** 시트가 뜨고, 닫으면 원래 페이지가 남습니다 |
| 인앱 브라우저·Chrome (iPhone)               | 캘린더 파일을 열지 못하거나 "Safari에서 열고 주소를 붙여넣으세요" 안내만 나옵니다                                                                                             | `x-safari-https://`로 **현재 페이지**를 Safari에서 다시 열고, 거기서 이어서 "캘린더에 추가" 시트를 띄웁니다. 카카오톡이 기본 브라우저를 Chrome으로 여는 경우에도 Safari로 갑니다 |
| 카카오톡 → Safari로 `.ics` 주소를 바로 넘김 | "구독" 화면이 열리고, Safari에는 빈 탭이 남습니다                                                                                                                             | 위와 같이 페이지를 넘기므로 빈 탭이 없습니다                                                                |
| 페이지 자체를 `.ics`로 이동                 | Safari가 받던 스크립트·사진·글꼴 요청을 끊습니다. 지도 스크립트가 끊겨 페이지 전체가 오류 화면이 된 적이 있습니다. 탭 없이 이동하면 "캘린더 초대 허용" 확인도 한 번 더 뜹니다 | 페이지는 그대로 두고 iframe으로만 엽니다. 받던 요청이 끊기지 않고, 확인 창도 뜨지 않습니다                  |
| Google                                      | —                                                                                                                                                                             | "일정 만들기" 링크를 엽니다(구독 아님). 카카오톡에서는 기본 브라우저로 엽니다                               |

## 설치

```sh
pnpm add github:YunKukPark/inapp-add-to-calendar
```

## 사용법

### 1. 서버: `.ics` 파일 제공

iOS는 페이지에서 이동한 `.ics` 응답을 보고 "캘린더에 추가" 시트를 띄웁니다. 그래서 같은 사이트에서 파일을 제공해야 합니다. 아래는 Next.js App Router 예시이고, 다른 서버도 같은 응답이면 됩니다.

```ts
// app/calendar.ics/route.ts
import { toIcs } from "inapp-add-to-calendar";

export function GET() {
  return new Response(toIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="event.ics"'
    }
  });
}
```

```ts
const event = {
  title: "김신랑 ♥ 박신부 결혼식",
  start: "2026-12-25T11:00:00+09:00", // 시간대 오프셋이 있는 ISO 문자열이나 Date
  end: "2026-12-25T13:00:00+09:00",
  location: "더채플앳청담 3층, 서울 강남구 선릉로 757"
};
```

### 2. 브라우저: 버튼과 이어서 열기

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  addToAppleCalendar,
  addToGoogleCalendar,
  resumeAppleCalendar
} from "inapp-add-to-calendar";

const apple = { icsUrl: "/calendar.ics" };

export function CalendarButtons({ event }) {
  const [hint, setHint] = useState("");
  // 인앱 브라우저에서 넘어와 Safari로 열린 경우 이어서 Apple 캘린더 시트를 띄운다.
  // Safari가 아니면(예: 기본 브라우저 Chrome) 탭이 한 번 더 필요하다. 이 페이지에서 한 번만 호출한다
  useEffect(() => {
    if (resumeAppleCalendar(apple) === "needs-tap") setHint("Apple 캘린더를 한 번 더 눌러 주세요");
  }, []);

  const addApple = async () => {
    if ((await addToAppleCalendar(apple)) === "open-in-safari")
      setHint("Safari에서 이 페이지를 열어 주세요");
  };

  return (
    <>
      <button onClick={addApple}>Apple 캘린더</button>
      <button onClick={() => addToGoogleCalendar(event)}>Google 캘린더</button>
      {hint && <p>{hint}</p>}
    </>
  );
}
```

React가 아니어도 같습니다. 페이지가 시작될 때 `resumeAppleCalendar`를 한 번 부르고, 버튼 클릭에서 `addToAppleCalendar`나 `addToGoogleCalendar`를 부르면 됩니다.

선택 창(모달) 안에 버튼을 둔다면, 버튼을 누를 때 창을 닫으세요. 캘린더 시트를 닫았을 때 바로 원래 페이지가 보입니다.

## API

| 함수                                            | 어디서        | 하는 일                                                                                                                                                                                               |
| ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toIcs(event, now?)`                            | 서버·브라우저 | 일정 하나짜리 `.ics` 문자열을 만듭니다. 시각은 UTC로 써서 VTIMEZONE이 필요 없습니다. RFC 5545의 이스케이프(`\` `;` `,` 줄바꿈)와 75바이트 줄 접기를 처리합니다. 한글은 UTF-8 바이트 기준으로 접습니다 |
| `googleCalendarUrl(event)`                      | 서버·브라우저 | Google 캘린더 "일정 만들기" 링크                                                                                                                                                                      |
| `isKakaoTalk(userAgent)`                        | 서버·브라우저 | 카카오톡 인앱 브라우저인지 확인                                                                                                                                                                       |
| `isIOSSafari(userAgent)`                        | 서버·브라우저 | iOS Safari 자체인지 확인. 다른 브라우저와 인앱 브라우저(카카오톡, 네이버, 인스타그램 등)는 `false`                                                                                                     |
| `kakaoExternalBrowserUrl(url)`                  | 서버·브라우저 | `kakaotalk://web/openExternal?url=…`                                                                                                                                                                  |
| `addToAppleCalendar({ icsUrl, resumeParam?, leaveTimeoutMs? })` | 브라우저 | iOS Safari·데스크톱은 숨은 iframe으로 `.ics`를 엽니다(`"opened"`). iOS의 다른 브라우저·인앱은 현재 페이지에 `?calendar=apple`을 붙여 Safari로 엽니다(`"left"`). Safari가 안 열리면 카카오톡은 기본 브라우저로 열고(`"left"`), 그 밖은 `"open-in-safari"`를 돌려줍니다. 안내 문구는 앱이 띄웁니다 |
| `resumeAppleCalendar({ icsUrl, resumeParam? })` | 브라우저 | 주소에 `?calendar=apple`이 있으면 주소에서 지웁니다. Safari면 `.ics`를 열고 `"opened"`, 그 밖은 탭 없이 열 수 없으므로 `"needs-tap"`, 이어서 열 것이 없으면 `false`를 돌려줍니다 |
| `addToGoogleCalendar(event)`                    | 브라우저      | 새 탭으로 엽니다. 카카오톡에서는 기본 브라우저로 엽니다                                                                                                                                               |
| `isAndroid(userAgent)`                          | 서버·브라우저 | Android인지 확인 |
| `mayBeSamsung(userAgent)`                       | 서버·브라우저 | 갤럭시일 수 있는지 확인. 삼성 인터넷·인앱 브라우저는 모델명(`SM-…`)으로 알 수 있지만, Chrome은 모델명을 숨겨서(`Android 10; K`) 이 경우도 `true`입니다. 다른 회사 모델(Pixel 등)이 보이면 `false` |
| `samsungCalendarIntentUrl(event, fallbackUrl)`  | 서버·브라우저 | 삼성 캘린더 "새 일정" 화면을 채워서 여는 `intent:` 링크(Android 표준 `ACTION_INSERT`). 삼성 캘린더가 없으면 브라우저가 `fallbackUrl`로 갑니다 |
| `addToSamsungCalendar(event, { resumeParam?, leaveTimeoutMs? })` | 브라우저 | 삼성 캘린더를 엽니다(`"opened"`). 없으면 현재 페이지에 `?calendar=samsung-missing`을 붙여 다시 엽니다. 카카오톡에서는 `intent:`를 열 수 있는지 확인하지 못해 기본 브라우저로 넘깁니다(`"left"`, `?calendar=samsung`) |
| `resumeSamsungCalendar({ resumeParam? })`       | 브라우저 | 주소의 `?calendar=samsung`·`samsung-missing`을 지우고 `"needs-tap"`(브라우저는 탭이 있어야 `intent:`를 엽니다)·`"missing"`을 돌려줍니다. 없으면 `false` |

`event`: `{ title, start, end, location?, description?, uid? }`. 하루 종일 일정은 `{ title, allDay: true, start: "2026-11-14", end?: "2026-11-15" }`처럼 날짜만 씁니다. `end`는 마지막 날(포함)이고, 없으면 하루짜리입니다. 시간대와 관계없이 모든 캘린더에서 같은 날짜에 보입니다. `uid`를 주지 않으면 시작 시각과 제목으로 만듭니다. 같은 `uid`를 다시 추가하면 iOS는 새로 만들지 않고 기존 일정을 보여줍니다.

## 확인한 범위

- **iOS 26.5 시뮬레이터 Safari**:
  - 버튼 → "캘린더에 추가" 시트 → 추가 → 닫으면 원래 페이지
  - `?calendar=apple`로 열기 → "캘린더에 추가" 시트 (허용 확인 없음)
  - iframe으로 여는 동안 받고 있던 스크립트가 끊기지 않고 끝까지 실행됨
- **비교용으로 재현한 것**:
  - 카카오톡처럼 `.ics` 주소를 OS에 바로 넘기면 "구독 캘린더 추가" 화면이 열림
  - 페이지 자체를 `.ics`로 이동하면 받던 요청이 끊김. 지도 스크립트가 끊기면 페이지 전체가 오류 화면이 됨
- **인앱 → Safari 넘기기는 이 라이브러리 단독으로 실기기 확인하지 않았습니다**: `x-safari-https://`와 카카오톡 `openExternal` 흐름은 이 코드를 처음 쓴 청첩장 서비스에서 옮겨 왔습니다. 다른 인앱 브라우저가 `x-safari-https://`를 막으면 `"open-in-safari"`가 돌아옵니다.
- **삼성 캘린더는 실기기에서 확인하지 않았습니다**: 단위 테스트로 링크 모양과 흐름만 확인했습니다. 삼성 캘린더가 `ACTION_INSERT`의 제목·시간·장소를 받는지, 카카오톡·삼성 인터넷·Chrome에서 각각 열리는지는 갤럭시에서 확인이 필요합니다.
- **Android는 확인하지 않았습니다**: Apple 버튼은 iframe으로 `.ics`를 받습니다. Chrome이 이를 내려받기로 처리하고, 기기 캘린더 앱이 그 파일을 여는지는 실기기에서 확인이 필요합니다. Android에서는 Google 버튼을 쓰는 것이 확실합니다.

## 개발

`github:` 주소로 설치할 때 빌드 스크립트를 돌리지 않도록 빌드 결과(`dist`)를 함께 커밋합니다. `src`를 고치면 `pnpm typecheck && pnpm test && pnpm build` 뒤에 `dist`도 같이 커밋하세요.

## License

MIT
