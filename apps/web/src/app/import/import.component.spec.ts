import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Decision, ImportReport } from '@setout/api-client';
import { ProjectService } from '../projects/project.service';
import { ToastService } from '../toast.service';
import { ImportComponent } from './import.component';
import { ImportService } from './import.service';

function decision(kind: Decision['kind'], over: Partial<Decision> = {}): Decision {
  return { kind, count: 1, detail: '', amount: 0, ...over };
}

function report(over: Partial<ImportReport> = {}): ImportReport {
  return {
    project_id: 'p1',
    project_name: 'Jacaranda Close',
    currency_code: 'NGN',
    currency_exponent: 2,
    read: [{ name: 'Budget', holds: 'budget', rows: 5 }],
    skipped: [],
    scopes: [],
    planned_amount: 0,
    planned_lines: 0,
    spend_rows: 0,
    spend_amount: 0,
    vendors_new: 0,
    vendors_known: 0,
    owed_rows: 0,
    decisions: [],
    sample: [],
    left_behind: [],
    ...over,
  };
}

describe('ImportComponent', () => {
  let looked: unknown[][];
  let ran: unknown[][];
  let navigations: unknown[][];
  let failure: string | null;
  let available: { id: string; name: string }[];

  function render(project = '', found: ImportReport | null = report()) {
    looked = [];
    ran = [];
    navigations = [];
    failure = null;
    available = [{ id: 'p1', name: 'Jacaranda Close' }];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ImportComponent],
      providers: [
        provideRouter([]),
        {
          provide: ImportService,
          useValue: {
            working: () => false,
            error: () => failure,
            sampleUrl: (kind: string) => `/api/import/sample?kind=${kind}`,
            look: async (...args: unknown[]) => {
              looked.push(args);
              return found;
            },
            bringIn: async (...args: unknown[]) => {
              ran.push(args);
              return {
                project_id: 'p1',
                project_name: 'Jacaranda Close',
                scopes: 6,
                budget_items: 65,
                planned_amount: 382_830_000,
                expenses: 2,
                spend_amount: 75_000_000,
                vendors: 14,
                people: 1,
                skipped_duplicates: 0,
              };
            },
          },
        },
        {
          provide: ProjectService,
          useValue: {
            projects: () => available,
            currencies: () => [{ code: 'NGN', name: 'Nigerian naira', exponent: 2 }],
            load: async () => undefined,
            loadCurrencies: async () => undefined,
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (...args: unknown[]) => {
      navigations.push(args);
      return true;
    };
    const fixture = TestBed.createComponent(ImportComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture;
  }

  function componentOf(project = '', found: ImportReport | null = report()) {
    return render(project, found).componentInstance;
  }

  const sheet = new File(['a sheet'], 'budget.xlsx', { type: 'application/vnd.ms-excel' });

  it('marks the project it was opened from, once the list it belongs to arrives', () => {
    available = [];
    const fixture = render('p1');

    available = [
      { id: 'p0', name: 'Somewhere else' },
      { id: 'p1', name: 'Jacaranda Close' },
    ];
    fixture.detectChanges();

    const options = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('option'),
    ] as HTMLOptionElement[];
    const marked = options.filter((option) => option.selected).map((option) => option.value);

    expect(marked).toEqual(['p1']);
  });

  it('starts on the file step with nothing readable yet', () => {
    const component = componentOf();
    expect(component.at('file')).toBe(true);
    expect(component.canRead()).toBe(false);
  });

  it('opens on the project it was sent from, so the target is already right', () => {
    const component = componentOf('p1');
    expect(component.projectId()).toBe('p1');
    expect(component.intoNew()).toBe(false);
    expect(component.targetName()).toBe('Jacaranda Close');
  });

  it('wants a name before it will read a file into a project that does not exist', () => {
    const component = componentOf();
    component.file.set(sheet);
    expect(component.intoNew()).toBe(true);
    expect(component.canRead()).toBe(false);

    component.name.set('Jacaranda Close');
    expect(component.canRead()).toBe(true);
  });

  it('moves to review once the sheet has been read', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);

    await component.read();

    expect(looked.length).toBe(1);
    expect(component.at('review')).toBe(true);
    expect(component.report()?.project_name).toBe('Jacaranda Close');
  });

  it('stays where it is when the file cannot be read', async () => {
    const component = componentOf('p1', null);
    component.file.set(sheet);
    failure = 'No sheet in that file looks like a budget';

    await component.read();

    expect(component.at('file')).toBe(true);
    expect(component.report()).toBeNull();
  });

  it('offers both answers to a decision and marks the one that holds', () => {
    const component = componentOf('p1');
    const answer = decision('duplicates', { count: 3, detail: 'already here' });

    expect(component.choicesFor(answer).map((choice) => choice.label)).toEqual([
      'Skip them',
      'Bring them in again',
    ]);
    expect(component.answerFor(answer)).toBe('yes');
    expect(component.consequenceFor(answer)).toContain('not doubled');
  });

  it('changes an answer only to the one that was chosen', () => {
    const component = componentOf('p1');
    const answer = decision('new_scopes', { count: 6, detail: 'six scopes' });

    component.answer(answer, 'yes');
    expect(component.createMissingScopes()).toBe(true);

    component.answer(answer, 'no');
    expect(component.createMissingScopes()).toBe(false);
    expect(component.consequenceFor(answer)).toContain('No budget is written');

    component.answer(answer, 'no');
    expect(component.createMissingScopes()).toBe(false);
  });

  it('keeps every scope by default, so a plan is never silently dropped', () => {
    const component = componentOf('p1');
    expect(component.createMissingScopes()).toBe(true);
    expect(component.answerFor({ kind: 'new_scopes', count: 6, detail: '', amount: 0 })).toBe(
      'yes',
    );
  });

  it('has nothing to offer on a decision that is only a statement', () => {
    const component = componentOf('p1');
    expect(component.hasAnswer(decision('owed_not_importable', { count: 2 }))).toBe(false);
  });

  it('will not write while a decision blocks it', async () => {
    const component = componentOf(
      'p1',
      report({
        decisions: [
          decision('above_any_scope', {
            count: 2,
            detail: 'sit above every scope',
            blocking: true,
          }),
        ],
      }),
    );
    component.file.set(sheet);
    await component.read();

    expect(component.blocking()).toBe(true);
  });

  it('sends the answers as they stand and lands on done', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.read();
    component.takeUnpaid.set(false);
    component.severalCodes.set('unfiled');

    await component.bringIn();

    expect(ran[0][2]).toEqual({
      createMissingScopes: true,
      skipDuplicates: true,
      takeUnpaid: false,
      severalCodes: 'unfiled',
    });
    expect(component.at('done')).toBe(true);
    expect(component.result()?.scopes).toBe(6);
  });

  it('opens the project it just filled', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.read();
    await component.bringIn();

    component.openProject();

    expect(navigations[0][0]).toEqual(['/projects', 'p1']);
  });

  it('forgets the report when another file is chosen', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.read();

    component.clearFile();

    expect(component.file()).toBeNull();
    expect(component.report()).toBeNull();
  });

  it('offers a sheet to start from for somebody with nothing to import yet', () => {
    const component = componentOf();

    expect(component.samples.map((choice) => choice.kind)).toEqual([
      'blank',
      'example',
      'budget-csv',
      'spending-csv',
    ]);
    expect(component.sampleUrl('example')).toBe('/api/import/sample?kind=example');
  });

  it('offers an answer to every decision the report can raise', () => {
    const component = componentOf('p1');
    const kinds = ['new_scopes', 'duplicates', 'unpaid', 'several_codes'] as Decision['kind'][];

    for (const kind of kinds) {
      const answer = decision(kind);
      expect(component.hasAnswer(answer)).toBe(true);
      expect(component.choicesFor(answer).length).toBe(2);
      expect(component.consequenceFor(answer).length).toBeGreaterThan(0);
    }
  });

  it('lets the unpaid rows be left out', () => {
    const component = componentOf('p1');
    const answer = decision('unpaid', { count: 2 });

    expect(component.answerFor(answer)).toBe('yes');
    component.answer(answer, 'no');
    expect(component.takeUnpaid()).toBe(false);
  });
});
