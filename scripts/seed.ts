import { readFileSync } from "node:fs";
import path from "node:path";
import { syncPayload } from "../src/lib/validation";

async function main() {
  const file = path.join(process.cwd(), "fixtures/sample.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const parsed = syncPayload.parse(raw);

  const url = process.env.SYNC_URL ?? "http://localhost:3000/api/sync";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    console.error("seed failed:", res.status, await res.text());
    process.exit(1);
  }
  console.log("seeded:", await res.json());
}

main();
