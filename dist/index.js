// ---------- pure: works on the server and in the browser ----------
const toDate = (d) => (d instanceof Date ? d : new Date(d));
/** 20261225T020000Z */
const utcStamp = (d) => d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
/** "2026-12-25" -> "20261225" */
const dayStamp = (day) => day.replaceAll("-", "");
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Start and end (exclusive) stamps: dates for all-day events, UTC times otherwise. */
const stamps = (event) => event.allDay
    ? { start: dayStamp(event.start), end: dayStamp(nextDay(event.end ?? event.start)) }
    : { start: utcStamp(toDate(event.start)), end: utcStamp(toDate(event.end)) };
const escapeText = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
// RFC 5545 §3.1: lines are at most 75 octets, so fold by UTF-8 bytes (Hangul is 3 bytes), not characters
function fold(line) {
    const encoder = new TextEncoder();
    const out = [];
    let current = "";
    for (const ch of line) {
        const limit = out.length ? 74 : 75; // continuation lines start with one space
        if (encoder.encode(current + ch).length > limit) {
            out.push(current);
            current = ch;
        }
        else
            current += ch;
    }
    return [...out, current].map((l, i) => (i ? ` ${l}` : l)).join("\r\n");
}
/**
 * A one-event .ics file. Times are written in UTC and all-day events as dates,
 * so no VTIMEZONE block is needed.
 * Serve it with `Content-Type: text/calendar; charset=utf-8`.
 */
export function toIcs(event, now = new Date()) {
    const { start, end } = stamps(event);
    const date = event.allDay ? ";VALUE=DATE" : "";
    const uid = event.uid ?? `${start}-${encodeURIComponent(event.title).slice(0, 40)}`;
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//inapp-add-to-calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART${date}:${start}`,
        `DTEND${date}:${end}`,
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
export function googleCalendarUrl(event) {
    const { start, end } = stamps(event);
    const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${start}/${end}` });
    if (event.location)
        params.set("location", event.location);
    if (event.description)
        params.set("details", event.description);
    return `https://calendar.google.com/calendar/render?${params}`;
}
export const isKakaoTalk = (userAgent) => /KAKAOTALK/i.test(userAgent);
export const isIOS = (userAgent) => /iPhone|iPad|iPod/.test(userAgent);
export const isAndroid = (userAgent) => /Android/.test(userAgent);
/**
 * An Android phone that may be a Galaxy (Samsung Calendar preinstalled). Samsung Internet and
 * in-app WebViews show the model ("SM-S918N"), but Chrome hides it ("Android 10; K"), so an
 * unknown model counts as maybe; only a known non-Samsung model (Pixel, …) returns false.
 */
export const mayBeSamsung = (userAgent) => {
    if (!isAndroid(userAgent))
        return false;
    if (/SamsungBrowser|SAMSUNG/i.test(userAgent))
        return true;
    const model = /Android [\d.]+; ([^;)]+)/.exec(userAgent)?.[1].trim();
    return !model || model === "K" || /^(SM-|SHV-|SCH-|SGH-)/.test(model);
};
/**
 * iOS Safari itself. Only Safari can show the "Add to Calendar" sheet for an .ics on iOS;
 * other browsers and in-app browsers (KakaoTalk, Naver, Instagram, …) add their own token
 * to the user agent and show a blank page instead.
 */
export const isIOSSafari = (userAgent) => isIOS(userAgent) &&
    /Version\/[\d.]+.*Safari\//.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|KAKAOTALK|NAVER|Line\/|Instagram|FBAN|FBAV|DaumApps|BAND\//.test(userAgent);
const SAMSUNG_CALENDAR = "com.samsung.android.calendar";
/** Milliseconds for Android's calendar intent: UTC midnight for all-day events, end exclusive. */
const millis = (event) => event.allDay
    ? { begin: Date.parse(`${event.start}T00:00:00Z`), end: Date.parse(`${nextDay(event.end ?? event.start)}T00:00:00Z`) }
    : { begin: toDate(event.start).getTime(), end: toDate(event.end).getTime() };
/**
 * Android `intent:` link that opens Samsung Calendar's "new event" screen, filled in
 * (the standard `ACTION_INSERT` calendar intent). When Samsung Calendar is not installed,
 * the browser goes to `fallbackUrl` (must be http(s)).
 */
export function samsungCalendarIntentUrl(event, fallbackUrl) {
    const { begin, end } = millis(event);
    const extras = [
        ["S.title", event.title],
        ["S.eventLocation", event.location],
        ["S.description", event.description],
        ["l.beginTime", String(begin)],
        ["l.endTime", String(end)],
        ["B.allDay", String(!!event.allDay)],
        ["S.browser_fallback_url", fallbackUrl]
    ].flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`]));
    return [
        "intent:#Intent",
        "action=android.intent.action.INSERT",
        "type=vnd.android.cursor.item/event",
        `package=${SAMSUNG_CALENDAR}`,
        ...extras,
        "end"
    ].join(";");
}
/** KakaoTalk scheme that opens `url` in the phone's default browser. */
export const kakaoExternalBrowserUrl = (url) => `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
const FRAME_ID = "inapp-add-to-calendar-ics";
/**
 * Open the .ics in a hidden iframe. iOS shows the "Add to Calendar" sheet over the page.
 * Navigating the page itself to the .ics would make Safari cancel requests still in flight
 * (scripts, images, fonts — the page can break) and, without a tap, ask to allow the invite.
 */
function openIcs(icsUrl) {
    document.getElementById(FRAME_ID)?.remove();
    const frame = document.createElement("iframe");
    frame.id = FRAME_ID;
    frame.hidden = true;
    frame.src = new URL(icsUrl, location.href).href;
    document.body.append(frame);
}
/** The current page with `?<resumeParam>=<value>`, so the next page load continues the add. */
function resumeUrl(resumeParam, value) {
    const page = new URL(location.href);
    page.searchParams.set(resumeParam, value);
    return page.href;
}
/** Reads and removes `?<resumeParam>=…` from the address bar. */
function takeResume(resumeParam) {
    const page = new URL(location.href);
    const value = page.searchParams.get(resumeParam);
    if (value === null)
        return null;
    page.searchParams.delete(resumeParam);
    history.replaceState(history.state, "", page.href);
    return value;
}
/** Navigate to an app URL; resolves true if the page got hidden (the app opened) within `timeoutMs`. */
const leaveTo = (url, timeoutMs) => new Promise((resolve) => {
    const finish = (left) => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onHide);
        resolve(left);
    };
    const onHide = () => document.visibilityState === "hidden" && finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    document.addEventListener("visibilitychange", onHide);
    location.href = url;
});
/**
 * Add to Apple Calendar (iPhone/iPad/Mac).
 *
 * - iOS Safari and non-iOS browsers: opens the .ics in a hidden iframe. iOS shows the
 *   "Add to Calendar" sheet over the page; closing it returns to the page.
 * - Other iOS browsers and in-app browsers: only Safari shows the sheet, and handing the .ics
 *   URL to the OS opens Calendar's "Add Subscription Calendar" screen instead. So this reopens
 *   the current page in Safari (`x-safari-https://`, iOS 17+) with `?calendar=apple`; call
 *   `resumeAppleCalendar` when the page starts to continue there. If Safari does not open,
 *   KakaoTalk falls back to its default browser, and anything else returns `open-in-safari`.
 * - KakaoTalk on Android: reopens the page in the default browser.
 */
export async function addToAppleCalendar({ icsUrl, resumeParam = "calendar", leaveTimeoutMs = 2000 }) {
    const ua = navigator.userAgent;
    if (isIOSSafari(ua) || (!isIOS(ua) && !isKakaoTalk(ua))) {
        openIcs(icsUrl);
        return "opened";
    }
    const next = resumeUrl(resumeParam, "apple");
    if (isIOS(ua) && (await leaveTo(`x-safari-${next}`, leaveTimeoutMs)))
        return "left";
    if (isKakaoTalk(ua)) {
        location.href = kakaoExternalBrowserUrl(next);
        return "left";
    }
    return "open-in-safari";
}
/**
 * Call once when the page starts. If the page was opened by `addToAppleCalendar` from another
 * browser, removes the parameter from the address bar and, in Safari, opens the Apple Calendar
 * sheet (`opened`). Elsewhere (e.g. KakaoTalk opened Chrome as the default browser, or Android)
 * the file cannot open without a tap, so it returns `needs-tap`: show the Apple button again.
 * Returns false when there was nothing to resume.
 */
export function resumeAppleCalendar({ icsUrl, resumeParam = "calendar" }) {
    if (new URL(location.href).searchParams.get(resumeParam) !== "apple")
        return false;
    takeResume(resumeParam);
    if (!isIOSSafari(navigator.userAgent))
        return "needs-tap";
    openIcs(icsUrl);
    return "opened";
}
/** Add to Google Calendar: a new tab, or the default browser when inside KakaoTalk. */
export function addToGoogleCalendar(event) {
    const url = googleCalendarUrl(event);
    if (isKakaoTalk(navigator.userAgent)) {
        location.href = kakaoExternalBrowserUrl(url);
        return;
    }
    window.open(url, "_blank", "noopener");
}
/**
 * Add to Samsung Calendar (Galaxy). Opens the calendar's "new event" screen with an `intent:` link.
 * KakaoTalk's in-app browser is not known to open `intent:` links, so from KakaoTalk this reopens
 * the page in the default browser with `?calendar=samsung`; call `resumeSamsungCalendar` there.
 */
export async function addToSamsungCalendar(event, { resumeParam = "calendar", leaveTimeoutMs = 2000 } = {}) {
    if (isKakaoTalk(navigator.userAgent)) {
        location.href = kakaoExternalBrowserUrl(resumeUrl(resumeParam, "samsung"));
        return "left";
    }
    const url = samsungCalendarIntentUrl(event, resumeUrl(resumeParam, "samsung-missing"));
    return (await leaveTo(url, leaveTimeoutMs)) ? "opened" : "not-opened";
}
/**
 * Call once when the page starts, next to `resumeAppleCalendar`. Removes the parameter and returns
 * `needs-tap` (came from KakaoTalk; the browser opens `intent:` links only on a tap, so show the
 * Samsung button again) or `missing` (Samsung Calendar is not installed). Otherwise `false`.
 */
export function resumeSamsungCalendar({ resumeParam = "calendar" } = {}) {
    const value = new URL(location.href).searchParams.get(resumeParam);
    if (value !== "samsung" && value !== "samsung-missing")
        return false;
    takeResume(resumeParam);
    return value === "samsung" ? "needs-tap" : "missing";
}
