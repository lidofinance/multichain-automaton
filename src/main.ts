import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { program } from "commander";
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
import { diffyscanRpcUrl, l1RpcUrl, l2RpcUrl, localL1RpcPort, localL2RpcPort, NetworkType } from "./rpc-utils";
import { runStateMateScript, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { runVerificationScript, setupGovExecutorVerification } from "./verification";

const NUM_L1_DEPLOYED_CONTRACTS = 3;

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--onlyCheck", "only check the real network deployment")
    .option("--onlyForkDeploy", "only deploy to the forked network")
    .parse();

  const configPath = program.args[0];
  return {
    configPath,
    onlyCheck: program.getOptionValue("onlyCheck"),
    onlyForkDeploy: program.getOptionValue("onlyForkDeploy"),
  };
}

interface Context {
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

interface Step {
  name: string;
  action: (context: Context) => Promise<void> | void;
}

const deployAndTestOnForksSteps: Step[] = [
  {
    name: "Spawn L1 Fork Node",
    action: async (ctx) => {
      ctx.l1ForkNode = await spawnNode(
        l1RpcUrl(NetworkType.Real),
        env.number("L1_CHAIN_ID"),
        localL1RpcPort(),
        "l1ForkOutput.txt"
      );
    }
  },
  {
    name: "Spawn L2 Fork Node",
    action: async (ctx) => {
      ctx.l2ForkNode = await spawnNode(
        l2RpcUrl(NetworkType.Real),
        env.number("L2_CHAIN_ID"),
        localL2RpcPort(),
        "l2ForkOutput.txt"
      );
    }
  },
  {
    name: "Burn L2 Deployer Nonces",
    action: () => burnL2DeployerNonces(l2RpcUrl(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS)
  },
  {
    name: "Deploy Governance Executor",
    action: async (ctx) => {
      ctx.govBridgeExecutorAddressOnFork = await deployGovExecutor(ctx.deploymentConfig, l2RpcUrl(NetworkType.Forked));
      saveGovExecutorDeploymentArgs(ctx.govBridgeExecutorAddressOnFork, ctx.deploymentConfig, "l2GovExecutorDeployArgsForked.json");
    }
  },
  {
    name: "Run Deploy Script",
    action: (ctx) => {
      if (ctx.govBridgeExecutorAddressOnFork === undefined) {
        throw Error("Gov executor wasn't deployed");
      }
      populateDeployScriptEnvs(ctx.deploymentConfig, ctx.govBridgeExecutorAddressOnFork, NetworkType.Forked);
      runDeployScript({ scriptPath: "./scripts/optimism/deploy-automaton.ts" });
      copyArtifacts({
        deploymentResult: "deploymentResultForkedNetwork.json",
        l1DeploymentArgs: "l1DeploymentArgsForked.json",
        l2DeploymentArgs: "l2DeploymentArgsForked.json"
      });
      addGovExecutorToDeploymentArtifacts(ctx.govBridgeExecutorAddressOnFork, "deploymentResultForkedNetwork.json");
      ctx.deployedContracts = configFromArtifacts("deploymentResultForkedNetwork.json");
    }
  },
  {
    name: "State-Mate",
    action: (ctx) => {
      setupStateMateEnvs(l1RpcUrl(NetworkType.Forked), l2RpcUrl(NetworkType.Forked));
      setupStateMateConfig("automaton.yaml", ctx.deployedContracts, ctx.mainConfig, ctx.mainConfigDoc, env.number("L2_CHAIN_ID"));
      runStateMateScript({ configName: "automaton.yaml" });
    }
  },
  {
    name: "Run Integration Tests",
    action: (ctx) => {
      if (ctx.govBridgeExecutorAddressOnFork === undefined) {
        throw Error("Gov executor wasn't deployed");
      }
      setupIntegrationTests(ctx.testingConfig, ctx.govBridgeExecutorAddressOnFork, ctx.deployedContracts);
      runIntegrationTestsScript({ testName: "bridging-non-rebasable.integration.test.ts" });
      runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts" });
      runIntegrationTestsScript({ testName: "op-pusher-pushing-token-rate.integration.test.ts" });
      runIntegrationTestsScript({ testName: "optimism.integration.test.ts" });
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
    name: "Burn L2 Deployer Nonces",
    action: () => burnL2DeployerNonces(l2RpcUrl(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS)
  },
  {
    name: "Deploy Governance Executor",
    action: async (ctx) => {
      ctx.govBridgeExecutor = await deployGovExecutor(ctx.deploymentConfig, l2RpcUrl(NetworkType.Real));
      saveGovExecutorDeploymentArgs(ctx.govBridgeExecutor, ctx.deploymentConfig, "l2GovExecutorDeployArgs.json");
    }
  },
  {
    name: "Run Deploy Script",
    action: (ctx) => {
      if (ctx.govBridgeExecutor === undefined) {
        throw Error("Gov executor wasn't deployed");
      }
      populateDeployScriptEnvs(ctx.deploymentConfig, ctx.govBridgeExecutor, NetworkType.Real);
      runDeployScript({ scriptPath: "./scripts/optimism/deploy-automaton.ts" });
      copyArtifacts({
        deploymentResult: "deploymentResultRealNetwork.json",
        l1DeploymentArgs: "l1DeploymentArgs.json",
        l2DeploymentArgs: "l2DeploymentArgs.json"
      });
      addGovExecutorToDeploymentArtifacts(ctx.govBridgeExecutor, "deploymentResultRealNetwork.json");
    }
  },
  {
    name: "Verififcation",
    action: () => {
      runVerificationScript({ config: "l1DeploymentArgs.json", network: "l1", workingDirectory: "./lido-l2-with-steth" });
      runVerificationScript({ config: "l2DeploymentArgs.json", network: "l2", workingDirectory: "./lido-l2-with-steth" });
      setupGovExecutorVerification();
      runVerificationScript({ config: "l2GovExecutorDeployArgs.json", network: "l2", workingDirectory: "./governance-crosschain-bridges" });
    }
  }
];

const testDeployedOnRealNetworkSteps: Step[] = [
  {
    name: "State-mate",
    action: (ctx) => {
      ctx.deployedContractsOnRealNetwork = configFromArtifacts("deploymentResultRealNetwork.json");

      setupStateMateEnvs(l1RpcUrl(NetworkType.Real), l2RpcUrl(NetworkType.Real));
      setupStateMateConfig("automaton.yaml", ctx.deployedContractsOnRealNetwork, ctx.mainConfig, ctx.mainConfigDoc, env.number("L2_CHAIN_ID"));
      runStateMateScript({ configName: "automaton.yaml" });
    }
  },
  {
    name: "Diffyscan",
    action: (ctx) => {
      setupDiffyscan(ctx.deployedContractsOnRealNetwork, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], ctx.deploymentConfig, l1RpcUrl(NetworkType.Real), diffyscanRpcUrl(), env.string("L1_CHAIN_ID"));
      runDiffyscanScript({ config: "automaton_config_L1.json", withBinaryComparison: true });
    
      setupDiffyscan(ctx.deployedContractsOnRealNetwork, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], ctx.deploymentConfig, l2RpcUrl(NetworkType.Real), diffyscanRpcUrl(), env.string("L2_CHAIN_ID"));
      runDiffyscanScript({ config: "automaton_config_L2_gov.json", withBinaryComparison: true });
      runDiffyscanScript({ config: "automaton_config_L2.json", withBinaryComparison: true });
    }
  },
  {
    name: "Integration tests",
    action: async (ctx) => {
      const l1ForkNode = await spawnNode(l1RpcUrl(NetworkType.Real), env.number("L1_CHAIN_ID"), localL1RpcPort(), "l1ForkAfterDeployOutput.txt");
      const l2ForkNode = await spawnNode(l2RpcUrl(NetworkType.Real), env.number("L2_CHAIN_ID"), localL2RpcPort(), "l2ForkAfterDeployOutput.txt");
    
      populateDeployScriptEnvs(ctx.deploymentConfig, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], NetworkType.Real);
      setupIntegrationTests(ctx.testingConfig, ctx.deployedContractsOnRealNetwork["optimism"]["govBridgeExecutor"], ctx.deployedContractsOnRealNetwork);
      runIntegrationTestsScript({ testName: "bridging-non-rebasable.integration.test.ts" });
      runIntegrationTestsScript({ testName: "bridging-rebasable.integration.test.ts" });
      runIntegrationTestsScript({ testName: "op-pusher-pushing-token-rate.integration.test.ts" });
      runIntegrationTestsScript({ testName: "optimism.integration.test.ts" });
    
      l1ForkNode.process.kill();
      l2ForkNode.process.kill();
    }
  }
];

function getSteps(onlyForkDeploy: boolean, onlyCheck: boolean) {
  if (onlyForkDeploy) {
    return deployAndTestOnForksSteps;
  }
  if (onlyCheck) {
    return testDeployedOnRealNetworkSteps;
  }
  return [...deployAndTestOnForksSteps, ...deployAndVerifyOnRealNetworkSteps, ...testDeployedOnRealNetworkSteps];
}

async function main() {

  const progressBar = new cliProgress.SingleBar({
      format: chalk.greenBright("Progress [{bar}] {percentage}% | Step {value}/{total} | {stepName}"),
      stopOnComplete: true,
      clearOnComplete: false
  }, cliProgress.Presets.shades_classic);

  const { configPath, onlyCheck, onlyForkDeploy } = parseCmdLineArgs();
  console.log(
    chalk.yellowBright(
      chalk.bold(
        `Running script with\n  - configPath: ${configPath}\n  - onlyCheck: ${onlyCheck === true ? true : false }\n  - onlyForkDeploy: ${onlyForkDeploy === true ? true : false }\n`
      )
    )
  );

  const { mainConfig, mainConfigDoc }: { mainConfig: MainConfig, mainConfigDoc: YAML.Document } = loadYamlConfig(configPath);

  const context: Context = {
    mainConfig: mainConfig,
    mainConfigDoc: mainConfigDoc,
    deploymentConfig: mainConfig["deployParameters"],
    testingConfig: mainConfig["testingParameters"]
  };

  const steps = getSteps(onlyForkDeploy, onlyCheck);

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const { name, action } = steps[stepIdx];
      progressBar.start(steps.length, stepIdx, { stepName: name });
      console.log("\n");
      await action(context);
      progressBar.stop();
  }

  progressBar.update(steps.length, { stepName: "All steps completed!" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function loadYamlConfig(stateFile: string): {
  mainConfig: MainConfig;
  mainConfigDoc: YAML.Document;
} {
  const file = path.resolve(stateFile);
  const configContent = fs.readFileSync(file, "utf-8");
  const reviver = (_: unknown, v: unknown) => {
    return typeof v === "bigint" ? String(v) : v;
  };

  return {
    mainConfig: YAML.parse(configContent, reviver, { schema: "core", intAsBigInt: true }),
    mainConfigDoc: YAML.parseDocument(configContent, { intAsBigInt: true })
  };
}

async function spawnNode(rpcForkUrl: string, chainId: number, port: number, outputFileName: string): Promise<{ process: child_process.ChildProcess; rpcUrl: string }> {
  const nodeCmd = "anvil";
  const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`, "--no-storage-caching", "--chain-id", `${chainId}`];

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, "open");

  const processInstance = child_process.spawn(nodeCmd, nodeArgs, { stdio: ["ignore", output, output] });

  console.log(`Spawning test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  console.log(`Waiting 5 seconds ...`);
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

  console.log(`Spawned test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  return { process: processInstance, rpcUrl: rpcForkUrl };
}

