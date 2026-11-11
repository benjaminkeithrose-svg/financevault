import { prisma } from "../db.js";
import { HttpError } from "../middleware/errorHandler.js";
import { programVersion } from "./appInfo.js";
import { decryptField, encryptField, hasDataKey } from "./fieldCrypto.js";
import { publicRecord } from "./layoutRecords.js";

/**
 * Sending layout records (layoutRecords.ts) to the owner's own private GitHub
 * repository, once a day — so the statement reader can be improved for the
 * banks they actually use, without them uploading anything by hand.
 *
 * Off until they set it up with a repository and a key (a GitHub token that
 * can write to that one repository). The key is stored encrypted and only
 * usable while the app is unlocked. Before anything is sent, GitHub is asked
 * whether the repository is private; if it isn't, nothing is sent. Only the
 * layout records go — never a document, a figure, a name or the file hash.
 */

const API = () => process.env.FV_GITHUB_API || "https://api.github.com";
export const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const DAY = 24 * 60 * 60 * 1000;

async function settings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function shareStatus() {
  const s = await settings();
  const [total, unsent] = await Promise.all([prisma.layoutRecord.count(), prisma.layoutRecord.count({ where: { sentAt: null } })]);
  return {
    on: s.layoutShareOn,
    repo: s.layoutShareRepo,
    hasKey: !!s.layoutShareToken,
    lastSentAt: s.layoutShareLastAt?.toISOString() ?? null,
    error: s.layoutShareError,
    total,
    unsent,
  };
}

export async function saveShare(input: { on?: boolean; repo?: string | null; token?: string | null }) {
  const data: Record<string, unknown> = {};
  if (input.repo !== undefined) {
    const repo =
      input.repo
        ?.trim()
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\.git$|\/$/g, "") || null;
    if (repo && !REPO_PATTERN.test(repo)) throw new HttpError(400, "The repository should look like your-name/repository-name.");
    data.layoutShareRepo = repo;
  }
  if (input.token !== undefined) data.layoutShareToken = input.token?.trim() ? encryptField(input.token.trim()) : null;
  if (input.on !== undefined) data.layoutShareOn = input.on;
  const s = await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  if (s.layoutShareOn && (!s.layoutShareRepo || !s.layoutShareToken)) {
    await prisma.settings.update({ where: { id: 1 }, data: { layoutShareOn: false } });
    throw new HttpError(400, "Add the repository and the key first.");
  }
  if (input.repo !== undefined || input.token !== undefined)
    await prisma.settings.update({ where: { id: 1 }, data: { layoutShareError: null } });
  return shareStatus();
}

async function github(path: string, token: string, init?: RequestInit) {
  return fetch(`${API()}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "Financial-Vault-layouts",
      "x-github-api-version": "2022-11-28",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

/** Can the key see the repository, is it private, and can the key write to it? */
export async function checkShare(): Promise<{ ok: boolean; message: string }> {
  const s = await settings();
  if (!s.layoutShareRepo || !s.layoutShareToken) return { ok: false, message: "Add the repository and the key first." };
  const token = decryptField(s.layoutShareToken)!;
  let res: Response;
  try {
    res = await github(`/repos/${s.layoutShareRepo}`, token);
  } catch (e) {
    return { ok: false, message: `Couldn't reach GitHub (${(e as Error).message}).` };
  }
  if (res.status === 401)
    return { ok: false, message: "GitHub didn't accept the key — it may have expired. Make a new one and paste it in." };
  if (res.status === 404 || res.status === 403)
    return { ok: false, message: "This key can't see that repository. Check the name, and that the key was made for that repository." };
  if (!res.ok) return { ok: false, message: `GitHub answered ${res.status}.` };
  const repo = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
  if (repo.private !== true)
    return { ok: false, message: "That repository is public, so nothing will be sent to it. Make it private on GitHub first." };
  if (repo.permissions && repo.permissions.push === false)
    return { ok: false, message: 'This key can read the repository but not add to it. Give the key "Contents: Read and write".' };
  return { ok: true, message: "Connected: the repository is private and the key can add to it." };
}

let sending = false;

/** Sends the records not yet sent. Stops at the first problem and remembers it. */
export async function sendLayouts(): Promise<{ sent: number; error: string | null }> {
  if (sending) return { sent: 0, error: "Already sending." };
  sending = true;
  try {
    const check = await checkShare();
    if (!check.ok) {
      await prisma.settings.update({ where: { id: 1 }, data: { layoutShareError: check.message } });
      return { sent: 0, error: check.message };
    }
    const s = await settings();
    const token = decryptField(s.layoutShareToken)!;
    const version = programVersion();
    const records = await prisma.layoutRecord.findMany({ where: { sentAt: null }, orderBy: { createdAt: "asc" }, take: 300 });
    let sent = 0;
    let error: string | null = null;
    for (const r of records) {
      const record = publicRecord(r, version);
      const path = `layouts/${record.recordedOn.slice(0, 7)}/${r.id}.json`;
      const res = await github(`/repos/${s.layoutShareRepo}/contents/${path}`, token, {
        method: "PUT",
        body: JSON.stringify({
          message: `Layout record: ${record.kind}${record.issuer ? ` (${record.issuer})` : ""}`,
          content: Buffer.from(JSON.stringify({ ...record, sentAt: undefined }, null, 2)).toString("base64"),
        }),
      }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }) as Response);
      // 422: the file is already there (sent before, then the app was restored from a backup).
      if (res.ok || res.status === 422) {
        await prisma.layoutRecord.update({ where: { id: r.id }, data: { sentAt: new Date() } });
        sent++;
      } else {
        error = res.status ? `GitHub answered ${res.status} while sending.` : `Couldn't reach GitHub (${res.statusText}).`;
        break;
      }
    }
    await prisma.settings.update({ where: { id: 1 }, data: { layoutShareLastAt: new Date(), layoutShareError: error } });
    return { sent, error };
  } finally {
    sending = false;
  }
}

/** Once a day, alongside the update check: send new records, if switched on and the app is unlocked. Quiet when offline. */
export function startDailyLayoutShare() {
  const tick = async () => {
    try {
      if (!hasDataKey()) return;
      const s = await settings();
      if (!s.layoutShareOn || !s.layoutShareRepo || !s.layoutShareToken) return;
      if (s.layoutShareLastAt && Date.now() - s.layoutShareLastAt.getTime() < DAY - 60 * 60 * 1000) return;
      if (!(await prisma.layoutRecord.count({ where: { sentAt: null } }))) return;
      await sendLayouts();
    } catch {
      // Try again next hour.
    }
  };
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), 60 * 60 * 1000).unref();
}
