
import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import { createWriteStream } from "node:fs";

import { JsonRpcProvider } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { DeployParameters, MainConfig, TestingParameters } from "./config";
import {
  burnL2DeployerNonces,
  configFromArtifacts,
  copyArtifacts,
  populateDeployScriptEnvs,
  runDeployScript,
} from "./deploy-all-contracts";
import { addGovExecutorToDeploymentArtifacts, deployGovExecutor, saveGovExecutorDeploymentArgs } from "./deploy-gov-executor";
import { runDiffyscanScript, setupDiffyscan } from "./diffyscan";
import env from "./env";
import { runIntegrationTestsScript, setupIntegrationTests } from "./integration-tests";
import { LogCallback, LogType } from "./log-utils";
import { diffyscanRpcUrl, l1RpcUrl, l2RpcUrl, localL1RpcPort, localL2RpcPort, NetworkType } from "./rpc-utils";
import { runStateMateScript, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { runVerificationScript, setupGovExecutorVerification, waitForBlockFinalization } from "./verification";

const NUM_L1_DEPLOYED_CONTRACTS = 10;

export interface Context {
    l1ForkNode?: { process: child_process.ChildProcess; rpcUrl: string };
    l2ForkNode?: { process: child_process.ChildProcess; rpcUrl: string };
    mainConfig: MainConfig;
    mainConfigDoc: YAML.Document;
    deploymentConfig: DeployParameters;
    testingConfig: TestingParameters;
    govBridgeExecutorAddressOnFork?: string;
    govBridgeExecutor?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deployedContracts?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deployedContractsOnRealNetwork?: any;
  }
  
  export interface Step {
    name: string;
    action: (context: Context, logCallback: LogCallback) => Promise<void> | void;
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
          logCallback
        );
      }
    },
    {
      name: "Spawn L2 Fork Node",
      action: async (ctx, logCallback) => {
        ctx.l2ForkNode = await spawnNode(
          l2RpcUrl(NetworkType.Live),
          env.number("L2_CHAIN_ID"),
          localL2RpcPort(),
          "l2_fork_deployment_node.log",
          logCallback
        );
      }
    },
    {
      name: "Burn L2 Deployer Nonces",
      action: (_, logCallback) => burnL2DeployerNonces(l2RpcUrl(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS, logCallback)
    },
    {
      name: "Deploy Governance Executor",
      action: async (ctx, logCallback) => {
        ctx.govBridgeExecutorAddressOnFork = await deployGovExecutor(ctx.deploymentConfig, l2RpcUrl(NetworkType.Forked), logCallback);
        saveGovExecutorDeploymentArgs(ctx.govBridgeExecutorAddressOnFork, ctx.deploymentConfig, "l2_fork_gov_executor_deployment_args.json");
      }
    },
    {
      name: "Run Deploy Script",
      action: async (ctx, logCallback) => {
        if (ctx.govBridgeExecutorAddressOnFork === undefined) {
          throw Error("Gov executor wasn't deployed");
        }
        populateDeployScriptEnvs(ctx.deploymentConfig, ctx.govBridgeExecutorAddressOnFork, NetworkType.Forked);
        await runDeployScript({ scriptPath: "./scripts/optimism/deploy-bridge-without-notifier.ts", logCallback: logCallback });
        copyArtifacts({
          deploymentResult: "deployment_fork_result.json",
          l1DeploymentArgs: "l1_fork_deployment_args.json",
          l2DeploymentArgs: "l2_fork_deployment_args.json"
        });
        addGovExecutorToDeploymentArtifacts(ctx.govBridgeExecutorAddressOnFork, "deployment_fork_result.json");
        ctx.deployedContracts = configFromArtifacts("deployment_fork_result.json");
      }
    },
    {
      name: "State-Mate",
      action: async (ctx, logCallback) => {
        setupStateMateEnvs(l1RpcUrl(NetworkType.Forked), l2RpcUrl(NetworkType.Forked));
        setupStateMateConfig({
          seedConfigName: "state-mate-template.yaml",
          newConfigName: "state-mate-fork.yaml",
          newContractsCfg: ctx.deployedContracts,
          mainConfig: ctx.mainConfig,
          mainConfigDoc: ctx.mainConfigDoc,
          l2ChainId: env.number("L2_CHAIN_ID")
        });
        await runStateMateScript({ configName: "state-mate-fork.yaml", logCallback: logCallback });
      }
    },
    {
      name: "Run Integration Tests",
      action: async (ctx, logCallback) => {
        if (ctx.govBridgeExecutorAddressOnFork === undefined) {
          throw Error("Gov executor wasn't deployed");
        }
        setupIntegrationTests(ctx.testingConfig, ctx.govBridgeExecutorAddressOnFork, ctx.deployedContracts);
        await runIntegrationTestsScript({ testName: "bridging-non-rebasable.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "op-pusher-pushing-token-rate.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "optimism.integration.test.ts", logCallback: logCallback });
      }
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
      }
    }
  ];
  
  const deployAndVerifyOnRealNetworkSteps: Step[] = [
    {
      name: "Deploy Governance Executor",
      action: async (ctx, logCallback) => {
        ctx.govBridgeExecutor = await deployGovExecutor(ctx.deploymentConfig, l2RpcUrl(NetworkType.Live), logCallback);
        saveGovExecutorDeploymentArgs(ctx.govBridgeExecutor, ctx.deploymentConfig, "l2_live_gov_executor_deployment_args.json");
      }
    },
    {
      name: "Burn L2 Deployer Nonces",
      action: (_, logCallback) => burnL2DeployerNonces(l2RpcUrl(NetworkType.Live), NUM_L1_DEPLOYED_CONTRACTS, logCallback)
    },
    {
      name: "Run Deploy Script",
      action: async (ctx, logCallback) => {
        if (ctx.govBridgeExecutor === undefined) {
          throw Error("Gov executor wasn't deployed");
        }
        populateDeployScriptEnvs(ctx.deploymentConfig, ctx.govBridgeExecutor, NetworkType.Live);
        await runDeployScript({ scriptPath: "./scripts/optimism/deploy-bridge-without-notifier.ts", logCallback: logCallback });
        copyArtifacts({
          deploymentResult: "deployment_live_result.json",
          l1DeploymentArgs: "l1_live_deployment_args.json",
          l2DeploymentArgs: "l2_live_deployment_args.json"
        });
        addGovExecutorToDeploymentArtifacts(ctx.govBridgeExecutor, "deployment_live_result.json");
      }
    },
    {
      name: "Wait for Finalization",
      action: async(_, logCallback) => {
        const deployResult = configFromArtifacts("deployment_live_result.json");

        const l1LastBlockNumber = deployResult["ethereum"]["lastBlockNumber"];
        const l1Provider = new JsonRpcProvider(l1RpcUrl(NetworkType.Live));
        await waitForBlockFinalization(l1Provider, l1LastBlockNumber, logCallback);

        const l2Provider = new JsonRpcProvider(l2RpcUrl(NetworkType.Live));
        const l2LastBlockNumber = deployResult["optimism"]["lastBlockNumber"];
        await waitForBlockFinalization(l2Provider, l2LastBlockNumber, logCallback);
      }
    },
    {
      name: "Verififcation",
      action: async (_, logCallback) => {
        await runVerificationScript({
          config: "l1_live_deployment_args.json",
          network: "l1",
          workingDirectory: "./lido-l2-with-steth",
          rpcUrl: l1RpcUrl(NetworkType.Live),
          logCallback: logCallback
        });
        await runVerificationScript({
          config: "l2_live_deployment_args.json",
          network: "l2",
          workingDirectory: "./lido-l2-with-steth",
          rpcUrl: l2RpcUrl(NetworkType.Live), 
          logCallback: logCallback
        });
        setupGovExecutorVerification();
        await runVerificationScript({
          config: "l2_live_gov_executor_deployment_args.json",
          network: "l2",
          workingDirectory: "./governance-crosschain-bridges",
          rpcUrl: l2RpcUrl(NetworkType.Live), 
          logCallback: logCallback
        });
      }
    }
  ];

  const testDeployedOnRealNetworkSteps: Step[] = [
    {
      name: "State-mate",
      action: async (ctx, logCallback) => {
        ctx.deployedContractsOnRealNetwork = configFromArtifacts("deployment_live_result.json");
        setupStateMateEnvs(l1RpcUrl(NetworkType.Live), l2RpcUrl(NetworkType.Live));
        setupStateMateConfig({
          seedConfigName: "state-mate-template.yaml",
          newConfigName: "state-mate-live.yaml",
          newContractsCfg: ctx.deployedContractsOnRealNetwork,
          mainConfig: ctx.mainConfig,
          mainConfigDoc: ctx.mainConfigDoc,
          l2ChainId: env.number("L2_CHAIN_ID")
        });
        await runStateMateScript({ configName: "state-mate-live.yaml", logCallback: logCallback });
      }
    },
    {
      name: "Diffyscan",
      action: async (ctx, logCallback) => {
        setupDiffyscan(
          ctx.deployedContractsOnRealNetwork,
          ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"],
          ctx.deploymentConfig,
          l1RpcUrl(NetworkType.Live),
          diffyscanRpcUrl(),
          env.string("L1_CHAIN_ID")
        );
        await runDiffyscanScript({ config: "diffyscan_config_L1.json", withBinaryComparison: true, logCallback: logCallback });
      
        setupDiffyscan(
          ctx.deployedContractsOnRealNetwork,
          ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"],
          ctx.deploymentConfig,
          l2RpcUrl(NetworkType.Live),
          diffyscanRpcUrl(),
          env.string("L2_CHAIN_ID")
        );
        await runDiffyscanScript({ config: "diffyscan_config_L2_gov.json", withBinaryComparison: true, logCallback: logCallback });
        await runDiffyscanScript({ config: "diffyscan_config_L2.json", withBinaryComparison: true, logCallback: logCallback });
      }
    },
    {
      name: "Integration tests",
      action: async (ctx, logCallback) => {
        const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Live), env.number("L1_CHAIN_ID"), localL1RpcPort(), "l1_live_deployment_node.log", logCallback);
        const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Live), env.number("L2_CHAIN_ID"), localL2RpcPort(), "l2_live_deployment_node.log", logCallback);
      
        populateDeployScriptEnvs(ctx.deploymentConfig, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], NetworkType.Live);
        setupIntegrationTests(ctx.testingConfig, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], ctx.deployedContractsOnRealNetwork);
        await runIntegrationTestsScript({ testName: "bridging-non-rebasable.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "op-pusher-pushing-token-rate.integration.test.ts", logCallback: logCallback });
        await runIntegrationTestsScript({ testName: "optimism.integration.test.ts", logCallback: logCallback });
      
        l1ForkNode.process.kill();
        l2ForkNode.process.kill();
      }
    }
  ];
  
  export function getSteps(onlyForkDeploy: boolean, onlyCheck: boolean) {
    if (onlyForkDeploy) {
      return deployAndTestOnForksSteps;
    }
    if (onlyCheck) {
      return testDeployedOnRealNetworkSteps;
    }
    return [...deployAndTestOnForksSteps, ...deployAndVerifyOnRealNetworkSteps, ...testDeployedOnRealNetworkSteps];
  }
  
async function spawnNode(
    rpcForkUrl: string,
    chainId: number,
    port: number,
    outputFileName: string,
    logCallback: LogCallback
  ): Promise<{ process: child_process.ChildProcess; rpcUrl: string }> {
    const nodeCmd = "anvil";
    const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`, "--no-storage-caching", "--chain-id", `${chainId}`];
  
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
  