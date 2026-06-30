import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import { createWriteStream } from "node:fs";

import { JsonRpcProvider } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { checkAddressesContractStatus } from "./block-explorer";
import {
  burnL2DeployerNonces,
  copyAndMergeArtifacts,
  copyDeploymentArtifacts,
  populateDeployScriptEnvs,
  runDeployScript,
} from "./deploy-all-contracts";
import {
  deployGovExecutor,
  saveGovExecutorDeploymentArgs,
  saveGovExecutorToDeploymentArtifacts,
} from "./deploy-gov-executor";
import { loadDeploymentArtifacts } from "./deployment-artifacts";
import { runDiffyscanScript, setupDiffyscan } from "./diffyscan";
import env from "./env";
import { runIntegrationTestsScript, setupIntegrationTests } from "./integration-tests";
import { LogCallback, LogType } from "./log-utils";
import { DeployParameters, MainConfig, TestingParameters } from "./main-config";
import { diffyscanRpcUrl, l1RpcUrl, l2RpcUrl, localL1RpcPort, localL2RpcPort, NetworkType } from "./rpc-utils";
import { runStateMateScript, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { runVerificationScript, setupGovExecutorVerification, setupHardhatConfigInL2Repo } from "./verification";

const NUM_L1_DEPLOYED_CONTRACTS = 10;

interface Context {
  l1ForkNode?: { process: child_process.ChildProcess; rpcUrl: string };
  l2ForkNode?: { process: child_process.ChildProcess; rpcUrl: string };
  readonly mainConfig: MainConfig;
  readonly mainConfigDoc: YAML.Document;
  readonly deploymentConfig: DeployParameters;
  readonly testingConfig: TestingParameters;
}

interface Step {
  name: string;
  action: (context: Context, logCallback: LogCallback) => Promise<void> | void;
}

enum DeployAction {
  Fork = "fork",                       // Deploy and test on fork
  Deploy = "deploy",                   // Deploy on real network
  PublishSources = "publish-sources",  // Publish sources on live network
  Check = "check"                      // Check real network deployment
}

function getSteps(actions: DeployAction[]): Step[] {
  const steps: Step[] = [];
  
  if (actions.includes(DeployAction.Fork)) {
    steps.push(...deployAndTestOnForksSteps);
  }
  
  if (actions.includes(DeployAction.Deploy)) {
    steps.push(...deployOnRealNetworkSteps);
  }
  
  if (actions.includes(DeployAction.PublishSources)) {
    steps.push(...publishSourcesSteps);
  }
  
  if (actions.includes(DeployAction.Check)) {
    steps.push(...testDeployedOnRealNetworkSteps);
  }
  
  return steps;
}

const deployAndTestOnForksSteps: Step[] = [
  {
    name: "Spawn L1 Fork Node",
    action: async (ctx, logCallback) => {
      ctx.l1ForkNode = await spawnNode(
        l1RpcUrl(NetworkType.Live),
        env.number("L1_CHAIN_ID"),
        localL1RpcPort(),
        "l1_fork_deployment_node.log",
        logCallback,
      );
    },
  },
  {
    name: "Spawn L2 Fork Node",
    action: async (ctx, logCallback) => {
      ctx.l2ForkNode = await spawnNode(
        l2RpcUrl(NetworkType.Live),
        env.number("L2_CHAIN_ID"),
        localL2RpcPort(),
        "l2_fork_deployment_node.log",
        logCallback,
      );
    },
  },
  {
    name: "Burn L2 Deployer Nonces",
    action: (_, logCallback) =>
      burnL2DeployerNonces(l2RpcUrl(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS, logCallback),
  },
  {
    name: "Deploy Governance Executor",
    action: async (ctx, logCallback) => {
      const govBridgeExecutor = await deployGovExecutor(
        ctx.deploymentConfig,
        l2RpcUrl(NetworkType.Forked),
        logCallback,
      );
      saveGovExecutorDeploymentArgs({
        contractAddress: govBridgeExecutor,
        deploymentConfig: ctx.deploymentConfig,
        fileName: "l2_fork_gov_executor_deployment_args.json",
      });
      saveGovExecutorToDeploymentArtifacts({
        govBridgeExecutor,
        deploymentResultsFilename: "deployment_fork_result.json",
      });
    },
  },
  {
    name: "Run Deploy Script",
    action: async (ctx, logCallback) => {
      populateDeployScriptEnvs({
        deploymentConfig: ctx.deploymentConfig,
        deploymentResultsFilename: "deployment_fork_result.json",
        networkType: NetworkType.Forked
      });
      await runDeployScript({
        scriptPath: "./scripts/optimism/deploy-bridge-without-notifier.ts",
        logCallback: logCallback,
      });
      copyAndMergeArtifacts({
        originalDeploymentFileName: "deployResult.json",
        deploymentResultFileName: "deployment_fork_result.json",
      });
      copyDeploymentArtifacts({
        originalDeploymentFileName: "l1DeployArgs.json",
        deployResultFileName: "l1_fork_deployment_args.json",
      });
      copyDeploymentArtifacts({
        originalDeploymentFileName: "l2DeployArgs.json",
        deployResultFileName: "l2_fork_deployment_args.json",
      });
    },
  },
  {
    name: "State-Mate",
    action: async (ctx, logCallback) => {
      setupStateMateEnvs(l1RpcUrl(NetworkType.Forked), l2RpcUrl(NetworkType.Forked));
      setupStateMateConfig({
        seedConfigName: "state-mate-template.yaml",
        newConfigName: "state-mate-fork.yaml",
        deploymentResultsFilename: "deployment_fork_result.json",
        mainConfig: ctx.mainConfig,
        mainConfigDoc: ctx.mainConfigDoc,
        l2ChainId: env.number("L2_CHAIN_ID"),
      });
      await runStateMateScript({ configName: "state-mate-fork.yaml", logCallback: logCallback });
    },
  },
  {
    name: "Run Integration Tests",
    action: async (ctx, logCallback) => {
      setupIntegrationTests({
        testingParameters: ctx.testingConfig,
        deploymentResultsFilename: "deployment_fork_result.json"
      });
      await runIntegrationTestsScript({
        testName: "bridging-non-rebasable.integration.test.ts",
        logCallback: logCallback,
      });
      await runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts", logCallback: logCallback });
      await runIntegrationTestsScript({
        testName: "op-pusher-pushing-token-rate.integration.test.ts",
        logCallback: logCallback,
      });
      await runIntegrationTestsScript({ testName: "optimism.integration.test.ts", logCallback: logCallback });
    },
  },
  {
    name: "Kill forks",
    action: (ctx) => {
      if (ctx.l1ForkNode !== undefined) {
        ctx.l1ForkNode.process.kill();
      }
      if (ctx.l2ForkNode !== undefined) {
        ctx.l2ForkNode.process.kill();
      }
    },
  },
];

const deployOnRealNetworkSteps: Step[] = [
  {
    name: "Burn L2 Deployer Nonces",
    action: (_, logCallback) =>
      burnL2DeployerNonces(l2RpcUrl(NetworkType.Live), NUM_L1_DEPLOYED_CONTRACTS, logCallback),
  },
  {
    name: "Deploy Governance Executor",
    action: async (ctx, logCallback) => {
      const govBridgeExecutor = await deployGovExecutor(
        ctx.deploymentConfig,
        l2RpcUrl(NetworkType.Live),
        logCallback,
      );
      saveGovExecutorDeploymentArgs({
        contractAddress: govBridgeExecutor,
        deploymentConfig: ctx.deploymentConfig,
        fileName: "l2_live_gov_executor_deployment_args.json",
      });
      saveGovExecutorToDeploymentArtifacts({
        govBridgeExecutor,
        deploymentResultsFilename: "deployment_live_result.json",
      });
    },
  },
  {
    name: "Run Deploy Script",
    action: async (ctx, logCallback) => {
      populateDeployScriptEnvs({
        deploymentConfig: ctx.deploymentConfig,
        deploymentResultsFilename: "deployment_live_result.json",
        networkType: NetworkType.Live
      });
      await runDeployScript({
        scriptPath: "./scripts/optimism/deploy-bridge-without-notifier.ts",
        logCallback: logCallback,
      });
      copyAndMergeArtifacts({
        originalDeploymentFileName: "deployResult.json",
        deploymentResultFileName: "deployment_live_result.json",
      });
      copyDeploymentArtifacts({
        originalDeploymentFileName: "l1DeployArgs.json",
        deployResultFileName: "l1_live_deployment_args.json",
      });
      copyDeploymentArtifacts({
        originalDeploymentFileName: "l2DeployArgs.json",
        deployResultFileName: "l2_live_deployment_args.json",
      });
    },
  }
];

const publishSourcesSteps: Step[] = [
  {
    name: "Wait for Block Explorer to Confirm Address as Contract",
    action: async (_, logCallback) => {
      await checkAddressesContractStatus({
        configWihAddresses: "l1_live_deployment_args.json",
        endpoint: `https://${env.string("L1_BLOCK_EXPLORER_API_HOST")}/api`,
        apiKey: env.string("L1_EXPLORER_TOKEN"),
        maxTries: 5,
        checkInterval: 2000,
        logCallback: logCallback
      });
      await checkAddressesContractStatus({
        configWihAddresses: "l2_live_deployment_args.json",
        endpoint: `https://${env.string("L2_BLOCK_EXPLORER_API_HOST")}/api`,
        apiKey: env.string("L2_EXPLORER_TOKEN"),
        maxTries: 5,
        checkInterval: 2000,
        logCallback: logCallback
      });
      await checkAddressesContractStatus({
        configWihAddresses: "l2_live_gov_executor_deployment_args.json",
        endpoint: `https://${env.string("L2_BLOCK_EXPLORER_API_HOST")}/api`,
        apiKey: env.string("L2_EXPLORER_TOKEN"),
        maxTries: 5,
        checkInterval: 2000,
        logCallback: logCallback
      });
    },
  },
  {
    name: "Verification",
    action: async (_, logCallback) => {
      setupHardhatConfigInL2Repo();
      await runVerificationScript({
        config: "l1_live_deployment_args.json",
        network: "l1",
        workingDirectory: "./lido-l2-with-steth",
        rpcUrl: l1RpcUrl(NetworkType.Live),
        logCallback: logCallback,
      });
      await runVerificationScript({
        config: "l2_live_deployment_args.json",
        network: "l2",
        workingDirectory: "./lido-l2-with-steth",
        rpcUrl: l2RpcUrl(NetworkType.Live),
        logCallback: logCallback,
      });
      setupGovExecutorVerification();
      await runVerificationScript({
        config: "l2_live_gov_executor_deployment_args.json",
        network: "l2",
        workingDirectory: "./governance-crosschain-bridges",
        rpcUrl: l2RpcUrl(NetworkType.Live),
        logCallback: logCallback,
      });
    },
  }
];

const testDeployedOnRealNetworkSteps: Step[] = [
  {
    name: "State-mate",
    action: async (ctx, logCallback) => {
      setupStateMateEnvs(l1RpcUrl(NetworkType.Live), l2RpcUrl(NetworkType.Live));
      setupStateMateConfig({
        seedConfigName: "state-mate-template.yaml",
        newConfigName: "state-mate-live.yaml",
        deploymentResultsFilename: "deployment_live_result.json",
        mainConfig: ctx.mainConfig,
        mainConfigDoc: ctx.mainConfigDoc,
        l2ChainId: env.number("L2_CHAIN_ID"),
      });
      await runStateMateScript({ configName: "state-mate-live.yaml", logCallback: logCallback });
    },
  },
  {
    name: "Diffyscan",
    action: async (ctx, logCallback) => {
      setupDiffyscan({
        deploymentResultsFilename: "deployment_live_result.json",
        deploymentConfig: ctx.deploymentConfig,
        remoteRpcUrl: l1RpcUrl(NetworkType.Live),
        localRpcUrl: diffyscanRpcUrl(),
        chainID: env.string("L1_CHAIN_ID"),
      });
      await runDiffyscanScript({
        config: "diffyscan_config_L1.json",
        withBinaryComparison: true,
        logCallback: logCallback,
      });

      setupDiffyscan({
        deploymentResultsFilename: "deployment_live_result.json",
        deploymentConfig: ctx.deploymentConfig,
        remoteRpcUrl: l2RpcUrl(NetworkType.Live),
        localRpcUrl: diffyscanRpcUrl(),
        chainID: env.string("L2_CHAIN_ID"),
      });
      await runDiffyscanScript({
        config: "diffyscan_config_L2_gov.json",
        withBinaryComparison: true,
        logCallback: logCallback,
      });
      await runDiffyscanScript({
        config: "diffyscan_config_L2.json",
        withBinaryComparison: true,
        logCallback: logCallback,
      });
    },
  },
  {
    name: "Integration tests",
    action: async (ctx, logCallback) => {
      const deployedContractsOnRealNetwork = loadDeploymentArtifacts({fileName: "deployment_live_result.json"});
      const l1LastBlockNumber = deployedContractsOnRealNetwork.l1.lastBlockNumber;
      const l2LastBlockNumber = deployedContractsOnRealNetwork.l2.lastBlockNumber;

      const l1ForkNode = await spawnNode(
        l1RpcUrl(NetworkType.Live),
        env.number("L1_CHAIN_ID"),
        localL1RpcPort(),
        "l1_live_deployment_node.log",
        logCallback,
        l1LastBlockNumber
      );
      const l2ForkNode = await spawnNode(
        l2RpcUrl(NetworkType.Live),
        env.number("L2_CHAIN_ID"),
        localL2RpcPort(),
        "l2_live_deployment_node.log",
        logCallback,
        l2LastBlockNumber
      );

      populateDeployScriptEnvs({
        deploymentConfig: ctx.deploymentConfig,
        deploymentResultsFilename: "deployment_live_result.json",
        networkType: NetworkType.Live,
      });
      setupIntegrationTests({
        testingParameters: ctx.testingConfig,
        deploymentResultsFilename: "deployment_live_result.json",
      });
      await runIntegrationTestsScript({
        testName: "bridging-non-rebasable.integration.test.ts",
        logCallback: logCallback,
      });
      await runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts", logCallback: logCallback });
      await runIntegrationTestsScript({
        testName: "op-pusher-pushing-token-rate.integration.test.ts",
        logCallback: logCallback,
      });
      await runIntegrationTestsScript({ testName: "optimism.integration.test.ts", logCallback: logCallback });

      l1ForkNode.process.kill();
      l2ForkNode.process.kill();
    },
  },
];

async function spawnNode(
  rpcForkUrl: string,
  chainId: number,
  port: number,
  outputFileName: string,
  logCallback: LogCallback,
  forkBlock?: number,
): Promise<{ process: child_process.ChildProcess; rpcUrl: string }> {
  const nodeCmd = "anvil";
  const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`, "--no-storage-caching", "--chain-id", `${chainId}`];
  if (forkBlock !== undefined) {
    nodeArgs.push("--fork-block-number", `${forkBlock}`);
  }
  
  const output = createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, "open");

  const processInstance = child_process.spawn(nodeCmd, nodeArgs, { stdio: ["ignore", output, output] });

  logCallback(`Spawning test node: ${nodeCmd} ${nodeArgs.join(" ")}. Waiting 5 seconds ...`, LogType.Level1);
  await new Promise((r) => setTimeout(r, 5000));

  const localhost = `http://localhost:${port}`;
  const provider = new JsonRpcProvider(localhost);
  let rpcError: Error | undefined = undefined;
  for (let attempt = 0; attempt < 30; ++attempt) {
    assert(processInstance);
    assert(processInstance.exitCode === null);
    try {
      await provider.getBlock("latest"); // check RPC is healthy
      rpcError = undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 1000));
      rpcError = e;
    }
  }
  if (rpcError !== undefined) {
    throw rpcError;
  }

  logCallback(`Spawned test node: ${nodeCmd} ${nodeArgs.join(" ")}`, LogType.Level1);
  return { process: processInstance, rpcUrl: rpcForkUrl };
}

export {
  Context,
  Step,
  DeployAction,
  getSteps
}
