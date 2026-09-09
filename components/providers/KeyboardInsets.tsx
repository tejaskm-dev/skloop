"use client";

import { useEffect } from "react";

/**
 * Keeps the layout honest while a phone's software keyboard is open, and
 * glides the focused field into view instead of letting the browser jump to it.
 *
 * ── The problem ──
 * A software keyboard does not resize the page the way a smaller window would.
 * On iOS the layout viewport keeps its full height and only the VISUAL viewport
 * shrinks, so `100dvh`, `position: fixed` and `bottom: 0` all still resolve to
 * the bottom of a viewport that is now half-covered. The bottom of the app —
 * which is exactly where a composer or a submit button lives — ends up behind
 * the keyboard. WebKit then tries to help by scrolling the focused element into
 * view, but on a non-scrolling `overflow: hidden` shell there is nothing to
 * scroll, so it rubber-bands and leaves the blank gap that makes the app look
 * broken.
 *
 * ── What this does ──
 * Publishes the real geometry as two custom properties on <html>, so layout can
 * be expressed in CSS instead of every screen inventing its own workaround:
 *
 *   --app-h   the usable height. Falls back to 100dvh (set in globals.css) and
 *             is pinned to the visual viewport only while a keyboard is open.
 *   --kb      how much of the LAYOUT viewport the keyboard covers, which is
 *             what a `position: fixed` element has to lift by. Naturally 0 on
 *             engines that shrink the layout viewport themselves, so consumers
 *             need no per-platform branching.
 *
 * It then reveals the focused field with an eased scroll of whichever container
 * actually scrolls. `scrollIntoView` is not enough here: it measures against
 * the layout viewport, so it considers a field "in view" while the keyboard is
 * sitting on top of it.
 *
 * Deliberately not a React re-render — this fires on every keyboard frame, so
 * it writes CSS variables and lets the compositor do the work. Nothing above it
 * re-renders.
 */

/** Input types with no text to scroll to. */
const NON_TEXT_TYPES = new Set([
    "checkbox", "radio", "range", "file", "color",
    "hidden", "submit", "button", "image", "reset",
]);

/** Coverage past which we call it a keyboard rather than a toolbar. */
const OPEN_THRESHOLD_PX = 120;
/** Breathing room between the field and the edge of the visible band. */
const PAD_PX = 14;

const MIN_DURATION_MS = 180;
const MAX_DURATION_MS = 460;

/** Optimistic pass (no keyboard, e.g. a hardware one), then post-animation. */
const EARLY_REVEAL_MS = 60;
const SETTLED_REVEAL_MS = 420;

function isTextEntry(el: Element | null | undefined): el is HTMLElement {
    if (!el) return false;
    if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    if (el.tagName === "INPUT") return !NON_TEXT_TYPES.has((el as HTMLInputElement).type);
    return (el as HTMLElement).isContentEditable === true;
}

/**
 * The element that would actually move if this field scrolled. Most of this app
 * scrolls an inner container rather than the document — AppShell is
 * `h-[100dvh] overflow-hidden` — so walking up for a real scroller matters.
 */
function findScroller(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if (
            (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
            node.scrollHeight > node.clientHeight + 1
        ) {
            return node;
        }
    }
    return null;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function KeyboardInsets() {
    useEffect(() => {
        const root = document.documentElement;
        const vv = window.visualViewport;
        const coarse = window.matchMedia("(pointer: coarse)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        let geometryFrame = 0;
        let animationFrame = 0;
        let stopWatchingGestures: (() => void) | null = null;
        let earlyTimer = 0;
        let settledTimer = 0;
        let keyboardOpen = false;
        /** Geometry moved while we were animating; re-check once we land. */
        let recheckAfterAnimation = false;

        const cancelAnimation = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = 0;
            stopWatchingGestures?.();
            stopWatchingGestures = null;
        };

        // ── Scrolling ────────────────────────────────────────────────────────

        const animateBy = (scroller: HTMLElement | null, delta: number) => {
            const read = () => (scroller ? scroller.scrollTop : window.scrollY);
            const write = (value: number) => {
                if (scroller) scroller.scrollTop = value;
                else window.scrollTo(0, value);
            };

            const from = read();
            const limit = scroller
                ? scroller.scrollHeight - scroller.clientHeight
                : document.documentElement.scrollHeight - window.innerHeight;

            const distance = Math.max(0, Math.min(limit, from + delta)) - from;
            if (Math.abs(distance) < 2) return;

            if (reducedMotion.matches) {
                write(from + distance);
                return;
            }

            // Short trips stay snappy, long ones don't feel abrupt.
            const duration = Math.min(
                MAX_DURATION_MS,
                Math.max(MIN_DURATION_MS, Math.abs(distance) * 0.9)
            );
            const start = performance.now();

            // Never fight a finger. A tap is what got us here, so only an
            // actual drag or wheel abandons the animation — not touchstart.
            const abort = () => cancelAnimation();
            window.addEventListener("touchmove", abort, { passive: true });
            window.addEventListener("wheel", abort, { passive: true });
            stopWatchingGestures = () => {
                window.removeEventListener("touchmove", abort);
                window.removeEventListener("wheel", abort);
            };

            const step = (now: number) => {
                const t = Math.min(1, (now - start) / duration);
                write(from + distance * easeOutCubic(t));
                if (t < 1) {
                    animationFrame = requestAnimationFrame(step);
                    return;
                }
                cancelAnimation();
                // The band moved under us (a suggestion strip, an autofill bar).
                // Settle against the geometry we actually finished with.
                if (recheckAfterAnimation) {
                    recheckAfterAnimation = false;
                    revealFocused();
                }
            };
            animationFrame = requestAnimationFrame(step);
        };

        const reveal = (el: HTMLElement) => {
            if (!el.isConnected) return;
            cancelAnimation();
            recheckAfterAnimation = false;

            // The band the user can actually see: the visual viewport, further
            // clipped to the scrolling container the field lives in.
            const viewportTop = vv ? vv.offsetTop : 0;
            let bandTop = viewportTop;
            let bandBottom = viewportTop + (vv ? vv.height : window.innerHeight);

            const scroller = findScroller(el);
            if (scroller) {
                const box = scroller.getBoundingClientRect();
                bandTop = Math.max(bandTop, box.top);
                bandBottom = Math.min(bandBottom, box.bottom);
            }

            const rect = el.getBoundingClientRect();
            let delta = 0;

            if (rect.height + PAD_PX * 2 > bandBottom - bandTop) {
                // A tall textarea can't fit; show its top, where the caret
                // starts and the label usually sits.
                delta = rect.top - (bandTop + PAD_PX);
            } else if (rect.bottom > bandBottom - PAD_PX) {
                delta = rect.bottom - (bandBottom - PAD_PX);
            } else if (rect.top < bandTop + PAD_PX) {
                delta = rect.top - (bandTop + PAD_PX);
            }

            if (Math.abs(delta) < 2) return; // Already comfortably in view.
            animateBy(scroller, delta);
        };

        const revealFocused = () => {
            // Scrolling the page can itself move the visual viewport, so geometry
            // events keep arriving while we animate. Restarting on each one would
            // cancel and recompute every frame and turn the glide into a crawl;
            // note it instead and settle once, at the end.
            if (animationFrame) {
                recheckAfterAnimation = true;
                return;
            }
            const el = document.activeElement;
            if (isTextEntry(el)) reveal(el);
        };

        // ── Geometry ─────────────────────────────────────────────────────────

        const publish = () => {
            geometryFrame = 0;

            // A pinch-zoom shrinks the visual viewport too. Resizing the app to
            // a pinched viewport would fight the user, so it is not a keyboard.
            const pinched = vv ? vv.scale > 1.01 : false;
            const height = vv ? vv.height : window.innerHeight;
            const covered = vv && !pinched
                ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
                : 0;
            const open = covered > OPEN_THRESHOLD_PX;

            root.style.setProperty("--kb", `${Math.round(covered)}px`);

            if (open) root.style.setProperty("--app-h", `${Math.round(height)}px`);
            // Release rather than freeze a stale pixel height, so the value
            // returns to the stylesheet's 100dvh.
            else root.style.removeProperty("--app-h");

            if (open !== keyboardOpen) {
                keyboardOpen = open;
                root.dataset.kb = open ? "open" : "closed";
            }

            // Re-check on every settled change, not just on open: keyboards
            // grow and shrink under you as suggestion strips and autofill bars
            // appear. `reveal` is a no-op when the field is already visible.
            if (open) revealFocused();
        };

        const scheduleGeometry = () => {
            if (geometryFrame) return;
            geometryFrame = requestAnimationFrame(publish);
        };

        // ── Wiring ───────────────────────────────────────────────────────────

        const onFocusIn = (e: FocusEvent) => {
            if (!coarse.matches) return;
            const el = e.target;
            if (!isTextEntry(el as Element)) return;

            window.clearTimeout(earlyTimer);
            window.clearTimeout(settledTimer);
            // Two passes: one for the case where no keyboard appears at all
            // (hardware keyboard, tablet with one attached), and one after the
            // keyboard's ~300ms entrance, when the visual viewport is final.
            earlyTimer = window.setTimeout(() => reveal(el as HTMLElement), EARLY_REVEAL_MS);
            settledTimer = window.setTimeout(() => reveal(el as HTMLElement), SETTLED_REVEAL_MS);
        };

        const onFocusOut = () => {
            window.clearTimeout(earlyTimer);
            window.clearTimeout(settledTimer);
            cancelAnimation();
        };

        root.dataset.kb = "closed";
        publish();
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
        vv?.addEventListener("resize", scheduleGeometry);
        vv?.addEventListener("scroll", scheduleGeometry);
        window.addEventListener("orientationchange", scheduleGeometry);

        return () => {
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
            vv?.removeEventListener("resize", scheduleGeometry);
            vv?.removeEventListener("scroll", scheduleGeometry);
            window.removeEventListener("orientationchange", scheduleGeometry);

            if (geometryFrame) cancelAnimationFrame(geometryFrame);
            window.clearTimeout(earlyTimer);
            window.clearTimeout(settledTimer);
            cancelAnimation();

            root.style.removeProperty("--app-h");
            root.style.removeProperty("--kb");
            delete root.dataset.kb;
        };
    }, []);

    return null;
}
