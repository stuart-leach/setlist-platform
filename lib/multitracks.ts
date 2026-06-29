// Server-only client for the MultiTracks Playback API. Only ever imported by
// server routes. The admin enters credentials in-app; we authenticate once and
// persist the encrypted session token — the raw password is never stored.

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

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

// Logs in with admin-supplied credentials and returns the session fields every
// other endpoint needs. Called once at "Connect" time; the password is used
// here and then discarded (only the returned token is persisted, encrypted).
export async function authenticateWith(username: string, password: string): Promise<MtSession> {
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

// ── Token encryption (AES-256-GCM) ────────────────────────────────────────────
// The session token is a bearer credential, so we encrypt it at rest. The key is
// derived from CRON_SECRET so no extra env var is needed; rotating CRON_SECRET
// invalidates the stored token (admin simply reconnects).
function encKey(): Buffer {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required to encrypt the MultiTracks token.");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
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
