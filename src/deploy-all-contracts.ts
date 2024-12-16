import { cpSync, readFileSync } from "node:fs";
import process from "node:process";

import chalk from "chalk";
import dotenv from "dotenv";
import { ethers } from 'ethers';

import { runCommand } from "./command-utils";
import { DeployParameters } from "./config";
import env from "./env";
import { NetworkType } from "./rpc-utils";

export async function burnL2DeployerNonces(l2RpcUrl: string, numNonces: number) {
  const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl);
  const l2Deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, l2Provider);
  const l2DeployerAddress = await l2Deployer.getAddress();
  console.log(
    `Burning ${numNonces} nonces from L2 deployer ${l2DeployerAddress} to prevent L1 and L2 addresses collision...`,
  );
  for (let nonceIndex = 0; nonceIndex < numNonces; nonceIndex++) {
    const MAX_TRIES = 3;
    let numTries = MAX_TRIES;
    while (true) {
      try {
        console.log(
          chalk.bold(
            chalk.yellowBright(
              `Burning ${nonceIndex} tx, try num ${MAX_TRIES - numTries + 1}`
            )
          )
        );
        const tx = await l2Deployer.sendTransaction({ to: l2DeployerAddress, value: 0 });
        await tx.wait();
        break;
      } catch(error) {
        if (--numTries == 0) throw error;
      }
    }
  }
}

export function runDeployScript({
  scriptPath,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
}: {
  scriptPath: string;
  environment?: NodeJS.ProcessEnv;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
}) {
  runCommand({
    command: "ts-node",
    args: ["--files", scriptPath],
    workingDirectory: "./lido-l2-with-steth",
    environment: process.env,
    throwOnFail,
    tryNumber,
    maxTries,
  });
}

 
export function populateDeployScriptEnvs(deploymentConfig: DeployParameters, govBridgeExecutor: string, networkType: NetworkType) {
  function formattedArray(configArray: Array<string>) {
    return `[${configArray.map((ts: string) => `"${ts.toString()}"`)}]`;
  }
  const l1Config = deploymentConfig.l1;
  const l2Config = deploymentConfig.l2;

  dotenv.populate(
    process.env as { [key: string]: string },

    {
      L1_BLOCK_EXPLORER_API_KEY: env.string("L1_EXPLORER_TOKEN"),
      L2_BLOCK_EXPLORER_API_KEY: env.string("L2_EXPLORER_TOKEN"),
      L1_BLOCK_EXPLORER_BROWSER_URL: env.url("L1_BLOCK_EXPLORER_BROWSER_URL"),
      L2_BLOCK_EXPLORER_BROWSER_URL: env.url("L2_BLOCK_EXPLORER_BROWSER_URL"),
      L1_BLOCK_EXPLORER_API_URL: `https://${env.string("L1_BLOCK_EXPLORER_API_HOST")}/api`,
      L2_BLOCK_EXPLORER_API_URL: `https://${env.string("L2_BLOCK_EXPLORER_API_HOST")}/api`,

      FORKING: networkType == NetworkType.Forked ? "true" : "false",

      L1_CHAIN_ID: env.string("L1_CHAIN_ID"),
      L2_CHAIN_ID: env.string("L2_CHAIN_ID"),

      L1_PRC_URL: env.url("L1_REMOTE_RPC_URL"),
      L2_PRC_URL: env.url("L2_REMOTE_RPC_URL"),

      L1_DEPLOYER_PRIVATE_KEY: env.string("DEPLOYER_PRIVATE_KEY"),
      L2_DEPLOYER_PRIVATE_KEY: env.string("DEPLOYER_PRIVATE_KEY"),

      // L1
      L1_CROSSDOMAIN_MESSENGER: l1Config.tokenBridge.messenger,
      L1_PROXY_ADMIN: l1Config.proxyAdmin,

      L1_NON_REBASABLE_TOKEN: l1Config.tokenBridge.l1NonRebasableToken,
      L1_REBASABLE_TOKEN: l1Config.tokenBridge.l1RebasableToken,
      ACCOUNTING_ORACLE: l1Config.tokenBridge.accountingOracle,
      L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE: l1Config.opStackTokenRatePusher.l2GasLimitForPushingTokenRate.toString(),

      L1_BRIDGE_ADMIN: l1Config.tokenBridge.bridgeAdmin,
      L1_DEPOSITS_ENABLED: l1Config.tokenBridge.depositsEnabled.toString(),
      L1_WITHDRAWALS_ENABLED: l1Config.tokenBridge.withdrawalsEnabled.toString(),
      L1_DEPOSITS_ENABLERS: formattedArray(l1Config.tokenBridge.depositsEnablers),
      L1_DEPOSITS_DISABLERS: formattedArray(l1Config.tokenBridge.depositsDisablers),
      L1_WITHDRAWALS_ENABLERS: formattedArray(l1Config.tokenBridge.withdrawalsEnablers),
      L1_WITHDRAWALS_DISABLERS: formattedArray(l1Config.tokenBridge.withdrawalsDisablers),

      // L2
      L2_CROSSDOMAIN_MESSENGER: l2Config.tokenBridge.messenger,
      L2_PROXY_ADMIN: govBridgeExecutor,

      TOKEN_RATE_ORACLE_ADMIN: govBridgeExecutor,
      TOKEN_RATE_UPDATE_ENABLED: l2Config.tokenRateOracle.updateEnabled.toString(),
      TOKEN_RATE_UPDATE_ENABLERS: formattedArray([
        ...l2Config.tokenRateOracle.updateEnablers,
        govBridgeExecutor,
      ]),
      TOKEN_RATE_UPDATE_DISABLERS: formattedArray([
        ...l2Config.tokenRateOracle.updateDisablers,
        govBridgeExecutor,
      ]),
      TOKEN_RATE_OUTDATED_DELAY: l2Config.tokenRateOracle.tokenRateOutdatedDelay.toString(),
      MAX_ALLOWED_L2_TO_L1_CLOCK_LAG: l2Config.tokenRateOracle.maxAllowedL2ToL1ClockLag.toString(),
      MAX_ALLOWED_TOKEN_RATE_DEVIATION_PER_DAY_BP: l2Config.tokenRateOracle.maxAllowedTokenRateDeviationPerDayBp.toString(),
      OLDEST_RATE_ALLOWED_IN_PAUSE_TIME_SPAN: l2Config.tokenRateOracle.oldestRateAllowedInPauseTimeSpan.toString(),
      MIN_TIME_BETWEEN_TOKEN_RATE_UPDATES: l2Config.tokenRateOracle.minTimeBetweenTokenRateUpdates.toString(),
      INITIAL_TOKEN_RATE_VALUE: l2Config.tokenRateOracle.initialTokenRateValue.toString(),
      INITIAL_TOKEN_RATE_L1_TIMESTAMP: l2Config.tokenRateOracle.initialTokenRateL1Timestamp.toString(),

      L2_TOKEN_NON_REBASABLE_NAME: l2Config.nonRebasableToken.name,
      L2_TOKEN_NON_REBASABLE_SYMBOL: l2Config.nonRebasableToken.symbol,
      L2_TOKEN_NON_REBASABLE_SIGNING_DOMAIN_VERSION: l2Config.nonRebasableToken.signingDomainVersion.toString(),

      L2_TOKEN_REBASABLE_NAME: l2Config.rebasableToken.name,
      L2_TOKEN_REBASABLE_SYMBOL: l2Config.rebasableToken.symbol,
      L2_TOKEN_REBASABLE_SIGNING_DOMAIN_VERSION: l2Config.rebasableToken.signingDomainVersion.toString(),

      L2_BRIDGE_ADMIN: govBridgeExecutor,
      L2_DEPOSITS_ENABLED: l2Config.tokenBridge.depositsEnabled.toString(),
      L2_WITHDRAWALS_ENABLED: l2Config.tokenBridge.withdrawalsEnabled.toString(),
      L2_DEPOSITS_ENABLERS: formattedArray([...l2Config.tokenBridge.depositsEnablers, govBridgeExecutor]),
      L2_DEPOSITS_DISABLERS: formattedArray([...l2Config.tokenBridge.depositsDisablers, govBridgeExecutor]),
      L2_WITHDRAWALS_ENABLERS: formattedArray([
        ...l2Config.tokenBridge.withdrawalsEnablers,
        govBridgeExecutor,
      ]),
      L2_WITHDRAWALS_DISABLERS: formattedArray([
        ...l2Config.tokenBridge.withdrawalsDisablers,
        govBridgeExecutor,
      ]),


      L2_DEPLOY_SKIP_PROMPTS: "1",
    },
    { override: true },
  );
}

function copyDeploymentArtifacts(originalDeployFileName: string, deployResultFileName: string) {
  const originalDeployFilePath = `./lido-l2-with-steth/${originalDeployFileName}`;
  cpSync(originalDeployFilePath, `./artifacts/${deployResultFileName}`);
}

export function copyArtifacts({deploymentResult, l1DeploymentArgs, l2DeploymentArgs} : {deploymentResult: string, l1DeploymentArgs: string, l2DeploymentArgs: string}) {
  copyDeploymentArtifacts("deployResult.json", deploymentResult);
  copyDeploymentArtifacts("l1DeployArgs.json", l1DeploymentArgs);
  copyDeploymentArtifacts("l2DeployArgs.json", l2DeploymentArgs);
}

export function configFromArtifacts(fileName: string) {
  const data = readFileSync(`./artifacts/${fileName}`, "utf8");
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
  }
}
