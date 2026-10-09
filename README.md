# kakao-add-to-calendar

웹페이지에서 Apple·Google 캘린더에 **일정 하나를 추가**합니다. 카카오톡 인앱 브라우저에서도 동작합니다. 캘린더를 **구독**시키지 않습니다.

Add a single event to Apple or Google Calendar from a web page, including inside the KakaoTalk in-app browser. It adds the event; it never subscribes the user to a calendar. No dependencies. About 150 lines.

## 왜 만들었나

모바일 청첩장의 "캘린더에 등록" 버튼을 만들면서 겪은 문제들입니다.

| 상황                                        | 흔한 구현에서 생기는 일                                                                                                                                                       | 이 라이브러리                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| iPhone Safari                               | `webcal://`이나 `.ics` 주소를 OS에 넘기면 캘린더 앱의 **"구독 캘린더 추가"** 화면이 열립니다                                                                                  | 숨은 iframe으로 `.ics`를 엽니다. 페이지 위에 **"캘린더에 추가"** 시트가 뜨고, 닫으면 원래 페이지가 남습니다 |
| 카카오톡 인앱 (iPhone)                      | 캘린더 파일을 열지 못하거나 "Safari에서 열고 주소를 붙여넣으세요" 안내만 나옵니다                                                                                             | 기본 브라우저(Safari)로 **현재 페이지**를 다시 열고, 거기서 이어서 "캘린더에 추가" 시트를 띄웁니다          |
| 카카오톡 → Safari로 `.ics` 주소를 바로 넘김 | "구독" 화면이 열리고, Safari에는 빈 탭이 남습니다                                                                                                                             | 위와 같이 페이지를 넘기므로 빈 탭이 없습니다                                                                |
| 페이지 자체를 `.ics`로 이동                 | Safari가 받던 스크립트·사진·글꼴 요청을 끊습니다. 지도 스크립트가 끊겨 페이지 전체가 오류 화면이 된 적이 있습니다. 탭 없이 이동하면 "캘린더 초대 허용" 확인도 한 번 더 뜹니다 | 페이지는 그대로 두고 iframe으로만 엽니다. 받던 요청이 끊기지 않고, 확인 창도 뜨지 않습니다                  |
| Google                                      | —                                                                                                                                                                             | "일정 만들기" 링크를 엽니다(구독 아님). 카카오톡에서는 기본 브라우저로 엽니다                               |

## 설치

```sh
pnpm add github:YunKukPark/kakao-add-to-calendar
```

## 사용법

### 1. 서버: `.ics` 파일 제공

iOS는 페이지에서 이동한 `.ics` 응답을 보고 "캘린더에 추가" 시트를 띄웁니다. 그래서 같은 사이트에서 파일을 제공해야 합니다. 아래는 Next.js App Router 예시이고, 다른 서버도 같은 응답이면 됩니다.

```ts
// app/calendar.ics/route.ts
import { toIcs } from "kakao-add-to-calendar";

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
import { useEffect } from "react";
import {
  addToAppleCalendar,
  addToGoogleCalendar,
  resumeAppleCalendar
} from "kakao-add-to-calendar";

const apple = { icsUrl: "/calendar.ics" };

export function CalendarButtons({ event }) {
  // 카카오톡에서 넘어와 Safari로 열린 경우 이어서 Apple 캘린더 시트를 띄운다.
  // 이 페이지에서 한 번만 호출한다
  useEffect(() => {
    resumeAppleCalendar(apple);
  }, []);

  return (
    <>
      <button onClick={() => addToAppleCalendar(apple)}>Apple 캘린더</button>
      <button onClick={() => addToGoogleCalendar(event)}>Google 캘린더</button>
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
| `kakaoExternalBrowserUrl(url)`                  | 서버·브라우저 | `kakaotalk://web/openExternal?url=…`                                                                                                                                                                  |
| `addToAppleCalendar({ icsUrl, resumeParam? })`  | 브라우저      | 일반 브라우저에서는 숨은 iframe으로 `.ics`를 엽니다. 카카오톡에서는 현재 페이지를 `?calendar=apple`을 붙여 기본 브라우저로 엽니다                                                                     |
| `resumeAppleCalendar({ icsUrl, resumeParam? })` | 브라우저      | 주소에 `?calendar=apple`이 있으면 주소에서 지우고 `.ics`를 엽니다. 열었으면 `true`를 돌려줍니다                                                                                                       |
| `addToGoogleCalendar(event)`                    | 브라우저      | 새 탭으로 엽니다. 카카오톡에서는 기본 브라우저로 엽니다                                                                                                                                               |

`event`: `{ title, start, end, location?, description?, uid? }`. `uid`를 주지 않으면 시작 시각과 제목으로 만듭니다. 같은 `uid`를 다시 추가하면 iOS는 새로 만들지 않고 기존 일정을 보여줍니다.

## 확인한 범위

- **iOS 26.5 시뮬레이터 Safari**:
  - 버튼 → "캘린더에 추가" 시트 → 추가 → 닫으면 원래 페이지
  - `?calendar=apple`로 열기 → "캘린더에 추가" 시트 (허용 확인 없음)
  - iframe으로 여는 동안 받고 있던 스크립트가 끊기지 않고 끝까지 실행됨
- **비교용으로 재현한 것**:
  - 카카오톡처럼 `.ics` 주소를 OS에 바로 넘기면 "구독 캘린더 추가" 화면이 열림
  - 페이지 자체를 `.ics`로 이동하면 받던 요청이 끊김. 지도 스크립트가 끊기면 페이지 전체가 오류 화면이 됨
- **실제 카카오톡 앱은 확인하지 못했습니다**: 카카오톡이 `kakaotalk://web/openExternal`을 받아 Safari를 여는 단계는 실기기에서 확인이 필요합니다.
- **Android는 확인하지 않았습니다**: Apple 버튼은 iframe으로 `.ics`를 받습니다. Chrome이 이를 내려받기로 처리하고, 기기 캘린더 앱이 그 파일을 여는지는 실기기에서 확인이 필요합니다. Android에서는 Google 버튼을 쓰는 것이 확실합니다.

## License

MIT
