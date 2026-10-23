import { Injectable, computed, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  AdvanceCreate,
  AdvanceRead,
  AgreementCreate,
  AgreementRead,
  Api,
  ExpenseRead,
  PersonBalance,
  AdvanceUpdate,
  AgreementUpdate,
  archiveAdvance,
  archiveAgreement,
  createAdvance,
  createAgreement,
  listAdvances,
  listAgreements,
  listBalances,
  listExpenses,
  restoreAdvance,
  restoreAgreement,
  updateAdvance,
  updateAgreement,
} from '@setout/api-client';
import { CHOICE_LIMIT, PAGE_SIZE, SCROLL_SIZE, offsetOf } from '../ui/paging';

@Injectable({
  providedIn: 'root',
})
export class AgreementService {
  private readonly api = inject(Api);

  private readonly agreementState = signal<AgreementRead[]>([]);
  private readonly advanceState = signal<AdvanceRead[]>([]);
  private readonly balanceState = signal<PersonBalance[]>([]);
  private readonly paymentState = signal<Record<string, ExpenseRead[]>>({});
  private readonly agreementTotalState = signal(0);
  private readonly advanceTotalState = signal(0);
  private readonly advancePageState = signal(1);
  private readonly loadedProjectId = signal('');
  private readonly includeArchivedState = signal(false);

  readonly agreements = this.agreementState.asReadonly();
  readonly advances = this.advanceState.asReadonly();
  readonly balances = this.balanceState.asReadonly();
  readonly payments = this.paymentState.asReadonly();
  readonly agreementTotal = this.agreementTotalState.asReadonly();
  readonly advanceTotal = this.advanceTotalState.asReadonly();
  readonly advancePage = this.advancePageState.asReadonly();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** State is cached per project and cleared when a different project is requested. */
  private resetForProject(projectId: string): void {
    if (this.loadedProjectId() === projectId) {
      return;
    }
    this.loadedProjectId.set(projectId);
    this.agreementState.set([]);
    this.advanceState.set([]);
    this.balanceState.set([]);
    this.paymentState.set({});
    this.agreementTotalState.set(0);
    this.advanceTotalState.set(0);
    this.advancePageState.set(1);
  }

  readonly hasMore = computed(() => this.agreementState().length < this.agreementTotalState());

  readonly agreedTotal = computed(() =>
    this.agreementState().reduce((total, row) => total + row.agreed_amount, 0),
  );
  readonly balanceTotal = computed(() =>
    this.agreementState().reduce((total, row) => total + row.balance_amount, 0),
  );

  async load(projectId: string): Promise<void> {
    this.resetForProject(projectId);
    this.error.set(null);
    try {
      const page = await this.api.invoke(listAgreements, {
        project_id: projectId,
        include_archived: this.includeArchivedState(),
        limit: SCROLL_SIZE,
        offset: 0,
      });
      this.agreementState.set(page.items);
      this.agreementTotalState.set(page.total);
    } catch {
      this.error.set('Could not load the agreements.');
    }
  }

  async loadMore(projectId: string): Promise<void> {
    this.resetForProject(projectId);
    if (!this.hasMore()) {
      return;
    }
    const page = await this.api.invoke(listAgreements, {
      project_id: projectId,
      include_archived: this.includeArchivedState(),
      limit: SCROLL_SIZE,
      offset: this.agreementState().length,
    });
    this.agreementState.update((rows) => [...rows, ...page.items]);
    this.agreementTotalState.set(page.total);
    await this.loadPayments(projectId);
  }

  async loadPayments(projectId: string): Promise<void> {
    this.resetForProject(projectId);
    const byAgreement: Record<string, ExpenseRead[]> = {};
    try {
      for (let offset = 0; ;) {
        const page = await this.api.invoke(listExpenses, {
          project_id: projectId,
          agreement_only: true,
          limit: CHOICE_LIMIT,
          offset,
        });
        for (const row of page.items) {
          if (row.agreement_id) {
            (byAgreement[row.agreement_id] ??= []).push(row);
          }
        }
        offset += page.items.length;
        if (page.items.length === 0 || offset >= page.total) {
          break;
        }
      }
    } catch {
      this.error.set('Could not load payments.');
    }
    this.paymentState.set(byAgreement);
  }

  async loadAll(projectId: string, includeArchived = false): Promise<void> {
    this.resetForProject(projectId);
    this.includeArchivedState.set(includeArchived);
    await this.load(projectId);
    await this.loadPayments(projectId);
  }

  async loadAdvances(projectId: string, page = 1): Promise<void> {
    this.resetForProject(projectId);
    try {
      const rows = await this.api.invoke(listAdvances, {
        project_id: projectId,
        include_archived: this.includeArchivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.advanceState.set(rows.items);
      this.advanceTotalState.set(rows.total);
      this.advancePageState.set(page);
    } catch {
      this.advanceState.set([]);
    }
  }

  async loadBalances(projectId: string): Promise<void> {
    this.resetForProject(projectId);
    try {
      this.balanceState.set(await this.api.invoke(listBalances, { project_id: projectId }));
    } catch {
      this.balanceState.set([]);
    }
  }

  async create(projectId: string, body: AgreementCreate): Promise<AgreementRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createAgreement, { project_id: projectId, body });
      this.agreementState.update((rows) => [created, ...rows]);
      this.agreementTotalState.update((total) => total + 1);
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the agreement.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(agreementId: string, body: AgreementUpdate): Promise<AgreementRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const changed = await this.api.invoke(updateAgreement, {
        agreement_id: agreementId,
        body,
      });
      this.agreementState.update((rows) =>
        rows.map((row) => (row.id === agreementId ? changed : row)),
      );
      return changed;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not update the agreement.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(agreementId: string): Promise<void> {
    await this.api.invoke(archiveAgreement, { agreement_id: agreementId });
    if (this.includeArchivedState()) {
      await this.load(this.loadedProjectId());
      return;
    }
    this.agreementState.update((rows) => rows.filter((row) => row.id !== agreementId));
    this.agreementTotalState.update((total) => Math.max(0, total - 1));
  }

  async restore(agreementId: string): Promise<AgreementRead | null> {
    this.error.set(null);
    try {
      const restored = await this.api.invoke(restoreAgreement, { agreement_id: agreementId });
      this.agreementState.update((rows) =>
        rows.map((row) => (row.id === agreementId ? restored : row)),
      );
      return restored;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore that agreement.');
      return null;
    }
  }

  async createAdvance(projectId: string, body: AdvanceCreate): Promise<AdvanceRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createAdvance, { project_id: projectId, body });
      await this.loadAdvances(projectId, this.advancePageState());
      await this.loadBalances(projectId);
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the advance.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async editAdvance(
    projectId: string,
    advanceId: string,
    body: AdvanceUpdate,
  ): Promise<AdvanceRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const changed = await this.api.invoke(updateAdvance, { advance_id: advanceId, body });
      await this.loadAdvances(projectId, this.advancePageState());
      await this.loadBalances(projectId);
      return changed;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not update the advance.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archiveAdvance(projectId: string, advanceId: string): Promise<void> {
    await this.api.invoke(archiveAdvance, { advance_id: advanceId });
    const currentPage = this.advancePageState();
    await this.loadAdvances(projectId, currentPage);
    if (this.advanceState().length === 0 && currentPage > 1) {
      await this.loadAdvances(projectId, currentPage - 1);
    }
    await this.loadBalances(projectId);
  }

  async restoreAdvance(projectId: string, advanceId: string): Promise<AdvanceRead | null> {
    this.error.set(null);
    try {
      const restored = await this.api.invoke(restoreAdvance, { advance_id: advanceId });
      await this.loadAdvances(projectId, this.advancePageState());
      await this.loadBalances(projectId);
      return restored;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore that advance.');
      return null;
    }
  }
}
