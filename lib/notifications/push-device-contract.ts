export const pushServerStates = ["missing", "disabled", "subscribed"] as const;
export type PushServerState = (typeof pushServerStates)[number];
export type PushPermissionState = "default" | "denied" | "granted";
export type PushDeviceViewState =
  | "not_configured"
  | "unsupported"
  | "install_required"
  | "denied"
  | "ready_to_enable"
  | "subscribed"
  | "repair_required";

export type PushDeviceSignals = Readonly<{
  vapidConfigured: boolean;
  supported: boolean;
  appleMobile: boolean;
  standalone: boolean;
  permission: PushPermissionState;
  hasBrowserSubscription: boolean;
  serverState: PushServerState;
}>;

export function isPushServerState(value: unknown): value is PushServerState {
  return typeof value === "string" && pushServerStates.includes(value as PushServerState);
}

export function isAppleMobileEnvironment(input: Readonly<{
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}>): boolean {
  return /iPad|iPhone|iPod/u.test(input.userAgent) ||
    (input.platform === "MacIntel" && input.maxTouchPoints > 1);
}

export function derivePushDeviceViewState(signals: PushDeviceSignals): PushDeviceViewState {
  if (!signals.vapidConfigured) return "not_configured";
  if (!signals.supported) return "unsupported";
  if (signals.appleMobile && !signals.standalone) return "install_required";
  if (signals.permission === "denied") return "denied";

  if (signals.hasBrowserSubscription) {
    return signals.serverState === "subscribed" ? "subscribed" : "repair_required";
  }

  return signals.permission === "granted" ? "repair_required" : "ready_to_enable";
}
