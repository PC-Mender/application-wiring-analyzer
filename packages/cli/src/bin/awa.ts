#!/usr/bin/env node
import { runCLI } from "../index.js";
import { paint } from "../terminal.js";

runCLI(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  console.error(`${paint.error("AWA CLI error:")} ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
