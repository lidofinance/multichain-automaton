import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import * as YAML from "yaml";

import { MainConfig } from "./config";
import { logToStream, LogType } from "./log-utils";
import { ProgressBar } from "./progress-bar";
import { Context, getSteps } from "./steps";

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--onlyCheck", "only check the real network deployment")
    .option("--onlyForkDeploy", "only deploy to the forked network")
    .option("--showLogs", "show logs in console")
    .parse();

  const configPath = program.args[0];
  return {
    configPath,
    onlyCheck: program.getOptionValue("onlyCheck"),
    onlyForkDeploy: program.getOptionValue("onlyForkDeploy"),
    showLogs: program.getOptionValue("showLogs"),
  };
}

async function main() {
  const logStream = fs.createWriteStream("./artifacts/main_logs.txt");

  const { configPath, onlyCheck, onlyForkDeploy, showLogs } = parseCmdLineArgs();
  console.log("Running script with");
  console.log(`  - configPath: ${configPath}`);
  console.log(`  - onlyCheck: ${onlyCheck === true ? true : false }`);
  console.log(`  - onlyForkDeploy: ${onlyForkDeploy === true ? true : false }`);
  console.log(`  - showLogs: ${showLogs === true ? true : false }`);

  const { mainConfig, mainConfigDoc }: { mainConfig: MainConfig, mainConfigDoc: YAML.Document } = loadYamlConfig(configPath);

  const context: Context = {
    mainConfig: mainConfig,
    mainConfigDoc: mainConfigDoc,
    deploymentConfig: mainConfig["deployParameters"],
    testingConfig: mainConfig["testingParameters"]
  };

  const progress = new ProgressBar(showLogs);
  const steps = getSteps(onlyForkDeploy, onlyCheck);

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
