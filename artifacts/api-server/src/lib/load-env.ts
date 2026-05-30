import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsAt = trimmed.indexOf("=");
  if (equalsAt <= 0) return null;

  const key = trimmed.slice(0, equalsAt).trim();
  let value = trimmed.slice(equalsAt + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const [key, value] = parsed;
    process.env[key] ??= value;
  }
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(moduleDir, "../..");

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(apiRoot, ".env"));
