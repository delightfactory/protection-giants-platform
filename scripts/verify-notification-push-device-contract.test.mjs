import { describe, expect, it } from "vitest";
import {
  derivePushDeviceViewState,
  isAppleMobileEnvironment,
} from "../lib/notifications/push-device-contract";

const base = {
  vapidConfigured: true,
  supported: true,
  appleMobile: false,
  standalone: false,
  permission: "default",
  hasBrowserSubscription: false,
  serverState: "missing",
};

describe("Cube L push device state", () => {
  it("fails closed when runtime is not configured or supported", () => {
    expect(derivePushDeviceViewState({ ...base, vapidConfigured: false })).toBe("not_configured");
    expect(derivePushDeviceViewState({ ...base, supported: false })).toBe("unsupported");
  });

  it("prioritizes Home Screen installation for Apple mobile even before Push APIs are exposed", () => {
    expect(derivePushDeviceViewState({ ...base, appleMobile: true, standalone: false })).toBe("install_required");
    expect(derivePushDeviceViewState({ ...base, supported: false, appleMobile: true, standalone: false })).toBe("install_required");
    expect(isAppleMobileEnvironment({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileEnvironment({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });

  it("never treats denied permission as enableable", () => {
    expect(derivePushDeviceViewState({ ...base, permission: "denied" })).toBe("denied");
  });

  it("distinguishes ready, subscribed and repair states", () => {
    expect(derivePushDeviceViewState(base)).toBe("ready_to_enable");
    expect(derivePushDeviceViewState({ ...base, permission: "granted" })).toBe("repair_required");
    expect(derivePushDeviceViewState({ ...base, permission: "granted", hasBrowserSubscription: true, serverState: "missing" })).toBe("repair_required");
    expect(derivePushDeviceViewState({ ...base, permission: "granted", hasBrowserSubscription: true, serverState: "disabled" })).toBe("repair_required");
    expect(derivePushDeviceViewState({ ...base, permission: "granted", hasBrowserSubscription: true, serverState: "subscribed" })).toBe("subscribed");
  });
});
