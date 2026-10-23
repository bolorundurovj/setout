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

  it('sends the file and the target project', async () => {
    const service = configure(() => ({ budgeted_amount: 0 }));

    await service.preview(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(asked[0]['call']).toBe('previewImport');
    expect(body['file']).toBe(file);
    expect(body['project_id']).toBe('p1');
  });

  it('sends a name and currency for a new project', async () => {
    const service = configure(() => ({ budgeted_amount: 0 }));

    await service.preview(file, { projectId: null, name: 'Jacaranda Close', currencyCode: 'NGN' });

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(body['project_id']).toBeNull();
    expect(body['name']).toBe('Jacaranda Close');
    expect(body['currency_code']).toBe('NGN');
  });

  it('sends every import option', async () => {
    const service = configure(() => ({ project_id: 'p1' }));

    await service.runImport(
      file,
      { projectId: 'p1', name: '', currencyCode: 'NGN' },
      {
        createMissingCategories: false,
        skipDuplicates: false,
        includeUnpaid: false,
        multipleCodes: 'uncategorised',
      },
    );

    const body = asked[0]['body'] as Record<string, unknown>;
    expect(asked[0]['call']).toBe('runImport');
    expect(body['create_missing_categories']).toBe(false);
    expect(body['skip_duplicates']).toBe(false);
    expect(body['take_unpaid']).toBe(false);
    expect(body['several_codes']).toBe('uncategorised');
  });

  it('shows the server error detail', async () => {
    const service = configure(() => {
      throw { error: { detail: 'No sheet in that file looks like a budget' } };
    });

    const report = await service.preview(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    expect(report).toBeNull();
    expect(service.error()).toBe('No sheet in that file looks like a budget');
  });

  it('shows the first validation message', async () => {
    const service = configure(() => {
      throw { error: { detail: [{ msg: 'A new project needs a name' }] } };
    });

    await service.runImport(
      file,
      { projectId: null, name: '', currencyCode: 'NGN' },
      {
        createMissingCategories: true,
        skipDuplicates: true,
        includeUnpaid: true,
        multipleCodes: 'first',
      },
    );

    expect(service.error()).toBe('A new project needs a name');
  });

  it('falls back to a generic error', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.preview(file, { projectId: 'p1', name: '', currencyCode: 'NGN' });

    expect(service.error()).toBe('Could not read the file.');
  });
});
