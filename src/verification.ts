import dotenv from "dotenv";
import { JsonRpcProvider } from "ethers";

import { runCommand } from "./command-utils";
import { loadDeployedContractsWithArgs } from "./deployment-args";
import env from "./env";
import { LogCallback, LogType } from "./log-utils";

async function runVerificationScript({
  config,
  network,
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
  const args = loadDeployedContractsWithArgs(config);
  let contract: keyof typeof args;
  for (contract in args) {
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

async function waitForBlockFinalization(
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

function setupGovExecutorVerification() {
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

function setupHardhatConfigInL2Repo() {
  dotenv.populate(
    process.env as { [key: string]: string },
    {
      L1_PRC_URL: env.url("L1_REMOTE_RPC_URL"),
      L2_PRC_URL: env.url("L2_REMOTE_RPC_URL"),
      L1_BLOCK_EXPLORER_API_KEY: env.string("L1_EXPLORER_TOKEN"),
      L2_BLOCK_EXPLORER_API_KEY: env.string("L2_EXPLORER_TOKEN"),
      L1_CHAIN_ID: env.string("L1_CHAIN_ID"),
      L2_CHAIN_ID: env.string("L2_CHAIN_ID"),
      L1_BLOCK_EXPLORER_BROWSER_URL: env.url("L1_BLOCK_EXPLORER_BROWSER_URL"),
      L2_BLOCK_EXPLORER_BROWSER_URL: env.url("L2_BLOCK_EXPLORER_BROWSER_URL"),
      L1_BLOCK_EXPLORER_API_URL: `https://${env.string("L1_BLOCK_EXPLORER_API_HOST")}/api`,
      L2_BLOCK_EXPLORER_API_URL: `https://${env.string("L2_BLOCK_EXPLORER_API_HOST")}/api`
    }
  );
}

export {
    runVerificationScript,
    waitForBlockFinalization,
    setupGovExecutorVerification,
    setupHardhatConfigInL2Repo
}
