import { describe, expect, it, vi, beforeEach } from "vitest";

const saveAudioToCacheMock = vi.fn();
const isAudioCachedOfflineMock = vi.fn();
const fetchAudioWithRetryMock = vi.fn();
const fetchSurahAudioMock = vi.fn();
const getSurahAudioCandidatesMock = vi.fn(() => ["https://example.com/audio/1.mp3"]);
const reportHuggingFaceFailureMock = vi.fn();

vi.mock("./offlineAudioCache", () => ({
  saveAudioToCache: saveAudioToCacheMock,
  isAudioCachedOffline: isAudioCachedOfflineMock,
}));

vi.mock("./audioUrls", () => ({
  fetchAudioWithRetry: fetchAudioWithRetryMock,
  fetchSurahAudio: fetchSurahAudioMock,
  getSurahAudioCandidates: getSurahAudioCandidatesMock,
  reportHuggingFaceFailure: reportHuggingFaceFailureMock,
}));

vi.mock("@/utils/tauriUtils", () => ({
  downloadSurah: vi.fn(),
  isTauri: () => false,
  listenToDownloadProgress: vi.fn(() => () => {}),
}));

describe("offline download reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when a local device copy already exists", async () => {
    isAudioCachedOfflineMock.mockResolvedValue(true);

    const { downloadSurahOffline } = await import("./offlineDownload");

    await expect(downloadSurahOffline(1, "https://example.com/audio/1.mp3")).resolves.toBeUndefined();

    expect(fetchAudioWithRetryMock).not.toHaveBeenCalled();
    expect(saveAudioToCacheMock).not.toHaveBeenCalled();
  });
});
