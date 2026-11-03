export type StagingTargetOptions = {
  stagingUrl?: string | undefined;
  expectedHost?: string | undefined;
  productionUrl?: string | undefined;
};

export function validateStagingTarget(
  options: StagingTargetOptions,
): { origin: string; hostname: string };
