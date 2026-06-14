import axios from "axios";
import { fireToolNotification } from "./notification-triggers";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("morris_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
  (error) => Promise.reject(error)
);

export default api;
