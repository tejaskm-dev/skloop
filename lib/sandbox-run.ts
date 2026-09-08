"use client";

/**
 * Runs untrusted JavaScript in a throwaway sandboxed iframe.
 *
 * The previous implementation called `new Function(code)()` directly on the
 * page. That executes in the app's own realm with full access to the DOM,
 * `document.cookie`, localStorage and the live Supabase session — so a snippet
 * could read the user's tokens or act as them. That was already generous when
 * the code came from the user; now that Loopy can generate code from retrieved
 * content, it is a prompt-injection path straight into the session.
 *
 * Here the code runs inside an iframe with `sandbox="allow-scripts"` and
 * deliberately WITHOUT `allow-same-origin`, which gives the frame an opaque
 * origin: no parent DOM, no cookies, no storage, no session. It reports back
 * over postMessage and is destroyed afterwards.
 */

export interface RunResult {
    lines: string[];
    isError: boolean;
}

const TIMEOUT_MS = 3000;

export function runSandboxed(code: string): Promise<RunResult> {
    return new Promise((resolve) => {
        if (typeof window === "undefined") {
            resolve({ lines: ["✖ Not available"], isError: true });
            return;
        }

        const token = `sbx_${Math.random().toString(36).slice(2)}`;
        let settled = false;

        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts"); // no allow-same-origin
        iframe.style.display = "none";

        const cleanup = () => {
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            iframe.remove();
        };

        const finish = (result: RunResult) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const onMessage = (e: MessageEvent) => {
            // The frame is origin-less, so identify it by the one-time token
            // rather than by e.origin (which is "null" for opaque origins).
            if (!e.data || e.data.token !== token) return;
            finish({ lines: e.data.lines ?? [], isError: !!e.data.isError });
        };

        const timer = setTimeout(
            () => finish({ lines: ["✖ Timed out after 3s — check for an infinite loop."], isError: true }),
            TIMEOUT_MS
        );

        window.addEventListener("message", onMessage);

        // JSON.stringify safely embeds the snippet as a string literal, so it
        // cannot break out of the surrounding script.
        const srcDoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function () {
  var lines = [];
  var isError = false;
  var fmt = function (a) {
    try {
      return typeof a === "object" && a !== null ? JSON.stringify(a) : String(a);
    } catch (e) { return String(a); }
  };
  console.log = function () { lines.push([].map.call(arguments, fmt).join(" ")); };
  console.warn = function () { lines.push("\\u26a0 " + [].map.call(arguments, fmt).join(" ")); };
  console.error = function () { isError = true; lines.push("\\u2716 " + [].map.call(arguments, fmt).join(" ")); };

  try {
    var result = (0, eval)(${JSON.stringify(code)});
    if (result !== undefined) lines.push("\\u2192 " + fmt(result));
    if (lines.length === 0) lines.push("\\u2713 Ran with no output");
  } catch (e) {
    isError = true;
    lines.push("\\u2716 " + (e && e.message ? e.message : String(e)));
  }

  parent.postMessage({ token: ${JSON.stringify(token)}, lines: lines.slice(0, 200), isError: isError }, "*");
})();
<\/script></body></html>`;

        iframe.srcdoc = srcDoc;
        document.body.appendChild(iframe);
    });
}
