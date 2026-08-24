"use client";

import { useEffect, useState, useTransition } from "react";
import { Database, ExternalLink, RefreshCw, Unplug } from "lucide-react";

import {
  connectNotionDatabase,
  disconnectNotion,
  getNotionConnectionStatus,
  importLeadsFromNotion,
  listNotionDatabasesForToken,
  syncTrackerToNotion,
} from "@/actions/notion";
import type { NotionDatabaseSummary } from "@/lib/notion";

type Status = {
  connected: boolean;
  databaseName?: string;
  lastSyncedAt?: string | null;
};

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "Never synced yet";
  return `Last synced ${new Date(iso).toLocaleString()}`;
}

export function NotionTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [databases, setDatabases] = useState<NotionDatabaseSummary[] | null>(null);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getNotionConnectionStatus().then(setStatus);
  }, []);

  function handleListDatabases(): void {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await listNotionDatabasesForToken(token);
      if (!result.success || !result.databases) {
        setError(result.error ?? "Couldn't reach Notion with that token");
        return;
      }
      setDatabases(result.databases);
      setSelectedDb(result.databases[0]?.id ?? "");
    });
  }

  function handleConnect(): void {
    if (!selectedDb || !databases) return;
    setError(null);
    startTransition(async () => {
      const db = databases.find((d) => d.id === selectedDb);
      const result = await connectNotionDatabase(token, selectedDb, db?.title ?? "Untitled database");
      if (!result.success) {
        setError(result.error ?? "Failed to connect");
        return;
      }
      setToken("");
      setDatabases(null);
      const refreshed = await getNotionConnectionStatus();
      setStatus(refreshed);
    });
  }

  function handleSync(): void {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await syncTrackerToNotion();
      if (!result.success) {
        setError(result.error ?? "Sync failed");
        return;
      }
      setMessage(`Pushed ${result.synced ?? 0} tracked job${result.synced === 1 ? "" : "s"} to Notion.`);
      const refreshed = await getNotionConnectionStatus();
      setStatus(refreshed);
    });
  }

  function handleImport(): void {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await importLeadsFromNotion();
      if (!result.success) {
        setError(result.error ?? "Import failed");
        return;
      }
      setMessage(`Imported ${result.imported ?? 0} new lead${result.imported === 1 ? "" : "s"} from Notion.`);
    });
  }

  function handleDisconnect(): void {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await disconnectNotion();
      if (result.success) setStatus({ connected: false });
    });
  }

  if (status === null) {
    return <p className="text-xs text-text-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Notion</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Mirror your tracked jobs (Missions) into a Notion database, and pull in new leads you add there directly.
        </p>
      </div>

      {!status.connected ? (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1.5 text-xs leading-5 text-text-secondary">
            <li>
              1. Create a free internal integration at{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent underline"
              >
                notion.so/my-integrations <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>2. Share a database with it (••• menu on the database → Connections)</li>
            <li>3. Paste the integration&apos;s secret token below</li>
          </ol>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Integration token
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ntn_..."
              className="h-9 rounded-lg border border-border bg-transparent px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </label>

          {!databases ? (
            <button
              type="button"
              disabled={isPending || !token.trim()}
              onClick={handleListDatabases}
              className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Database className="h-4 w-4" />
              {isPending ? "Checking…" : "Find databases"}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Database
                </span>
                <select
                  value={selectedDb}
                  onChange={(e) => setSelectedDb(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
                >
                  {databases.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConnect}
                className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isPending ? "Connecting…" : "Connect this database"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Database className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{status.databaseName}</p>
                <p className="truncate text-[11px] text-text-muted">{formatSyncedAt(status.lastSyncedAt)}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDisconnect}
              className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
              aria-label="Disconnect"
            >
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSync}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              {isPending ? "Working…" : "Sync tracked jobs to Notion"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleImport}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
            >
              Import new leads from Notion
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
      {message && <p className="text-xs text-text-secondary">{message}</p>}
    </div>
  );
}
