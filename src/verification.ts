import { readFileSync } from "node:fs";

import dotenv from "dotenv";
import { JsonRpcProvider } from "ethers";

import { runCommand } from "./command-utils";
import env from "./env";
import { LogCallback, LogType } from "./log-utils";

export async function runVerificationScript({
  config,
  network,
  rpcUrl,
  workingDirectory,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  logCallback,
}: {
  config: string;
  network: string;
  rpcUrl: string;
  workingDirectory: string;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
  logCallback: LogCallback;
}) {
  const provider = new JsonRpcProvider(rpcUrl);
  const args = configFromArtifacts(config);
  let contract: keyof typeof args;
  for (contract in args) {
    await waitForContract(provider, contract, logCallback);
    const ctorArgs = args[contract];
    await runCommand({
      command: "npx",
      args: ["hardhat", "verify", "--network", network, contract, ...ctorArgs],
      workingDirectory,
      environment: process.env,
      throwOnFail,
      tryNumber,
      maxTries,
      logCallback: logCallback,
    });
  }
}

export async function waitForBlockFinalization(
  provider: JsonRpcProvider,
  blockNumber: number,
  logCallback: LogCallback,
  checkInterval: number = 10000,
) {
  while (true) {
    const finalizedBlock = await provider.getBlock("finalized");
    const finalizedBlockNumber = finalizedBlock?.number;

    if (finalizedBlockNumber === undefined) {
      throw Error("Can't fetch block");
    }
    logCallback(
      `Waiting for block ${blockNumber} to be finalized. Current finalized block: ${finalizedBlockNumber}`,
      LogType.Level1,
    );

    if (blockNumber <= finalizedBlockNumber) {
      return;
    }
    logCallback(`${blockNumber} isn't finalized. Retrying in ${checkInterval / 1000} seconds...`, LogType.Level1);
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

async function waitForContract(
  provider: JsonRpcProvider,
  address: string,
  logCallback: LogCallback,
  checkInterval: number = 5000,
) {
  logCallback(`Checking if address ${address} is an Contract or EOA...`, LogType.Level1);

  while (true) {
    const code = await provider.getCode(address);
    if (code !== "0x") {
      return;
    }
    logCallback(`${address} is EOA. Retrying in ${checkInterval / 1000} seconds...`, LogType.Level1);
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
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
      L2_BLOCK_EXPLORER_BROWSER_URL: env.url("L2_BLOCK_EXPLORER_BROWSER_URL"),
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
