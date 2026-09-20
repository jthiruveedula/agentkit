#!/usr/bin/env node
// Thin npx shim -- delegates to install.sh. Real implementation lives there;
// this just locates it and execs it, so `npx github:jthiruveedula/agentkit`
// works without a build step or npm registry publish.
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "install.sh");
const args = process.argv.slice(2);

const result = spawnSync("sh", [script, ...args], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
