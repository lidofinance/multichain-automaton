import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import * as YAML from "yaml";

import { logToStream, LogType } from "./log-utils";
import { MainConfig } from "./main-config";
import { ProgressBar } from "./progress-bar";
import { Context, getSteps, DeployAction } from "./steps";

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--actions [actions...]", "list of actions: fork deploy verify check", ["all"])
    .option("--showLogs", "show logs in console")
    .parse();

  const configPath = program.args[0];
  const actionsOption = program.getOptionValue("actions") || Array("all");  
  const actions = deployActionsFromActionsOption(actionsOption);

  return {
    configPath,
    actions: actions,
    showLogs: program.getOptionValue("showLogs"),
  };
}

function deployActionsFromActionsOption(actionsOption: string[]): DeployAction[] {
  return (actionsOption[0] === "all") ? 
    Object.values(DeployAction) :
    actionsOption.map(action => {
      const trimmedAction = action.trim().toLowerCase();
      switch (trimmedAction) {
        case "fork": return DeployAction.Fork;
        case "deploy": return DeployAction.Deploy;
        case "verify": return DeployAction.Verify;
        case "check": return DeployAction.Check;
        default:
          throw new Error(`Invalid action: ${action}. Valid actions are: fork, deploy, verify, check`);
      }
    });
}

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
    mainConfigDoc: YAML.parseDocument(configContent, { intAsBigInt: true }),
  };
}

async function main() {
  const logStream = fs.createWriteStream("./artifacts/main.log");

  const { configPath, actions, showLogs } = parseCmdLineArgs();
  console.log("Running script with");
  console.log(`  - configPath: ${configPath}`);
  console.log(`  - actions: ${actions}`);
  console.log(`  - showLogs: ${!!showLogs}`);

  const { mainConfig, mainConfigDoc }: { mainConfig: MainConfig; mainConfigDoc: YAML.Document } =
    loadYamlConfig(configPath);

  const context: Context = {
    mainConfig: mainConfig,
    mainConfigDoc: mainConfigDoc,
    deploymentConfig: mainConfig["deployParameters"],
    testingConfig: mainConfig["testingParameters"],
  };

  const progress = new ProgressBar(showLogs);
  const steps = getSteps(actions);

  progress.start(steps.length);

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const { name, action } = steps[stepIdx];
    progress.update(stepIdx, name);
    logStream.write(`[${new Date().toISOString()}] ${name}`);
    await action(context, (message, logType) => {
      if (showLogs) {
        logToStream(process.stdout, message, logType);
      } else {
        if (logType === LogType.Level1) {
          progress.update(stepIdx, message);
        }
      }
      logToStream(logStream, message, logType);
    });
  }
  progress.complete();
  logStream.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
