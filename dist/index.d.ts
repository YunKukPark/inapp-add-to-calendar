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
/**
 * A one-event .ics file. Times are written in UTC, so no VTIMEZONE block is needed.
 * Serve it with `Content-Type: text/calendar; charset=utf-8`.
 */
export declare function toIcs(event: CalendarEvent, now?: Date): string;
/** Google Calendar "create event" link (not a subscription). */
export declare function googleCalendarUrl(event: CalendarEvent): string;
export declare const isKakaoTalk: (userAgent: string) => boolean;
export declare const isIOS: (userAgent: string) => boolean;
/**
 * iOS Safari itself. Only Safari can show the "Add to Calendar" sheet for an .ics on iOS;
 * other browsers and in-app browsers (KakaoTalk, Naver, Instagram, …) add their own token
 * to the user agent and show a blank page instead.
 */
export declare const isIOSSafari: (userAgent: string) => boolean;
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
