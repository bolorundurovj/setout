import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { InstallService } from './install.service';

describe('InstallService', () => {
  let calls: Record<string, unknown>[];

  function configure(reply: (name: string) => unknown) {
    calls = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        calls.push({ call: fn?.name ?? '', ...params });
        const response = reply(fn?.name ?? '');
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(InstallService);
  }

  const backup = { format: 1, app_version: '0.1.0', exported_at: '2026-08-19T00:00:00Z' };

  it('loads the server details', async () => {
    const service = configure(() => ({ version: '0.1.0', data_bytes: 2048 }));

    await service.load();

    expect(service.install()?.version).toBe('0.1.0');
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('clears the details and sets an error when loading fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.load();

    expect(service.install()).toBeNull();
    expect(service.error()).toBe('Could not load the server details.');
  });

  it('returns the exported backup', async () => {
    const service = configure(() => backup);

    const exported = await service.export();

    expect(exported).toEqual(backup);
    expect(service.exporting()).toBe(false);
  });

  it('sets an error when the export fails', async () => {
    const service = configure(() => new Error('offline'));

    expect(await service.export()).toBeNull();
    expect(service.error()).toBe('Could not create the backup.');
  });

  it('passes accept_version_change to the restore', async () => {
    const service = configure(() => ({ tables: {}, row_counts: {} }));

    await service.restore(backup as never, true);

    expect(calls[0]['call']).toBe('restoreBackup');
    expect(calls[0]['body']).toEqual({ backup, accept_version_change: true });
    expect(service.restoring()).toBe(false);
  });

  it('shows the API error when the backup is rejected', async () => {
    const service = configure(() =>
      Object.assign(new Error('no'), {
        error: { detail: 'The backup contains unknown tables' },
      }),
    );

    expect(await service.restore(backup as never, false)).toBeNull();
    expect(service.error()).toBe('The backup contains unknown tables');
  });
});
