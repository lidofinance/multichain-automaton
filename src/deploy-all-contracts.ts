import { cpSync } from "node:fs";
import process from "node:process";

import dotenv from "dotenv";
import { ethers } from "ethers";

import { runCommand } from "./command-utils";
import { DeploymentArtifacts, loadDeploymentArtifacts, saveDeployArtifacts } from "./deployment-artifacts";
import env from "./env";
import { LogCallback, LogType } from "./log-utils";
import { DeployParameters } from "./main-config";
import { NetworkType } from "./rpc-utils";

const WAIT_TX_TIMEOUT = 30_000;

async function burnL2DeployerNonces(l2RpcUrl: string, numNonces: number, logCallback: LogCallback) {
  const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl);
  const l2Deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, l2Provider);
  const l2DeployerAddress = await l2Deployer.getAddress();
  const feeData = await l2Provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits("1500000", "wei");
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("1000000", "wei");

  logCallback(
    `Burning ${numNonces} nonces from L2 deployer ${l2DeployerAddress} to prevent L1 and L2 addresses collision...`,
    LogType.Level1,
  );

  for (let nonceIndex = 0; nonceIndex < numNonces; nonceIndex++) {
    const MAX_TRIES = 3;
    let numTries = MAX_TRIES;
    while (true) {
      try {
        const tryNum = MAX_TRIES - numTries + 1;
        logCallback(
          `Burning ${nonceIndex} tx, try num: ${tryNum} maxFeePerGas: ${maxFeePerGas} maxPriorityFeePerGas:${maxPriorityFeePerGas}`,
          LogType.Level1,
        );
        const nonce = await l2Provider.getTransactionCount(l2Deployer.address);
        const tx = await waitWithTimeout(
          l2Deployer.sendTransaction({
            to: l2DeployerAddress,
            value: 0,
            maxPriorityFeePerGas: maxPriorityFeePerGas * retryGasFactor(tryNum),
            maxFeePerGas: (maxFeePerGas + maxPriorityFeePerGas) * retryGasFactor(tryNum),
            nonce: nonce,
          }),
          WAIT_TX_TIMEOUT,
        );
        await waitWithTimeout(tx.wait(), WAIT_TX_TIMEOUT);
        break;
      } catch (error) {
        if (--numTries == 0) throw error;
      }
    }
  }

  function retryGasFactor(tryNum: number): bigint {
    return BigInt(Math.pow(2, tryNum - 1));
  }

  async function waitWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    errorMessage: string = "Operation timeout",
  ): Promise<T> {
    return Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeout)),
    ]);
  }
}

async function runDeployScript({
  scriptPath,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  logCallback,
}: {
  scriptPath: string;
  environment?: NodeJS.ProcessEnv;
  throwOnFail?: boolean;
  tryNumber?: number;
  maxTries?: number;
  logCallback: LogCallback;
}) {
  await runCommand({
    command: "ts-node",
    args: ["--files", scriptPath],
    workingDirectory: "./lido-l2-with-steth",
    environment: process.env,
    throwOnFail,
    tryNumber,
    maxTries,
    logCallback: logCallback,
  });
}

function populateDeployScriptEnvs({
  deploymentConfig,
  deploymentResultsFilename,
  networkType,
}: {
  deploymentConfig: DeployParameters,
  deploymentResultsFilename: string,
  networkType: NetworkType,
}) {
  function formattedArray(configArray: Array<string>) {
    return `[${configArray.map((ts: string) => `"${ts.toString()}"`)}]`;
  }
  const l1Config = deploymentConfig.l1;
  const l2Config = deploymentConfig.l2;

  const deployedContracts = loadDeploymentArtifacts({fileName: deploymentResultsFilename});
  const govBridgeExecutor = deployedContracts.l2.govBridgeExecutor;

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
      TOKEN_RATE_UPDATE_ENABLERS: formattedArray([...l2Config.tokenRateOracle.updateEnablers, govBridgeExecutor]),
      TOKEN_RATE_UPDATE_DISABLERS: formattedArray([...l2Config.tokenRateOracle.updateDisablers, govBridgeExecutor]),
      TOKEN_RATE_OUTDATED_DELAY: l2Config.tokenRateOracle.tokenRateOutdatedDelay.toString(),
      MAX_ALLOWED_L2_TO_L1_CLOCK_LAG: l2Config.tokenRateOracle.maxAllowedL2ToL1ClockLag.toString(),
      MAX_ALLOWED_TOKEN_RATE_DEVIATION_PER_DAY_BP:
        l2Config.tokenRateOracle.maxAllowedTokenRateDeviationPerDayBp.toString(),
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
      L2_WITHDRAWALS_ENABLERS: formattedArray([...l2Config.tokenBridge.withdrawalsEnablers, govBridgeExecutor]),
      L2_WITHDRAWALS_DISABLERS: formattedArray([...l2Config.tokenBridge.withdrawalsDisablers, govBridgeExecutor]),

      L2_DEPLOY_SKIP_PROMPTS: "1",
    },
    { override: true },
  );
}

function copyDeploymentArtifacts({
  originalDeploymentFileName,
  deployResultFileName,
}: {
  originalDeploymentFileName: string;
  deployResultFileName: string;
}) {
  const originalDeployFilePath = `./lido-l2-with-steth/${originalDeploymentFileName}`;
  cpSync(originalDeployFilePath, `./artifacts/${deployResultFileName}`);
}

function copyAndMergeArtifacts({
  originalDeploymentFileName,
  deploymentResultFileName,
}: {
  originalDeploymentFileName: string;
  deploymentResultFileName: string;
}) {
  const deploymentResultWithoutGovExecutor = loadDeploymentArtifacts({fileName: originalDeploymentFileName, folder: "./lido-l2-with-steth"});
  const deploymentResult = loadDeploymentArtifacts({fileName: deploymentResultFileName});
  const mappedDeploymentResult = mappedFromOriginalDeploymentArtifacts(deploymentResultWithoutGovExecutor);
  mappedDeploymentResult.l2.govBridgeExecutor = deploymentResult["l2"]["govBridgeExecutor"];
  saveDeployArtifacts(mappedDeploymentResult, deploymentResultFileName);
}

function mappedFromOriginalDeploymentArtifacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalDeploymentArtifacts: any
): DeploymentArtifacts {
  return {
    l1: {
      bridgeImplAddress: originalDeploymentArtifacts["ethereum"]["bridgeImplAddress"],
      bridgeProxyAddress: originalDeploymentArtifacts["ethereum"]["bridgeProxyAddress"],
      opStackTokenRatePusherImplAddress: originalDeploymentArtifacts["ethereum"]["opStackTokenRatePusherImplAddress"],
      lastBlockNumber: originalDeploymentArtifacts["ethereum"]["lastBlockNumber"],
    },
    l2: {
      govBridgeExecutor: originalDeploymentArtifacts["optimism"]["govBridgeExecutor"],
      tokenImplAddress: originalDeploymentArtifacts["optimism"]["tokenImplAddress"],
      tokenProxyAddress: originalDeploymentArtifacts["optimism"]["tokenProxyAddress"],
      tokenRebasableImplAddress: originalDeploymentArtifacts["optimism"]["tokenRebasableImplAddress"],
      tokenRebasableProxyAddress: originalDeploymentArtifacts["optimism"]["tokenRebasableProxyAddress"],
      tokenBridgeImplAddress: originalDeploymentArtifacts["optimism"]["tokenBridgeImplAddress"],
      tokenBridgeProxyAddress: originalDeploymentArtifacts["optimism"]["tokenBridgeProxyAddress"],
      tokenRateOracleImplAddress: originalDeploymentArtifacts["optimism"]["tokenRateOracleImplAddress"],
      tokenRateOracleProxyAddress: originalDeploymentArtifacts["optimism"]["tokenRateOracleProxyAddress"],
      lastBlockNumber: originalDeploymentArtifacts["optimism"]["lastBlockNumber"],
    },
  };
}

export {
  burnL2DeployerNonces,
  runDeployScript,
  populateDeployScriptEnvs,
  copyDeploymentArtifacts,
  copyAndMergeArtifacts
}