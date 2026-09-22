const SHEET_ID = "1BhF9CJSN3CQO_9IpSmdvxWXvoDgXvukk_h1pfv9JcQc";
const ROSTER_SHEET_NAME = "League Player Roster";

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Google Sheet "League Player Roster" tab -- Player (real name, col A) to DraftKings Alias
 *  (col B), a crosswalk shared across the user's DK leagues (golf + football). DK's
 *  contest-standings export only ever gives the entrant's own DK username (e.g. "hutch25"),
 *  never their real name -- this resolves that for display on the Weekly Results page and
 *  the Roster Tendencies / Player Exposure stats. Read at request time (not cached in the
 *  DB) so a newly-added alias in the Sheet takes effect immediately, no re-import needed. */
export async function fetchAliasToNameMap(): Promise<Map<string, string>> {
  try {
    const res = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(ROSTER_SHEET_NAME)}`,
      { cache: "no-store" },
    );
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    const map = new Map<string, string>();
    for (let i = 1; i < lines.length; i += 1) {
      const values = lines[i].split(",").map((v) => v.replace(/"/g, "").trim());
      const name = values[0];
      const alias = values[1];
      if (!name || !alias) continue;
      map.set(normalizeAlias(alias), name);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Resolves a raw DK entry name to a real league-member name via the alias map; falls back
 *  to the raw DK name unresolved (rather than hiding it) so a missing alias is still
 *  visible and reportable instead of silently disappearing. */
export function resolveOwnerName(aliasMap: Map<string, string>, dkEntryName: string): string {
  return aliasMap.get(normalizeAlias(dkEntryName)) ?? dkEntryName;
}

/** Same sheet, opposite direction and un-normalized -- real name (col A) to the DK alias
 *  exactly as typed in col B, for display next to a real name (e.g. "Andrew Hutchison
 *  (hutch25)") rather than for matching. If a name has more than one alias row, the first
 *  one wins. */
export async function fetchNameToAliasMap(): Promise<Map<string, string>> {
  try {
    const res = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(ROSTER_SHEET_NAME)}`,
      { cache: "no-store" },
    );
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    const map = new Map<string, string>();
    for (let i = 1; i < lines.length; i += 1) {
      const values = lines[i].split(",").map((v) => v.replace(/"/g, "").trim());
      const name = values[0];
      const alias = values[1];
      if (!name || !alias || map.has(name)) continue;
      map.set(name, alias);
    }
    return map;
  } catch {
    return new Map();
  }
}
