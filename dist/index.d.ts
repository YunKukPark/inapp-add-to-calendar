type EventDetails = {
    title: string;
    location?: string;
    description?: string;
    /** Stable id so adding twice updates the same event. Defaults to one derived from start + title. */
    uid?: string;
};
export type TimedEvent = EventDetails & {
    allDay?: false;
    /** Date or ISO 8601 string with an offset, e.g. "2026-12-25T11:00:00+09:00" */
    start: Date | string;
    end: Date | string;
};
/** Whole days, shown on the same dates in every time zone. */
export type AllDayEvent = EventDetails & {
    allDay: true;
    /** "YYYY-MM-DD" */
    start: string;
    /** Last day, inclusive ("YYYY-MM-DD"). Defaults to `start` (a one-day event). */
    end?: string;
};
export type CalendarEvent = TimedEvent | AllDayEvent;
/**
 * A one-event .ics file. Times are written in UTC and all-day events as dates,
 * so no VTIMEZONE block is needed.
 * Serve it with `Content-Type: text/calendar; charset=utf-8`.
 */
export declare function toIcs(event: CalendarEvent, now?: Date): string;
/** Google Calendar "create event" link (not a subscription). */
export declare function googleCalendarUrl(event: CalendarEvent): string;
export declare const isKakaoTalk: (userAgent: string) => boolean;
export declare const isIOS: (userAgent: string) => boolean;
export declare const isAndroid: (userAgent: string) => boolean;
/**
 * An Android phone that may be a Galaxy (Samsung Calendar preinstalled). Samsung Internet and
 * in-app WebViews show the model ("SM-S918N"), but Chrome hides it ("Android 10; K"), so an
 * unknown model counts as maybe; only a known non-Samsung model (Pixel, …) returns false.
 */
export declare const mayBeSamsung: (userAgent: string) => boolean;
/**
 * iOS Safari itself. Only Safari can show the "Add to Calendar" sheet for an .ics on iOS;
 * other browsers and in-app browsers (KakaoTalk, Naver, Instagram, …) add their own token
 * to the user agent and show a blank page instead.
 */
export declare const isIOSSafari: (userAgent: string) => boolean;
/**
 * Android `intent:` link that opens Samsung Calendar's "new event" screen, filled in
 * (the standard `ACTION_INSERT` calendar intent). When Samsung Calendar is not installed,
 * the browser goes to `fallbackUrl` (must be http(s)).
 */
export declare function samsungCalendarIntentUrl(event: CalendarEvent, fallbackUrl: string): string;
/** KakaoTalk scheme that opens `url` in the phone's default browser. */
export declare const kakaoExternalBrowserUrl: (url: string) => string;
export type AppleOptions = {
    /** Where your server serves `toIcs(...)`, e.g. "/calendar.ics". Must be same-site and https in production. */
    icsUrl: string;
    /** Query parameter used to resume after leaving the in-app browser. Default "calendar". */
    resumeParam?: string;
    /** How long to wait for the page to be hidden after handing it to Safari. Default 2000. */
    leaveTimeoutMs?: number;
};
/**
 * - `opened`: the "Add to Calendar" sheet was opened here.
 * - `left`: the page was handed to Safari (or the default browser), which continues via `resumeAppleCalendar`.
 * - `open-in-safari`: nothing could open it here; ask the user to open the page in Safari.
 */
export type AppleResult = "opened" | "left" | "open-in-safari";
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
export declare function addToAppleCalendar({ icsUrl, resumeParam, leaveTimeoutMs }: AppleOptions): Promise<AppleResult>;
/**
 * Call once when the page starts. If the page was opened by `addToAppleCalendar` from another
 * browser, removes the parameter from the address bar and, in Safari, opens the Apple Calendar
 * sheet (`opened`). Elsewhere (e.g. KakaoTalk opened Chrome as the default browser, or Android)
 * the file cannot open without a tap, so it returns `needs-tap`: show the Apple button again.
 * Returns false when there was nothing to resume.
 */
export declare function resumeAppleCalendar({ icsUrl, resumeParam }: AppleOptions): "opened" | "needs-tap" | false;
/** Add to Google Calendar: a new tab, or the default browser when inside KakaoTalk. */
export declare function addToGoogleCalendar(event: CalendarEvent): void;
export type SamsungOptions = {
    /** Query parameter used to resume after leaving the in-app browser. Default "calendar". */
    resumeParam?: string;
    /** How long to wait for Samsung Calendar to take over the screen. Default 2000. */
    leaveTimeoutMs?: number;
};
/**
 * - `opened`: Samsung Calendar's "new event" screen opened.
 * - `left`: KakaoTalk handed the page to the default browser, which continues via `resumeSamsungCalendar`.
 * - `not-opened`: nothing opened in time; if Samsung Calendar is missing, the browser is already
 *   going to the page with `?calendar=samsung-missing`.
 */
export type SamsungResult = "opened" | "left" | "not-opened";
/**
 * Add to Samsung Calendar (Galaxy). Opens the calendar's "new event" screen with an `intent:` link.
 * KakaoTalk's in-app browser is not known to open `intent:` links, so from KakaoTalk this reopens
 * the page in the default browser with `?calendar=samsung`; call `resumeSamsungCalendar` there.
 */
export declare function addToSamsungCalendar(event: CalendarEvent, { resumeParam, leaveTimeoutMs }?: SamsungOptions): Promise<SamsungResult>;
/**
 * Call once when the page starts, next to `resumeAppleCalendar`. Removes the parameter and returns
 * `needs-tap` (came from KakaoTalk; the browser opens `intent:` links only on a tap, so show the
 * Samsung button again) or `missing` (Samsung Calendar is not installed). Otherwise `false`.
 */
export declare function resumeSamsungCalendar({ resumeParam }?: SamsungOptions): "needs-tap" | "missing" | false;
export {};
