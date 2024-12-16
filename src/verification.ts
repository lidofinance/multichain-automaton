import { readFileSync } from "node:fs";

import dotenv from "dotenv";

import { runCommand } from "./command-utils";
import env from "./env";

export function runVerificationScript({
  config,
  network,
  workingDirectory,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
}: {
  config: string;
  network: string;
  workingDirectory: string;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
}) {
  const args = configFromArtifacts(config);
  let contract: keyof typeof args;
  for (contract in args) {
    const ctorArgs = args[contract];
    runCommand({
      command: "npx",
      args: ["hardhat", "verify", "--network", network, contract, ...ctorArgs],
      workingDirectory,
      environment: process.env,
      throwOnFail,
      tryNumber,
      maxTries,
    });
  }
}

export function setupGovExecutorVerification() {
  dotenv.populate(
    process.env as { [key: string]: string },
    {
      L2_PRC_URL: env.url("L2_REMOTE_RPC_URL"),
      L2_BLOCK_EXPLORER_API_KEY: env.string("L2_EXPLORER_TOKEN"),
      L2_CHAIN_ID: env.string("L2_CHAIN_ID"),
      L2_BLOCK_EXPLORER_API_URL: env.url("L2_BLOCK_EXPLORER_API_URL"),
      L2_BLOCK_EXPLORER_BROWSER_URL: env.url("L2_BLOCK_EXPLORER_BROWSER_URL")
    },
    { override: true },
  );
}

function configFromArtifacts(fileName: string) {
  const data = readFileSync(`./artifacts/${fileName}`, "utf8");
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
  }
}
