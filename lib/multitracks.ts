// Server-only client for the MultiTracks Playback API. Only ever imported by
// server routes — credentials come from env vars and never reach the browser.

const BASE = process.env.MT_API_BASE || "https://api.multitracks.com";
const BUILD = 85420;
const UA = `Playback/8.5.4 (com.multitracks.custommixplayer; build:${BUILD}; macOS(Catalyst) 15.7.5) Alamofire/5.11.1`;
const DEVICE_IDENTIFIER = process.env.MT_DEVICE_IDENTIFIER || "31B6D98D-6B1E-501D-B336-3AC261E5404D";
const DEVICE_NAME = `MacBook Air (M3, 15") Version 15.7.5 (Build 24G624)`;

export interface MtSession {
  hash: string;
  customerID: number;
  userAccessID: number;
}

export interface MtSetlist {
  setlistID: number;
  title: string;
  date: string;
  serviceTypeTitle: string;
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*", "User-Agent": UA },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MultiTracks API ${path} returned HTTP ${res.status}`);
  return res.json();
}

// Logs in with the service-account credentials and returns the session fields
// every other endpoint needs. The session hash is long-lived but we re-auth
// per sync to stay stateless (serverless has no durable memory between runs).
export async function authenticate(): Promise<MtSession> {
  const username = process.env.MT_USERNAME;
  const password = process.env.MT_PASSWORD;
  if (!username || !password) {
    throw new Error("MultiTracks sync is not configured (MT_USERNAME / MT_PASSWORD missing).");
  }

  const data = await post("/playback/authenticate", {
    username,
    password,
    build: BUILD,
    language: "en",
    deviceIdentifier: DEVICE_IDENTIFIER,
    platform: 3,
    application: "Mac15,13",
    deviceName: DEVICE_NAME,
  });

  if (data?.result !== 1) {
    throw new Error(data?.message || "MultiTracks authentication failed.");
  }
  return { hash: data.hash, customerID: data.customerID, userAccessID: data.userAccessID };
}

// Fetches upcoming setlists (from today forward).
export async function fetchSetlists(session: MtSession, search = ""): Promise<MtSetlist[]> {
  const dateFrom = `${new Date().toISOString().slice(0, 10)}T00:00:00`;
  const data = await post("/playback/setlists", {
    ...session,
    language: "en",
    build: BUILD,
    countryID: 1,
    teamSharing: true,
    cloud: true,
    rentals: true,
    restricted: false,
    dateFrom,
    search,
    pageNumber: 1,
    pageSize: 50,
  });

  const raw: any[] = data?.data?.setlists ?? [];
  return raw
    .map((s) => ({
      setlistID: s.setlistID,
      title: s.title || "Untitled Setlist",
      date: s.dateSetlist || s.date || "",
      serviceTypeTitle: s.serviceTypeTitle || "",
    }))
    .filter((s) => s.setlistID != null);
}

export async function getUpcomingSetlists(): Promise<MtSetlist[]> {
  const session = await authenticate();
  return fetchSetlists(session);
}
