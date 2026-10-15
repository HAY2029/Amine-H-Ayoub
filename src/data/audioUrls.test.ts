import { afterEach, describe, expect, it, vi } from "vitest";

describe("audio provider routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the public Hugging Face dataset as primary with standard Surah filenames", async () => {
    const { getHuggingFaceAudioUrl, getSurahAudioUrl } = await import("./audioUrls");
    expect(getSurahAudioUrl(1)).toBe(getHuggingFaceAudioUrl(1));
    expect(getHuggingFaceAudioUrl(114)).toBe(
      "https://huggingface.co/datasets/hammoualiyoucef20/quran-audio/resolve/main/114.mp3",
    );
  });

  it("falls back to Archive for an HF-only missing Surah without declaring HF unhealthy", async () => {
    const { fetchSurahAudio, getAudioProvider } = await import("./audioUrls");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("audio", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSurahAudio(114);
    expect(result.response.ok).toBe(true);
    expect(result.url).toContain("archive.org");
    expect(getAudioProvider()).toBe("huggingface");
  });

  it("falls back to Archive on quota and does not retry permanent authorization failures", async () => {
    const { fetchSurahAudio, getAudioProvider } = await import("./audioUrls");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response("audio", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSurahAudio(36);
    expect(result.url).toContain("ia803201.us.archive.org/34/items/quran-audio-files-for-kids/36.mp3");
    expect(result.response.ok).toBe(true);
    expect(getAudioProvider()).toBe("archive");

    vi.resetModules();
    const freshAudioUrls = await import("./audioUrls");
    const deniedFetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", deniedFetch);
    const denied = await freshAudioUrls.fetchSurahAudio(37);
    expect(denied.response.status).toBe(403);
    expect(deniedFetch).toHaveBeenCalledTimes(1);
  });
});