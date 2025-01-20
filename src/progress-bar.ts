import cliProgress from "cli-progress";

export class ProgressBar {
  private bar: cliProgress.SingleBar | null = null;

  constructor(showLogs: boolean) {
    if (!showLogs) {
      this.bar = new cliProgress.SingleBar(
        {
          format: "Progress [{bar}] {percentage}% | Step {value}/{total} | {stepName}",
          stopOnComplete: true,
          clearOnComplete: false,
          stream: process.stdout,
        },
        cliProgress.Presets.shades_classic,
      );
    }
  }

  start(total: number) {
    this.bar?.start(total, 0, { stepName: "Starting..." });
  }

  update(step: number, stepName: string) {
    this.bar?.update(step, { step, stepName });
  }

  complete(message: string = "All steps completed!") {
    this.bar?.update(this.bar.getTotal(), { stepName: message });
  }
}
