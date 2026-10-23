import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { DeliveryRead, ProjectRead } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { DeliveryService } from './delivery.service';

@Component({
  selector: 'app-deliveries',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, ToggleComponent],
  templateUrl: './deliveries.component.html',
  styleUrl: './deliveries.component.scss',
})
export class DeliveriesComponent {
  readonly project = input.required<ProjectRead>();

  readonly deliveries = inject(DeliveryService);
  private readonly toast = inject(ToastService);

  readonly outstandingPage = signal(1);
  readonly receivedPage = signal(1);
  readonly includeArchived = signal(false);

  readonly editing = signal<string | null>(null);
  readonly editDescription = signal('');
  readonly editExpected = signal('');
  readonly lastArchived = signal<DeliveryRead | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');

  readonly outstandingList = computed(() => this.deliveries.outstanding(this.project().id));
  readonly receivedList = computed(() => this.deliveries.received(this.project().id));

  readonly outstandingRows = computed(() => this.outstandingList().rows);
  readonly receivedRows = computed(() => this.receivedList().rows);

  readonly outstandingSummary = computed(() => {
    const list = this.outstandingList();
    if (this.includeArchived()) {
      return `${this.money(list.outstandingAmount)} outstanding, excluding archived items.`;
    }
    if (list.total === 0) {
      return 'All paid items have been received.';
    }
    const noun = list.total === 1 ? 'item' : 'items';
    return `${list.total} ${noun} outstanding, ${this.money(list.outstandingAmount)} paid.`;
  });

  constructor() {
    queueMicrotask(() => void this.refresh());
  }

  async goToOutstanding(page: number): Promise<void> {
    this.outstandingPage.set(page);
    await this.deliveries.loadOutstanding(this.project().id, page, this.includeArchived());
  }

  async goToReceived(page: number): Promise<void> {
    this.receivedPage.set(page);
    await this.deliveries.loadReceived(this.project().id, page, this.includeArchived());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    this.cancelEdit();
    this.outstandingPage.set(1);
    this.receivedPage.set(1);
    await this.refresh();
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  vendorName(delivery: DeliveryRead): string {
    return delivery.vendor_name ?? 'vendor not recorded';
  }

  paidOn(delivery: DeliveryRead): string {
    return new Date(delivery.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  receivedOn(delivery: DeliveryRead): string {
    if (!delivery.received_at) {
      return '';
    }
    return new Date(delivery.received_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatExpected(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  outstandingDetail(delivery: DeliveryRead): string {
    const paid = `Paid ${this.paidOn(delivery)}`;
    return delivery.expected
      ? `${paid} · expected ${this.formatExpected(delivery.expected)}`
      : paid;
  }

  requestDelete(id: string): void {
    this.pendingDelete.set(id);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return this.deleteConfirmationText().trim() === 'DELETE';
  }

  async deletePermanently(delivery: DeliveryRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.deliveries.delete(delivery.id);
    this.cancelDelete();
    await this.refresh();
    this.toast.show(`${delivery.description} deleted permanently.`);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  startEdit(delivery: DeliveryRead): void {
    this.editing.set(delivery.id);
    this.editDescription.set(delivery.description);
    this.editExpected.set(delivery.expected ?? '');
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.editDescription.set('');
    this.editExpected.set('');
  }

  canSaveEdit(): boolean {
    return this.editDescription().trim().length > 0;
  }

  async saveEdit(delivery: DeliveryRead): Promise<void> {
    if (!this.canSaveEdit()) {
      return;
    }
    const expected = this.editExpected().trim();
    const changed = await this.deliveries.update(delivery.id, {
      description: this.editDescription().trim(),
      expected: expected.length > 0 ? expected : null,
    });
    if (!changed) {
      this.toast.show(this.deliveries.error() ?? 'Could not update the delivery.', 'error');
      return;
    }
    this.cancelEdit();
    this.toast.show(`${changed.description} updated.`);
  }

  async markReceived(delivery: DeliveryRead): Promise<void> {
    await this.deliveries.markReceived(delivery.id);
    await this.refresh();
    this.toast.show(`${delivery.description} marked received.`);
  }

  async markOutstanding(delivery: DeliveryRead): Promise<void> {
    await this.deliveries.markOutstanding(delivery.id);
    await this.refresh();
    this.toast.show(`${delivery.description} marked outstanding.`);
  }

  async archive(delivery: DeliveryRead): Promise<void> {
    await this.deliveries.archive(delivery.id);
    this.lastArchived.set(delivery);
    await this.refresh();
    this.toast.show(`${delivery.description} archived. The expense is unchanged.`);
  }

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.restore(archived);
  }

  async restore(delivery: DeliveryRead): Promise<void> {
    const restored = await this.deliveries.restore(delivery.id);
    this.lastArchived.set(null);
    if (!restored) {
      this.toast.show(this.deliveries.error() ?? 'Could not restore that delivery.', 'error');
      return;
    }
    await this.refresh();
    this.toast.show(`${restored.description} restored.`);
  }

  private async refresh(): Promise<void> {
    const projectId = this.project().id;
    const includeArchived = this.includeArchived();
    await Promise.all([
      this.deliveries.loadOutstanding(projectId, this.outstandingPage(), includeArchived),
      this.deliveries.loadReceived(projectId, this.receivedPage(), includeArchived),
    ]);
  }
}
