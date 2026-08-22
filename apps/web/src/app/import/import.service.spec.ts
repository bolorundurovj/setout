import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { ImportService } from './import.service';

describe('ImportService', () => {
  let asked: Record<string, unknown>[];

  function configure(reply: (name: string) => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '');
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(ImportService);
  }

  const file = new File(['a sheet'], 'budget.xlsx', { type: 'application/vnd.ms-excel' });

  it('sends the file itself, and the project it is going into', async () => {
    const service = configure(() => ({ planned_amount: 0 }));

    await service.look(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(asked[0]['call']).toBe('previewImport');
    expect(body['file']).toBe(file);
    expect(body['project_id']).toBe('p1');
  });

  it('sends a name and a currency when there is no project yet', async () => {
    const service = configure(() => ({ planned_amount: 0 }));

    await service.look(file, { projectId: null, name: 'Jacaranda Close', currencyCode: 'NGN' });

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(body['project_id']).toBeNull();
    expect(body['name']).toBe('Jacaranda Close');
    expect(body['currency_code']).toBe('NGN');
  });

  it('carries every answer through to the write', async () => {
    const service = configure(() => ({ project_id: 'p1' }));

    await service.bringIn(
      file,
      { projectId: 'p1', name: '', currencyCode: 'NGN' },
      {
        createMissingScopes: false,
        skipDuplicates: false,
        takeUnpaid: false,
        severalCodes: 'unfiled',
      },
    );

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(asked[0]['call']).toBe('runImport');
    expect(body['create_missing_scopes']).toBe(false);
    expect(body['skip_duplicates']).toBe(false);
    expect(body['take_unpaid']).toBe(false);
    expect(body['several_codes']).toBe('unfiled');
  });

  it('repeats what the server said about a file it could not read', async () => {
    const service = configure(() => {
      throw { error: { detail: 'No sheet in that file looks like a budget' } };
    });

    const found = await service.look(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    expect(found).toBeNull();
    expect(service.error()).toBe('No sheet in that file looks like a budget');
  });

  it('reads the first complaint out of a validation list', async () => {
    const service = configure(() => {
      throw { error: { detail: [{ msg: 'A new project needs a name' }] } };
    });

    await service.bringIn(
      file,
      { projectId: null, name: '', currencyCode: 'NGN' },
      { createMissingScopes: true, skipDuplicates: true, takeUnpaid: true, severalCodes: 'first' },
    );

    expect(service.error()).toBe('A new project needs a name');
  });

  it('says something plain when the server said nothing useful', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.look(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    expect(service.error()).toBe('That file could not be read.');
  });
});
