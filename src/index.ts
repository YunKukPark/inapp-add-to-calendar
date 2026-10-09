export type CalendarEvent = {
  title: string;
  /** Date or ISO 8601 string with an offset, e.g. "2026-12-25T11:00:00+09:00" */
  start: Date | string;
  end: Date | string;
  location?: string;
  description?: string;
  /** Stable id so adding twice updates the same event. Defaults to one derived from start + title. */
  uid?: string;
};

// ---------- pure: works on the server and in the browser ----------

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

/** 20261225T020000Z */
const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const escapeText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

// RFC 5545 §3.1: lines are at most 75 octets, so fold by UTF-8 bytes (Hangul is 3 bytes), not characters
function fold(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with one space
    if (encoder.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  return [...out, current].map((l, i) => (i ? ` ${l}` : l)).join("\r\n");
}

/**
 * A one-event .ics file. Times are written in UTC, so no VTIMEZONE block is needed.
 * Serve it with `Content-Type: text/calendar; charset=utf-8`.
 */
export function toIcs(event: CalendarEvent, now = new Date()) {
  const start = toDate(event.start);
  const end = toDate(event.end);
  const uid = event.uid ?? `${utcStamp(start)}-${encodeURIComponent(event.title).slice(0, 40)}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kakao-add-to-calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ]
    .map(fold)
    .join("\r\n");
}

/** Google Calendar "create event" link (not a subscription). */
export function googleCalendarUrl(event: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(toDate(event.start))}/${utcStamp(toDate(event.end))}`
  });
  if (event.location) params.set("location", event.location);
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const isKakaoTalk = (userAgent: string) => /KAKAOTALK/i.test(userAgent);

/** KakaoTalk scheme that opens `url` in the phone's default browser. */
export const kakaoExternalBrowserUrl = (url: string) =>
  `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;

// ---------- browser ----------

export type AppleOptions = {
  /** Where your server serves `toIcs(...)`, e.g. "/calendar.ics". Must be same-site and https in production. */
  icsUrl: string;
  /** Query parameter used to resume after leaving KakaoTalk. Default "calendar". */
  resumeParam?: string;
};

const FRAME_ID = "kakao-add-to-calendar-ics";

/**
 * Open the .ics in a hidden iframe. iOS shows the "Add to Calendar" sheet over the page.
 * Navigating the page itself to the .ics would make Safari cancel requests still in flight
 * (scripts, images, fonts — the page can break) and, without a tap, ask to allow the invite.
 */
function openIcs(icsUrl: string) {
  document.getElementById(FRAME_ID)?.remove();
  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.hidden = true;
  frame.src = new URL(icsUrl, location.href).href;
  document.body.append(frame);
}

/**
 * Add to Apple Calendar (iPhone/iPad/Mac).
 *
 * - Normal browsers: opens the .ics in a hidden iframe. iOS shows the "Add to Calendar"
 *   sheet over the page; closing it returns to the page.
 * - KakaoTalk: its in-app browser cannot open calendar files, and handing the .ics URL
 *   to the OS opens Calendar's "Add Subscription Calendar" screen instead. So this reopens
 *   the current page in the default browser with `?calendar=apple`; call
 *   `resumeAppleCalendar` when the page starts to continue there.
 */
export function addToAppleCalendar({ icsUrl, resumeParam = "calendar" }: AppleOptions) {
  if (isKakaoTalk(navigator.userAgent)) {
    const page = new URL(location.href);
    page.searchParams.set(resumeParam, "apple");
    location.href = kakaoExternalBrowserUrl(page.href);
    return;
  }
  openIcs(icsUrl);
}

/**
 * Call once when the page starts. If the page was opened by `addToAppleCalendar` from
 * KakaoTalk, removes the parameter from the address bar and opens the Apple Calendar
 * sheet. Returns whether it did.
 */
export function resumeAppleCalendar({ icsUrl, resumeParam = "calendar" }: AppleOptions) {
  const page = new URL(location.href);
  if (page.searchParams.get(resumeParam) !== "apple") return false;
  page.searchParams.delete(resumeParam);
  history.replaceState(history.state, "", page.href);
  openIcs(icsUrl);
  return true;
}

/** Add to Google Calendar: a new tab, or the default browser when inside KakaoTalk. */
export function addToGoogleCalendar(event: CalendarEvent) {
  const url = googleCalendarUrl(event);
  if (isKakaoTalk(navigator.userAgent)) {
    location.href = kakaoExternalBrowserUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
