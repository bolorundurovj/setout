import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Decision, ImportReport } from '@setout/api-client';
import { ProjectService } from '../projects/project.service';
import { ToastService } from '../toast.service';
import { ImportComponent } from './import.component';
import { ImportService } from './import.service';

function decision(kind: Decision['kind'], overrides: Partial<Decision> = {}): Decision {
  return { kind, count: 1, detail: '', amount: 0, ...overrides };
}

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    project_id: 'p1',
    project_name: 'Jacaranda Close',
    currency_code: 'NGN',
    currency_exponent: 2,
    read: [{ name: 'Budget', holds: 'budget', rows: 5 }],
    skipped: [],
    categories: [],
    budgeted_amount: 0,
    budgeted_lines: 0,
    expense_rows: 0,
    spent_amount: 0,
    vendors_new: 0,
    vendors_known: 0,
    outstanding_rows: 0,
    decisions: [],
    sample: [],
    left_behind: [],
    ...overrides,
  };
}

describe('ImportComponent', () => {
  let previewCalls: unknown[][];
  let importCalls: unknown[][];
  let navigations: unknown[][];
  let failure: string | null;
  let available: { id: string; name: string }[];

  function render(project = '', found: ImportReport | null = report()) {
    previewCalls = [];
    importCalls = [];
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
            busy: () => false,
            error: () => failure,
            templateUrl: (kind: string) => `/api/import/sample?kind=${kind}`,
            preview: async (...args: unknown[]) => {
              previewCalls.push(args);
              return found;
            },
            runImport: async (...args: unknown[]) => {
              importCalls.push(args);
              return {
                project_id: 'p1',
                project_name: 'Jacaranda Close',
                category_count: 6,
                budget_item_count: 65,
                budgeted_amount: 382_830_000,
                expense_count: 2,
                spent_amount: 75_000_000,
                vendor_count: 14,
                person_count: 1,
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

  it('selects the project from the route once the project list loads', () => {
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

  it('starts on the file step with preview disabled', () => {
    const component = componentOf();
    expect(component.isStep('file')).toBe(true);
    expect(component.canPreview()).toBe(false);
  });

  it('targets the project passed in the route', () => {
    const component = componentOf('p1');
    expect(component.projectId()).toBe('p1');
    expect(component.isNewProject()).toBe(false);
    expect(component.targetName()).toBe('Jacaranda Close');
  });

  it('requires a project name for a new project', () => {
    const component = componentOf();
    component.file.set(sheet);
    expect(component.isNewProject()).toBe(true);
    expect(component.canPreview()).toBe(false);

    component.name.set('Jacaranda Close');
    expect(component.canPreview()).toBe(true);
  });

  it('moves to review after a successful preview', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);

    await component.preview();

    expect(previewCalls.length).toBe(1);
    expect(component.isStep('review')).toBe(true);
    expect(component.report()?.project_name).toBe('Jacaranda Close');
  });

  it('stays on the file step when the preview fails', async () => {
    const component = componentOf('p1', null);
    component.file.set(sheet);
    failure = 'No sheet in that file looks like a budget';

    await component.preview();

    expect(component.isStep('file')).toBe(true);
    expect(component.report()).toBeNull();
  });

  it('offers two choices for a decision and marks the current one', () => {
    const component = componentOf('p1');
    const answer = decision('duplicates', { count: 3, detail: 'already here' });

    expect(component.choicesFor(answer).map((choice) => choice.label)).toEqual([
      'Skip them',
      'Import them again',
    ]);
    expect(component.answerFor(answer)).toBe('yes');
    expect(component.consequenceFor(answer)).toContain('not duplicated');
  });

  it('sets the option to the selected choice', () => {
    const component = componentOf('p1');
    const answer = decision('new_categories', { count: 6, detail: 'six categories' });

    component.answer(answer, 'yes');
    expect(component.createMissingCategories()).toBe(true);

    component.answer(answer, 'no');
    expect(component.createMissingCategories()).toBe(false);
    expect(component.consequenceFor(answer)).toContain('No budget is imported');

    component.answer(answer, 'no');
    expect(component.createMissingCategories()).toBe(false);
  });

  it('creates missing categories by default', () => {
    const component = componentOf('p1');
    expect(component.createMissingCategories()).toBe(true);
    expect(component.answerFor({ kind: 'new_categories', count: 6, detail: '', amount: 0 })).toBe(
      'yes',
    );
  });

  it('shows no choices for informational decisions', () => {
    const component = componentOf('p1');
    expect(component.hasAnswer(decision('outstanding_not_importable', { count: 2 }))).toBe(false);
  });

  it('blocks the import while a blocking decision is present', async () => {
    const component = componentOf(
      'p1',
      report({
        decisions: [
          decision('above_any_category', {
            count: 2,
            detail: 'sit above every category',
            blocking: true,
          }),
        ],
      }),
    );
    component.file.set(sheet);
    await component.preview();

    expect(component.blocking()).toBe(true);
  });

  it('sends every import option and moves to done', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.preview();
    component.includeUnpaid.set(false);
    component.multipleCodes.set('uncategorised');

    await component.runImport();

    expect(importCalls[0][2]).toEqual({
      createMissingCategories: true,
      skipDuplicates: true,
      includeUnpaid: false,
      multipleCodes: 'uncategorised',
    });
    expect(component.isStep('done')).toBe(true);
    expect(component.result()?.category_count).toBe(6);
  });

  it('opens the imported project', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.preview();
    await component.runImport();

    component.openProject();

    expect(navigations[0][0]).toEqual(['/projects', 'p1']);
  });

  it('clears the report when the file is cleared', async () => {
    const component = componentOf('p1');
    component.file.set(sheet);
    await component.preview();

    component.clearFile();

    expect(component.file()).toBeNull();
    expect(component.report()).toBeNull();
  });

  it('lists the import templates', () => {
    const component = componentOf();

    expect(component.templates.map((template) => template.kind)).toEqual([
      'blank',
      'example',
      'budget-csv',
      'spending-csv',
    ]);
    expect(component.templateUrl('example')).toBe('/api/import/sample?kind=example');
  });

  it('offers choices for every decision that takes an option', () => {
    const component = componentOf('p1');
    const kinds = ['new_categories', 'duplicates', 'unpaid', 'several_codes'] as Decision['kind'][];

    for (const kind of kinds) {
      const answer = decision(kind);
      expect(component.hasAnswer(answer)).toBe(true);
      expect(component.choicesFor(answer).length).toBe(2);
      expect(component.consequenceFor(answer).length).toBeGreaterThan(0);
    }
  });

  it('excludes unpaid rows when No is selected', () => {
    const component = componentOf('p1');
    const answer = decision('unpaid', { count: 2 });

    expect(component.answerFor(answer)).toBe('yes');
    component.answer(answer, 'no');
    expect(component.includeUnpaid()).toBe(false);
  });
});
