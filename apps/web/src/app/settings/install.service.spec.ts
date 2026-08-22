import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { InstallService } from './install.service';

describe('InstallService', () => {
  let asked: Record<string, unknown>[];

  function configure(reply: (name: string) => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        const answer = reply(fn?.name ?? '');
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(InstallService);
  }

  const backup = { format: 1, app_version: '0.1.0', exported_at: '2026-08-19T00:00:00Z' };

  it('reads what the install says about itself', async () => {
    const service = configure(() => ({ version: '0.1.0', record_bytes: 2048 }));

    await service.load();

    expect(service.install()?.version).toBe('0.1.0');
    expect(service.reading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('says the server did not answer rather than showing stale facts', async () => {
    const service = configure(() => new Error('offline'));

    await service.load();

    expect(service.install()).toBeNull();
    expect(service.error()).toBe('The server did not answer.');
  });

  it('hands back the copy it was given', async () => {
    const service = configure(() => backup);

    const written = await service.export();

    expect(written).toEqual(backup);
    expect(service.writing()).toBe(false);
  });

  it('says so when a copy cannot be written', async () => {
    const service = configure(() => new Error('offline'));

    expect(await service.export()).toBeNull();
    expect(service.error()).toBe('Could not write a copy.');
  });

  it('carries the version answer through to the restore', async () => {
    const service = configure(() => ({ tables: {}, row_counts: {} }));

    await service.restore(backup as never, true);

    expect(asked[0]['call']).toBe('restoreRecord');
    expect(asked[0]['body']).toEqual({ backup, accept_version_change: true });
    expect(service.restoring()).toBe(false);
  });

  it('repeats what the server said about a copy it would not take', async () => {
    const service = configure(() =>
      Object.assign(new Error('no'), {
        error: { detail: 'That file holds tables this Setout does not know' },
      }),
    );

    expect(await service.restore(backup as never, false)).toBeNull();
    expect(service.error()).toBe('That file holds tables this Setout does not know');
  });
});
