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

  readonly waitingPage = signal(1);
  readonly arrivedPage = signal(1);
  readonly includeDeleted = signal(false);

  readonly editing = signal<string | null>(null);
  readonly editWhat = signal('');
  readonly editPromised = signal('');
  readonly justRemoved = signal<DeliveryRead | null>(null);

  readonly waitingSet = computed(() => this.deliveries.waiting(this.project().id));
  readonly arrivedSet = computed(() => this.deliveries.arrived(this.project().id));

  readonly waitingRows = computed(() => this.waitingSet().rows);
  readonly arrivedRows = computed(() => this.arrivedSet().rows);

  readonly owedNote = computed(() => {
    const set = this.waitingSet();
    if (this.includeDeleted()) {
      return `${this.money(set.owed)} still owed, deleted rows aside.`;
    }
    if (set.total === 0) {
      return 'Everything paid for has arrived.';
    }
    const things = set.total === 1 ? 'thing' : 'things';
    return `${set.total} ${things} owed, ${this.money(set.owed)} paid for.`;
  });

  constructor() {
    queueMicrotask(() => void this.refresh());
  }

  async goToWaiting(page: number): Promise<void> {
    this.waitingPage.set(page);
    await this.deliveries.loadWaiting(this.project().id, page, this.includeDeleted());
  }

  async goToArrived(page: number): Promise<void> {
    this.arrivedPage.set(page);
    await this.deliveries.loadArrived(this.project().id, page, this.includeDeleted());
  }

  async setIncludeDeleted(on: boolean): Promise<void> {
    this.includeDeleted.set(on);
    this.cancelEdit();
    this.waitingPage.set(1);
    this.arrivedPage.set(1);
    await this.refresh();
  }

  deletedLabel(): string {
    return this.includeDeleted() ? 'Hide deleted' : 'Show deleted';
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  vendorName(owed: DeliveryRead): string {
    return owed.vendor_name ?? 'vendor not recorded';
  }

  paidOn(owed: DeliveryRead): string {
    return new Date(owed.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  arrivedOn(owed: DeliveryRead): string {
    if (!owed.received_at) {
      return '';
    }
    return new Date(owed.received_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  waiting(owed: DeliveryRead): string {
    return owed.promised
      ? `Paid ${this.paidOn(owed)} · promised ${owed.promised}`
      : `Paid ${this.paidOn(owed)}`;
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  startEdit(owed: DeliveryRead): void {
    this.editing.set(owed.id);
    this.editWhat.set(owed.description);
    this.editPromised.set(owed.promised ?? '');
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.editWhat.set('');
    this.editPromised.set('');
  }

  canSaveEdit(): boolean {
    return this.editWhat().trim().length > 0;
  }

  async saveEdit(owed: DeliveryRead): Promise<void> {
    if (!this.canSaveEdit()) {
      return;
    }
    const promised = this.editPromised().trim();
    const changed = await this.deliveries.update(owed.id, {
      description: this.editWhat().trim(),
      promised: promised.length > 0 ? promised : null,
    });
    if (!changed) {
      this.toast.show(this.deliveries.error() ?? 'Could not change what is owed.', 'error');
      return;
    }
    this.cancelEdit();
    this.toast.show(`${changed.description} changed.`);
  }

  async markDelivered(owed: DeliveryRead): Promise<void> {
    await this.deliveries.receive(owed.id);
    await this.refresh();
    this.toast.show(`${owed.description} marked delivered.`);
  }

  async putBack(owed: DeliveryRead): Promise<void> {
    await this.deliveries.unreceive(owed.id);
    await this.refresh();
    this.toast.show(`${owed.description} is waiting again.`);
  }

  async remove(owed: DeliveryRead): Promise<void> {
    await this.deliveries.remove(owed.id);
    this.justRemoved.set(owed);
    await this.refresh();
    this.toast.show(`${owed.description} is no longer owed. The expense stands.`);
  }

  async putBackRemoved(): Promise<void> {
    const gone = this.justRemoved();
    if (!gone) {
      return;
    }
    await this.restore(gone);
  }

  async restore(owed: DeliveryRead): Promise<void> {
    const back = await this.deliveries.restore(owed.id);
    this.justRemoved.set(null);
    if (!back) {
      this.toast.show(this.deliveries.error() ?? 'Could not restore that delivery.', 'error');
      return;
    }
    await this.refresh();
    this.toast.show(`${back.description} restored.`);
  }

  private async refresh(): Promise<void> {
    const projectId = this.project().id;
    const removed = this.includeDeleted();
    await Promise.all([
      this.deliveries.loadWaiting(projectId, this.waitingPage(), removed),
      this.deliveries.loadArrived(projectId, this.arrivedPage(), removed),
    ]);
  }
}
