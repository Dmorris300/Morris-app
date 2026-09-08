import axios from "axios";
import { fireToolNotification } from "./notification-triggers";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("morris_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Track expired-session redirects so we don't stack toasts or double-navigate
// when several in-flight requests all 401 together (e.g. dashboard + notify).
let sessionExpiryHandled = false;
function handleExpiredSession() {
  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  try { localStorage.removeItem("morris_token"); } catch { /* ignore */ }
  try {
    toast.error("Your session has expired. Please sign in again.", { duration: 4500 });
  } catch { /* ignore */ }
  // Don't nuke the current tab if we're already on an auth screen — the login
  // form will handle it. Otherwise send the user to login and remember where
  // they were so we can bounce them back (feature reserved for later).
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const onAuthScreen = /^\/(login|signup|forgot|reset)/i.test(path);
  if (!onAuthScreen && typeof window !== "undefined") {
    setTimeout(() => { window.location.href = "/login"; }, 400);
  }
  // Reset guard after a bit so a legitimate re-login can trigger the flow again
  // later in the same tab if the new token also expires.
  setTimeout(() => { sessionExpiryHandled = false; }, 10000);
}

// Fire a notification bell update whenever a tool successfully generates a
// document via /generate. Phase 2 — document & finance triggers. Tools that
// do not call /generate (currently only Mileage Tracker) fire directly.
api.interceptors.response.use(
  (response) => {
    try {
      const url = response?.config?.url || "";
      const method = (response?.config?.method || "").toLowerCase();
      if (method === "post" && (url === "/generate" || url.endsWith("/generate"))) {
        const raw = response.config.data;
        const body = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
        if (body && body.toolId) {
          fireToolNotification({
            toolId: body.toolId,
            toolName: body.toolName,
            userInputs: body.userInputs,
          });
        }
      }
    } catch { /* never let notification logic break api responses */ }
    return response;
  },
  (error) => {
    // Shared session-reliability handler. A 401 from any endpoint means the
    // stored token is no longer valid (rotated on password change, cleared
    // by another logout, backend recycle, etc.). We clear it, tell the user
    // once, and route them to the login screen. Individual pages still get
    // the rejected promise so they can preserve unsaved form state.
    const status = error?.response?.status;
    if (status === 401) handleExpiredSession();
    return Promise.reject(error);
  }
);

export default api;
