import type { ParsedArgs } from "./args.js";
import { analyzeProject } from "./analysis.js";
import { makeUiData, renderUi } from "./ui/render.js";
import { paint } from "./terminal.js";

export async function runUi(parsed: ParsedArgs): Promise<number> {
  const { createServer } = await import("node:http");
  let analysis = await analyzeProject(parsed);
  let data = makeUiData(analysis);
  const host = parsed.host ?? "127.0.0.1",
    requestedPort = parsed.port ?? 4177;
  const noCache = {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
  };
  async function refreshAnalysis() {
    analysis = await analyzeProject(parsed);
    data = makeUiData(analysis);
    return data;
  }
  const server = createServer(async (req: any, res: any) => {
    try {
      if (req.url?.startsWith("/api/analysis")) return json(res, await refreshAnalysis());
      if (req.url?.startsWith("/api/reanalyze") && req.method === "POST") return json(res, await refreshAnalysis());
      if (req.url === "/" || req.url?.startsWith("/?")) {
        const fresh = await refreshAnalysis();
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...noCache });
        return res.end(renderUi(fresh));
      }
      res.writeHead(404, noCache);
      res.end("Not found");
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8", ...noCache });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(requestedPort, host, () => ok(undefined));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  console.log(`\n${paint.brand("▣ Application Wiring Analyzer")} ${paint.muted("— Visual Explorer")}`);
  console.log(`${paint.label("Project:")} ${paint.path(analysis.projectRoot)}`);
  console.log(`${paint.label("Dashboard:")} ${paint.link(`http://${host}:${port}`)}`);
  console.log(`${paint.muted("Press Ctrl+C to stop.")}\n`);
  return new Promise(() => {});
}

function json(res: any, value: any) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
  });
  res.end(JSON.stringify(value));
}
