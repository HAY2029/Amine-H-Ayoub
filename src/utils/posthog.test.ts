import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: api }));

describe("posthog analytics module", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  });

  it("captures and identifies after init", async () => {
    const mod = await import("./posthog");
    mod.initAnalytics();
    await vi.waitFor(() => expect(api.init).toHaveBeenCalled());

    mod.captureEvent("app_open", { is_new_user: true });
    mod.identifyUser("child_p1", { role: "child" });

    expect(api.capture).toHaveBeenCalledWith("app_open", { is_new_user: true });
    expect(api.identify).toHaveBeenCalledWith("child_p1", { role: "child" });
  });

  it("initializes session replay with every input masked", async () => {
    const mod = await import("./posthog");
    mod.initAnalytics();
    await vi.waitFor(() => expect(api.init).toHaveBeenCalled());

    const [, config] = api.init.mock.calls[0];
    // التسجيل مفعّل لأن التهيئة لا تحدث إلا بموافقة المستخدم
    expect(config.disable_session_recording).toBe(false);
    expect(config.session_recording).toMatchObject({ maskAllInputs: true });
    expect(config.session_recording.maskTextSelector).toContain("[data-ph-mask]");
  });

  it("stops and restarts replay with consent", async () => {
    const mod = await import("./posthog");
    mod.initAnalytics();
    await vi.waitFor(() => expect(api.init).toHaveBeenCalled());

    mod.setAnalyticsConsent(false);
    expect(api.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(api.opt_out_capturing).toHaveBeenCalledTimes(1);

    mod.setAnalyticsConsent(true);
    expect(api.startSessionRecording).toHaveBeenCalledTimes(1);
    expect(api.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("flushes events queued before the SDK loaded", async () => {
    const mod = await import("./posthog");
    mod.captureEvent("queued_event");
    expect(api.capture).not.toHaveBeenCalled();

    mod.initAnalytics();
    await vi.waitFor(() => expect(api.capture).toHaveBeenCalledWith("queued_event", {}));
  });

  it("scopes child identity per device so fresh installs do not merge", async () => {
    const mod = await import("./posthog");
    mod.initAnalytics();
    await vi.waitFor(() => expect(api.init).toHaveBeenCalled());

    mod.identifyActiveProfile();

    expect(api.identify).toHaveBeenCalledTimes(1);
    const [distinctId, props] = api.identify.mock.calls[0];
    expect(props).toMatchObject({ role: "child" });
    // ملف الطفل غير موجود بعد (أول تشغيل) — لا يجوز أن يشترك كل المستخدمين في "child_default"
    expect(distinctId).not.toBe("child_default");
    expect(distinctId).toMatch(/^child_/);
    expect(distinctId).toBe(`child_${localStorage.getItem("mushaf:deviceId")}`);
  });

  it("stays inert when consent is revoked", async () => {
    localStorage.setItem("mushaf:analyticsConsent", "0");
    const mod = await import("./posthog");
    mod.initAnalytics();
    mod.captureEvent("blocked_event");
    await new Promise((r) => setTimeout(r, 30));

    expect(api.init).not.toHaveBeenCalled();
    expect(api.capture).not.toHaveBeenCalled();
  });

  it("does not send events captured before consent was granted", async () => {
    localStorage.setItem("mushaf:analyticsConsent", "0");
    const mod = await import("./posthog");
    mod.captureEvent("pre_consent_event");

    mod.setAnalyticsConsent(true);
    await vi.waitFor(() => expect(api.init).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));

    expect(api.capture).not.toHaveBeenCalledWith("pre_consent_event", {});
  });
});
