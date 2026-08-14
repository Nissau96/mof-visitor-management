import assert from "node:assert/strict";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);

const projectRoot = path.resolve(
  scriptDirectory,
  "..",
);

const migrationPath = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "20260814093000_add_data_retention_controls.sql",
);

const migrationSql = await readFile(
  migrationPath,
  "utf8",
);

const normalizedSql = migrationSql
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

assert.match(
  normalizedSql,
  /create table public\.data_retention_policies/,
);

assert.match(
  normalizedSql,
  /create table public\.data_retention_holds/,
);

assert.match(
  normalizedSql,
  /'mof-visitor-retention-v1'/,
);

assert.match(
  normalizedSql,
  /interval '2 years'/,
);

assert.match(
  normalizedSql,
  /interval '24 hours'/,
);

assert.match(
  normalizedSql,
  /create unique index data_retention_one_active_policy_idx/,
);

assert.match(
  normalizedSql,
  /alter table public\.data_retention_policies enable row level security/,
);

assert.match(
  normalizedSql,
  /alter table public\.data_retention_holds enable row level security/,
);

assert.match(
  normalizedSql,
  /create index public_request_limits_updated_at_idx/,
);

assert.match(
  normalizedSql,
  /create index audit_events_created_at_idx/,
);

assert.match(
  normalizedSql,
  /create index visitor_profiles_updated_at_idx/,
);

assert.match(
  normalizedSql,
  /create or replace function public\.preview_data_retention_cleanup\(\)/,
);

assert.match(
  normalizedSql,
  /create or replace function public\.execute_data_retention_cleanup\(/,
);

const securedFunctionDefinitions = [
  ...normalizedSql.matchAll(
    /language plpgsql security definer set search_path = ''/g,
  ),
];

assert.equal(
  securedFunctionDefinitions.length,
  2,
  "Both retention functions must use SECURITY DEFINER with an empty search_path.",
);

assert.match(
  normalizedSql,
  /p_policy_version <> v_active_policy_version/,
);

assert.match(
  normalizedSql,
  /p_batch_size < 1 or p_batch_size > 10000/,
);

assert.match(
  normalizedSql,
  /pg_catalog\.pg_advisory_xact_lock/,
);

assert.match(
  normalizedSql,
  /for update of token skip locked/,
);

assert.match(
  normalizedSql,
  /for update of request_limit skip locked/,
);

assert.match(
  normalizedSql,
  /for update of visit skip locked/,
);

assert.match(
  normalizedSql,
  /for update of visitor_profile skip locked/,
);

assert.match(
  normalizedSql,
  /for update of audit_event skip locked/,
);

assert.match(
  normalizedSql,
  /visit\.checked_out_at is not null/,
);

assert.match(
  normalizedSql,
  /visit\.checked_out_at < v_visitor_cutoff/,
);

assert.match(
  normalizedSql,
  /retention_hold\.target_type = 'visit'/,
);

assert.match(
  normalizedSql,
  /retention_hold\.target_type = 'visitor_profile'/,
);

assert.match(
  normalizedSql,
  /audit_hold\.target_type = 'audit_event'/,
);

assert.match(
  normalizedSql,
  /not exists \( select 1 from public\.visits visit where visit\.visitor_id = visitor_profile\.id \)/,
);

assert.match(
  normalizedSql,
  /'retention\.cleanup'/,
);

assert.match(
  normalizedSql,
  /'deletedverificationtokens'/,
);

assert.match(
  normalizedSql,
  /'deletedratelimitcounters'/,
);

assert.match(
  normalizedSql,
  /'deletedcompletedvisits'/,
);

assert.match(
  normalizedSql,
  /'deletedvisitorprofiles'/,
);

assert.match(
  normalizedSql,
  /'deletedauditevents'/,
);

assert.match(
  normalizedSql,
  /revoke execute on function public\.preview_data_retention_cleanup\(\) from public, anon, authenticated/,
);

assert.match(
  normalizedSql,
  /grant execute on function public\.preview_data_retention_cleanup\(\) to service_role/,
);

assert.match(
  normalizedSql,
  /grant execute on function public\.execute_data_retention_cleanup\( text, integer, uuid \) to service_role/,
);

assert.doesNotMatch(
  normalizedSql,
  /create extension(?: if not exists)? pg_cron/,
);

assert.doesNotMatch(
  normalizedSql,
  /cron\.schedule\s*\(/,
);

assert.doesNotMatch(
  normalizedSql,
  /audit_events_id_seq/,
  "Identity-backed audit IDs must not be inserted manually.",
);

const auditInsert = migrationSql.match(
  /insert\s+into\s+public\.audit_events\s*\(([\s\S]*?)\)\s*values\s*\(/i,
);

assert.ok(
  auditInsert,
  "The cleanup audit insertion must exist.",
);

const auditInsertColumns = auditInsert[1]
  .split(",")
  .map((column) => column.trim().toLowerCase());

assert.equal(
  auditInsertColumns.includes("id"),
  false,
  "audit_events.id is GENERATED ALWAYS and must be omitted.",
);

async function findDeployableFunctions(
  directory,
  relativeDirectory = "",
) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  const functions = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      continue;
    }

    const relativePath = path.join(
      relativeDirectory,
      entry.name,
    );

    const absolutePath = path.join(
      directory,
      entry.name,
    );

    if (entry.isDirectory()) {
      functions.push(
        ...await findDeployableFunctions(
          absolutePath,
          relativePath,
        ),
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".js")
    ) {
      functions.push(relativePath);
    }
  }

  return functions;
}

const deployableFunctions =
  await findDeployableFunctions(
    path.join(projectRoot, "api"),
  );

assert.equal(
  deployableFunctions.length,
  11,
  `Expected 11 deployable Vercel Functions, found ${deployableFunctions.length}.`,
);

assert.ok(
  deployableFunctions.length <= 12,
  "The Vercel Hobby-plan function limit was exceeded.",
);

console.log(
  "Data-retention validation checks passed.",
);