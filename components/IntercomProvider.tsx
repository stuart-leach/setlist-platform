"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Intercom: ((...args: unknown[]) => void) & { q?: unknown[]; c?: (args: unknown) => void };
    intercomSettings?: Record<string, unknown>;
  }
}

interface Props {
  appId: string;
  userId: string;
  email: string;
  name: string;
  userHash?: string;
}

export default function IntercomProvider({ appId, userId, email, name, userHash }: Props) {
  useEffect(() => {
    if (!appId) return;

    // Standard Intercom loader snippet
    (function () {
      const w = window;
      const ic = w.Intercom;
      if (typeof ic === "function") {
        ic("reattach_activator");
        ic("update", w.intercomSettings);
      } else {
        const d = document;
        const i = function (...args: unknown[]) {
          i.c?.(args);
        };
        i.q = [];
        i.c = function (args: unknown) {
          i.q?.push(args);
        };
        w.Intercom = i as typeof window.Intercom;
        function l() {
          const s = d.createElement("script");
          s.type = "text/javascript";
          s.async = true;
          s.src = `https://widget.intercom.io/widget/${appId}`;
          const x = d.getElementsByTagName("script")[0];
          x.parentNode?.insertBefore(s, x);
        }
        if (document.readyState === "complete") {
          l();
        } else if (w.attachEvent) {
          w.attachEvent("onload", l);
        } else {
          w.addEventListener("load", l, false);
        }
      }
    })();

    window.Intercom("boot", {
      app_id: appId,
      user_id: userId,
      email,
      name,
      ...(userHash ? { user_hash: userHash } : {}),
    });

    return () => {
      window.Intercom?.("shutdown");
    };
  }, [appId, userId]);

  return null;
}
