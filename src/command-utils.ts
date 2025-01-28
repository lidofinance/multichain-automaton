import chalk from "chalk";
import { spawn } from "child_process";

import { LogCallback, LogType } from "./log-utils";

async function runCommand({
  command,
  args = [],
  workingDirectory = process.cwd(),
  environment = process.env,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
  delayBetweenRetries = 1000, // Delay in milliseconds between retries
  logCallback,
}: {
  command: string;
  args: string[];
  workingDirectory: string;
  environment: NodeJS.ProcessEnv;
  throwOnFail: boolean;
  tryNumber: number;
  maxTries: number;
  delayBetweenRetries?: number;
  logCallback: LogCallback;
}) {
  logCallback(
    `Run command in ${workingDirectory}: ${command} ${args.join(" ")} (try ${tryNumber} of ${maxTries})`,
    LogType.Level1,
  );

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      env: environment,
    });

    child.stdout.on("data", (data) => {
      logCallback(data.toString(), LogType.Level2);
    });

    child.stderr.on("data", (data) => {
      logCallback(data.toString(), LogType.Level2);
    });

    child.on("error", (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
      reject(error);
    });

    child.on("close", async (code) => {
      if (code === 0) {
        logCallback(`Command succeeded with exit code ${code}.`, LogType.Level1);
        resolve();
      } else {
        logCallback(`Command failed with exit code ${code}.`, LogType.Level1);

        if (tryNumber < maxTries) {
          logCallback(
            `Retrying command (${tryNumber + 1} of ${maxTries}) after ${delayBetweenRetries}ms...`,
            LogType.Level1,
          );

          await new Promise((resolveRetry) => setTimeout(resolveRetry, delayBetweenRetries));

          try {
            await runCommand({
              command,
              args,
              workingDirectory,
              environment,
              throwOnFail,
              tryNumber: tryNumber + 1,
              maxTries,
              delayBetweenRetries,
              logCallback,
            });
            resolve();
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          const errorMsg = `Command failed after ${maxTries} attempts.`;
          console.error(chalk.red(errorMsg));
          if (throwOnFail) {
            reject(new Error(errorMsg));
          } else {
            resolve(); // Treat failure as success if throwOnFail is false
          }
        }
      }
    });
  });
}

export {
    runCommand
}