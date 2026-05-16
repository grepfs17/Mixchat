import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportSettings, importSettings } from '../../src/lib/settingsBackup';

function makeBackupFile(settings: Record<string, string>, opts?: { app?: string }): File {
  const backup = {
    _version: 1,
    _app: opts?.app ?? 'mixchat',
    _exportedAt: new Date().toISOString(),
    settings,
  };
  return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
}

function makeCorruptFile(): File {
  return new File(['not json at all'], 'bad.json', { type: 'application/json' });
}

describe('settingsBackup lib', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('exportSettings', () => {
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
      // jsdom doesn't implement URL.createObjectURL/revokeObjectURL
      URL.createObjectURL = vi.fn(() => 'blob:mock-url') as any;
      URL.revokeObjectURL = vi.fn() as any;
    });

    afterEach(() => {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    });

    it('creates a download link and clicks it', async () => {
      const clickSpy = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);
      const createElSpy = vi.spyOn(document, 'createElement').mockImplementation(() => {
        return { click: clickSpy, href: '', download: '' } as any;
      });

      await exportSettings();

      expect(createElSpy).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      createElSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('writes current localStorage values into the exported blob', async () => {
      localStorage.setItem('mixchat_font_size', '20');
      localStorage.setItem('mixchat_unify_chat', 'true');

      let capturedHref = '';
      let capturedDownload = '';
      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation(() => {
        return {
          click: clickSpy,
          get href() { return capturedHref; },
          set href(v: string) { capturedHref = v; },
          get download() { return capturedDownload; },
          set download(v: string) { capturedDownload = v; },
        } as any;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      await exportSettings();

      expect(capturedHref).toBe('blob:mock-url');
      expect(capturedDownload).toMatch(/^mixchat-settings-\d{4}-\d{2}-\d{2}\.json$/);

      vi.restoreAllMocks();
    });
  });

  describe('importSettings', () => {
    it('restores settings from a valid backup file', async () => {
      const file = makeBackupFile({
        mixchat_font_size: '22',
        mixchat_unify_chat: 'false',
      });

      const count = await importSettings(file);

      expect(count).toBe(2);
      expect(localStorage.getItem('mixchat_font_size')).toBe('22');
      expect(localStorage.getItem('mixchat_unify_chat')).toBe('false');
    });

    it('ignores unknown keys in the backup', async () => {
      const file = makeBackupFile({
        mixchat_font_size: '18',
        evil_key: 'should_not_exist',
      });

      const count = await importSettings(file);

      expect(count).toBe(1);
      expect(localStorage.getItem('mixchat_font_size')).toBe('18');
      expect(localStorage.getItem('evil_key')).toBeNull();
    });

    it('rejects a file from a different app', async () => {
      const file = makeBackupFile({ mixchat_font_size: '14' }, { app: 'other-app' });

      await expect(importSettings(file)).rejects.toThrow('This file is not a Mixchat settings backup.');
    });

    it('rejects a file with missing settings object', async () => {
      const bad = new File(
        [JSON.stringify({ _version: 1, _app: 'mixchat' })],
        'bad.json',
        { type: 'application/json' },
      );

      await expect(importSettings(bad)).rejects.toThrow('Invalid backup file format.');
    });

    it('rejects corrupt JSON', async () => {
      const file = makeCorruptFile();

      await expect(importSettings(file)).rejects.toThrow('Failed to parse settings file.');
    });

    it('overwrites existing settings', async () => {
      localStorage.setItem('mixchat_font_size', '14');

      const file = makeBackupFile({ mixchat_font_size: '28' });
      await importSettings(file);

      expect(localStorage.getItem('mixchat_font_size')).toBe('28');
    });

    it('does not touch auth tokens or caches', async () => {
      localStorage.setItem('mixchat_sessions', '{"twitch":{}}');
      localStorage.setItem('emotes_7tv_global_v2', 'cached');

      const file = makeBackupFile({ mixchat_font_size: '16' });
      await importSettings(file);

      expect(localStorage.getItem('mixchat_sessions')).toBe('{"twitch":{}}');
      expect(localStorage.getItem('emotes_7tv_global_v2')).toBe('cached');
      expect(localStorage.getItem('mixchat_font_size')).toBe('16');
    });

    it('restores event sounds from backup into localStorage fallback', async () => {
      const file = makeBackupFile({
        mixchat_event_sounds: JSON.stringify({ subscription: 'data:audio/mp3;base64,abc123' }),
      });

      const count = await importSettings(file);

      expect(count).toBe(1);
      // In jsdom IndexedDB is unavailable, so the fallback writes to localStorage
      expect(localStorage.getItem('mixchat_event_sounds')).toBe(
        JSON.stringify({ subscription: 'data:audio/mp3;base64,abc123' }),
      );
    });

    it('ignores malformed event sounds in backup', async () => {
      const file = makeBackupFile({
        mixchat_event_sounds: 'not-valid-json',
      });

      const count = await importSettings(file);

      expect(count).toBe(0);
      expect(localStorage.getItem('mixchat_event_sounds')).toBeNull();
    });
  });

  describe('exportSettings with event sounds fallback', () => {
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:mock-url') as any;
      URL.revokeObjectURL = vi.fn() as any;
    });

    afterEach(() => {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    });

    it('includes event sounds in the exported JSON when present in localStorage fallback', async () => {
      localStorage.setItem(
        'mixchat_event_sounds',
        JSON.stringify({ subscription: 'data:audio/mp3;base64,abc123' }),
      );

      let capturedBlob: Blob | null = null;
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return {
            click: vi.fn(),
            href: '',
            download: '',
          } as any;
        }
        return document.createElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      // Mock URL.createObjectURL to capture the blob
      URL.createObjectURL = vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      }) as any;

      await exportSettings();

      expect(capturedBlob).not.toBeNull();
      const text = await capturedBlob!.text();
      const parsed = JSON.parse(text);
      expect(parsed.settings['mixchat_event_sounds']).toBe(
        JSON.stringify({ subscription: 'data:audio/mp3;base64,abc123' }),
      );

      vi.restoreAllMocks();
    });
  });
});
