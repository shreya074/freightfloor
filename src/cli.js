#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { solve, audit } from "./planner.js";

try {
  const [file, ...rest] = process.argv.slice(2);
  if (!file)
    throw Error(
      "usage: freightfloor SCENARIO.json [--horizon N] [--nodes N] [--audit RESULT.json]",
    );
  const data = JSON.parse(readFileSync(file, "utf8")),
    options = {};
  let check;
  for (let i = 0; i < rest.length; i += 2) {
    if (i + 1 === rest.length) throw Error("missing option value");
    if (rest[i] === "--horizon") options.horizon = Number(rest[i + 1]);
    else if (rest[i] === "--nodes") options.maxNodes = Number(rest[i + 1]);
    else if (rest[i] === "--audit") check = rest[i + 1];
    else throw Error("unknown flag: " + rest[i]);
  }
  if (check)
    console.log(
      JSON.stringify(
        audit(data, JSON.parse(readFileSync(check, "utf8"))),
        null,
        2,
      ),
    );
  else {
    const result = solve(data, options);
    if (result.status === "optimal") audit(data, result);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "optimal") process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
