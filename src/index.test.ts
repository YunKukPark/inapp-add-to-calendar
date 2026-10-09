import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addToAppleCalendar,
  addToGoogleCalendar,
  type CalendarEvent,
  googleCalendarUrl,
  isKakaoTalk,
  resumeAppleCalendar,
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

test("isKakaoTalk", () => {
  assert.equal(isKakaoTalk(KAKAO_UA), true);
  assert.equal(isKakaoTalk(SAFARI_UA), false);
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
  const onLoad: (() => void)[] = [];
  g.document = { readyState: "complete" };
  g.addEventListener = (type: string, fn: () => void) => type === "load" && onLoad.push(fn);
  return { location, opened, onLoad };
}

test("apple: normal browser navigates to the .ics in-page", () => {
  const { location } = browser("https://example.com/invite", SAFARI_UA);
  addToAppleCalendar({ icsUrl: "/calendar.ics" });
  assert.equal(location.href, "https://example.com/calendar.ics");
});

test("apple: KakaoTalk reopens the page (not the .ics) in the default browser", () => {
  const { location } = browser("https://example.com/invite?ref=a", KAKAO_UA);
  addToAppleCalendar({ icsUrl: "/calendar.ics" });
  assert.equal(
    location.href,
    `kakaotalk://web/openExternal?url=${encodeURIComponent("https://example.com/invite?ref=a&calendar=apple")}`
  );
});

test("resume: opens the .ics once and cleans the address bar", () => {
  const visited: string[] = [];
  const { location } = browser("https://example.com/invite?ref=a&calendar=apple", SAFARI_UA);
  const g = globalThis as Record<string, unknown>;
  g.history = {
    state: null,
    replaceState: (_: unknown, __: string, url: string) => visited.push(url)
  };
  assert.equal(resumeAppleCalendar({ icsUrl: "/calendar.ics" }), true);
  assert.deepEqual(visited, ["https://example.com/invite?ref=a"]);
  assert.equal(location.href, "https://example.com/calendar.ics");

  browser("https://example.com/invite", SAFARI_UA);
  assert.equal(resumeAppleCalendar({ icsUrl: "/calendar.ics" }), false);
});

test("resume: waits for the page to finish loading", () => {
  const { location, onLoad } = browser("https://example.com/?calendar=apple", SAFARI_UA);
  (globalThis as Record<string, unknown>).document = { readyState: "interactive" };
  assert.equal(resumeAppleCalendar({ icsUrl: "/calendar.ics" }), true);
  assert.equal(location.href, "https://example.com/");
  onLoad.forEach((fn) => fn());
  assert.equal(location.href, "https://example.com/calendar.ics");
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
