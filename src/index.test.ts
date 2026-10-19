import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addToAppleCalendar,
  addToGoogleCalendar,
  type CalendarEvent,
  googleCalendarUrl,
  addToSamsungCalendar,
  isIOSSafari,
  isKakaoTalk,
  mayBeSamsung,
  resumeAppleCalendar,
  resumeSamsungCalendar,
  samsungCalendarIntentUrl,
  toIcs
} from "./index.ts";

const event: CalendarEvent = {
  title: "김신랑 ♥ 박신부 결혼식",
  start: "2026-12-25T11:00:00+09:00",
  end: "2026-12-25T13:00:00+09:00",
  location: "더채플앳청담 3층 커티지홀, 서울 강남구 선릉로 757"
};

const KAKAO_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const NAVER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 NAVER(inapp; search; 2000; 12.10.0)";
const ANDROID_KAKAO_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.8.0";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("ics: UTC times, escaped comma, every line ≤ 75 bytes, CRLF", () => {
  const ics = toIcs(event, new Date("2026-10-09T00:00:00Z"));
  assert.match(ics, /DTSTART:20261225T020000Z\r\n/);
  assert.match(ics, /DTEND:20261225T040000Z\r\n/);
  assert.match(ics, /DTSTAMP:20261009T000000Z\r\n/);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(
    unfolded.includes(String.raw`LOCATION:더채플앳청담 3층 커티지홀\, 서울 강남구 선릉로 757`)
  );
  for (const line of ics.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(!/[^\r]\n/.test(ics), "bare LF");
});

test("ics: backslash, semicolon and newline are escaped; optional fields omitted", () => {
  const ics = toIcs({ ...event, title: "A\\B;C", location: undefined, description: "1\n2" });
  assert.ok(ics.includes(String.raw`SUMMARY:A\\B\;C`));
  assert.ok(ics.includes(String.raw`DESCRIPTION:1\n2`));
  assert.ok(!ics.includes("LOCATION:"));
});

test("google: create-event link with UTC dates", () => {
  const url = new URL(googleCalendarUrl(event));
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261225T020000Z/20261225T040000Z");
  assert.equal(url.searchParams.get("text"), event.title);
});

test("all-day: dates without time zone, end is the day after the last day", () => {
  const ics = toIcs({ title: "워크숍", allDay: true, start: "2026-12-31", end: "2027-01-01" });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20270102\r\n/);
  assert.match(ics, /UID:20261231-/);
  const oneDay = new URL(googleCalendarUrl({ title: "a", allDay: true, start: "2026-11-14" }));
  assert.equal(oneDay.searchParams.get("dates"), "20261114/20261115");
});

test("isKakaoTalk", () => {
  assert.equal(isKakaoTalk(KAKAO_UA), true);
  assert.equal(isKakaoTalk(SAFARI_UA), false);
});

test("isIOSSafari: only Safari itself, not other browsers or in-app browsers", () => {
  assert.equal(isIOSSafari(SAFARI_UA), true);
  for (const ua of [KAKAO_UA, IOS_CHROME_UA, NAVER_UA, ANDROID_KAKAO_UA, DESKTOP_UA])
    assert.equal(isIOSSafari(ua), false, ua);
});

// minimal browser globals
function browser(href: string, userAgent: string) {
  const g = globalThis as Record<string, unknown>;
  const location = { href };
  const opened: string[] = [];
  g.location = location;
  Object.defineProperty(g, "navigator", { value: { userAgent }, configurable: true });
  g.history = {
    state: null,
    replaceState: (_: unknown, __: string, url: string) => (location.href = url)
  };
  g.window = { open: (url: string) => opened.push(url) };
  const frames: { id: string; hidden: boolean; src: string; removed?: boolean }[] = [];
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    getElementById: (id: string) => {
      const f = frames.find((f) => f.id === id && !f.removed);
      return f && { remove: () => (f.removed = true) };
    },
    createElement: () => ({ id: "", hidden: false, src: "" }),
    body: { append: (f: (typeof frames)[number]) => frames.push(f) }
  };
  g.document = doc;
  // Simulate another app taking over: the page gets hidden
  const hide = () => {
    doc.visibilityState = "hidden";
    listeners.forEach((f) => f());
  };
  return { location, opened, frames, hide };
}

const apple = { icsUrl: "/calendar.ics", leaveTimeoutMs: 10 };

test("apple: iOS Safari and desktop open the .ics in one hidden iframe, page stays", async () => {
  for (const ua of [SAFARI_UA, DESKTOP_UA]) {
    const { location, frames } = browser("https://example.com/invite", ua);
    assert.equal(await addToAppleCalendar(apple), "opened");
    assert.equal(await addToAppleCalendar(apple), "opened");
    assert.equal(location.href, "https://example.com/invite");
    const live = frames.filter((f) => !f.removed);
    assert.equal(live.length, 1);
    assert.equal(live[0].hidden, true);
    assert.equal(live[0].src, "https://example.com/calendar.ics");
  }
});

test("apple: iOS in-app browser hands the page (not the .ics) to Safari", async () => {
  const { location, hide } = browser("https://example.com/invite?ref=a", NAVER_UA);
  const result = addToAppleCalendar(apple);
  assert.equal(location.href, "x-safari-https://example.com/invite?ref=a&calendar=apple");
  hide();
  assert.equal(await result, "left");
});

test("apple: KakaoTalk on iOS falls back to the default browser when Safari does not open", async () => {
  const { location } = browser("https://example.com/invite?ref=a", KAKAO_UA);
  assert.equal(await addToAppleCalendar(apple), "left");
  assert.equal(
    location.href,
    `kakaotalk://web/openExternal?url=${encodeURIComponent("https://example.com/invite?ref=a&calendar=apple")}`
  );
});

test("apple: other iOS browsers ask to open in Safari when Safari does not open", async () => {
  const { frames } = browser("https://example.com/invite", IOS_CHROME_UA);
  assert.equal(await addToAppleCalendar(apple), "open-in-safari");
  assert.equal(frames.length, 0);
});

test("apple: KakaoTalk on Android reopens the page in the default browser", async () => {
  const { location } = browser("https://example.com/invite", ANDROID_KAKAO_UA);
  assert.equal(await addToAppleCalendar(apple), "left");
  assert.ok(location.href.startsWith("kakaotalk://web/openExternal?url="));
});

test("resume: Safari opens the .ics and cleans the address bar", () => {
  const visited: string[] = [];
  const { frames } = browser("https://example.com/invite?ref=a&calendar=apple", SAFARI_UA);
  const g = globalThis as Record<string, unknown>;
  g.history = {
    state: null,
    replaceState: (_: unknown, __: string, url: string) => visited.push(url)
  };
  assert.equal(resumeAppleCalendar(apple), "opened");
  assert.deepEqual(visited, ["https://example.com/invite?ref=a"]);
  assert.equal(frames[0].src, "https://example.com/calendar.ics");

  browser("https://example.com/invite", SAFARI_UA);
  assert.equal(resumeAppleCalendar(apple), false);
});

test("resume: other browsers need a tap and open nothing", () => {
  for (const ua of [IOS_CHROME_UA, ANDROID_KAKAO_UA.replace(" KAKAOTALK 10.8.0", "")]) {
    const { frames, location } = browser("https://example.com/invite?calendar=apple", ua);
    assert.equal(resumeAppleCalendar(apple), "needs-tap");
    assert.equal(frames.length, 0);
    assert.equal(location.href, "https://example.com/invite");
  }
});

test("google: new tab normally, default browser from KakaoTalk", () => {
  const normal = browser("https://example.com/", SAFARI_UA);
  addToGoogleCalendar(event);
  assert.equal(normal.opened.length, 1);
  assert.ok(normal.opened[0].startsWith("https://calendar.google.com/"));

  const kakao = browser("https://example.com/", KAKAO_UA);
  addToGoogleCalendar(event);
  assert.ok(
    kakao.location.href.startsWith(
      "kakaotalk://web/openExternal?url=https%3A%2F%2Fcalendar.google.com"
    )
  );
});

const GALAXY_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const PIXEL_WEBVIEW_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const SAMSUNG_INTERNET_UA =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";

test("mayBeSamsung: Galaxy models and hidden models yes, other models and non-Android no", () => {
  for (const ua of [ANDROID_KAKAO_UA, GALAXY_CHROME_UA, SAMSUNG_INTERNET_UA]) assert.equal(mayBeSamsung(ua), true, ua);
  for (const ua of [PIXEL_WEBVIEW_UA, SAFARI_UA, DESKTOP_UA]) assert.equal(mayBeSamsung(ua), false, ua);
});

test("samsung: intent link with encoded extras, UTC midnight for all-day", () => {
  const url = samsungCalendarIntentUrl(event, "https://example.com/e?calendar=samsung-missing");
  assert.ok(url.startsWith("intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.item/event;package=com.samsung.android.calendar;"));
  assert.ok(url.endsWith(";end"));
  assert.ok(url.includes(`S.title=${encodeURIComponent(event.title)};`));
  assert.ok(url.includes(`l.beginTime=${Date.parse("2026-12-25T02:00:00Z")};`));
  assert.ok(url.includes(`l.endTime=${Date.parse("2026-12-25T04:00:00Z")};`));
  assert.ok(url.includes("B.allDay=false;"));
  assert.ok(url.includes(`S.browser_fallback_url=${encodeURIComponent("https://example.com/e?calendar=samsung-missing")};`));
  assert.ok(!url.includes("S.description"));

  const allDay = samsungCalendarIntentUrl({ title: "a", allDay: true, start: "2026-11-14" }, "https://x.test/");
  assert.ok(allDay.includes(`l.beginTime=${Date.parse("2026-11-14T00:00:00Z")};l.endTime=${Date.parse("2026-11-15T00:00:00Z")};B.allDay=true;`));
});

test("samsung: opens the intent; KakaoTalk hands the page to the default browser first", async () => {
  const chrome = browser("https://example.com/e/1", GALAXY_CHROME_UA);
  const result = addToSamsungCalendar(event, { leaveTimeoutMs: 10 });
  assert.ok(chrome.location.href.startsWith("intent:#Intent;"));
  assert.ok(chrome.location.href.includes(encodeURIComponent("https://example.com/e/1?calendar=samsung-missing")));
  chrome.hide();
  assert.equal(await result, "opened");

  browser("https://example.com/e/1", GALAXY_CHROME_UA);
  assert.equal(await addToSamsungCalendar(event, { leaveTimeoutMs: 10 }), "not-opened");

  const kakao = browser("https://example.com/e/1", ANDROID_KAKAO_UA);
  assert.equal(await addToSamsungCalendar(event), "left");
  assert.equal(
    kakao.location.href,
    `kakaotalk://web/openExternal?url=${encodeURIComponent("https://example.com/e/1?calendar=samsung")}`
  );
});

test("resume samsung: needs a tap after KakaoTalk, missing app after the fallback", () => {
  const tap = browser("https://example.com/e/1?calendar=samsung", GALAXY_CHROME_UA);
  assert.equal(resumeSamsungCalendar(), "needs-tap");
  assert.equal(tap.location.href, "https://example.com/e/1");

  browser("https://example.com/e/1?calendar=samsung-missing", GALAXY_CHROME_UA);
  assert.equal(resumeSamsungCalendar(), "missing");

  browser("https://example.com/e/1?calendar=apple", GALAXY_CHROME_UA);
  assert.equal(resumeSamsungCalendar(), false);
});
