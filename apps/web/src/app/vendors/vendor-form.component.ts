import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { VendorService } from './vendor.service';

@Component({
  selector: 'app-vendor-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './vendor-form.component.html',
  styleUrl: './vendor-form.component.scss',
})
export class VendorFormComponent {
  readonly vendors = inject(VendorService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly pageTitle = inject(Title);

  readonly id = input('');

  readonly loading = signal(false);
  readonly name = signal('');
  readonly trade = signal('');
  readonly contactName = signal('');
  readonly phone = signal('');
  readonly email = signal('');
  readonly notes = signal('');

  constructor() {
    effect(() => {
      this.id();
      void this.load();
    });
    effect(() => {
      const name = this.name();
      if (this.isEdit() && name) {
        this.pageTitle.setTitle(`Edit ${name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    if (!this.isEdit()) {
      return;
    }
    this.loading.set(true);
    const vendor = await this.vendors.get(this.id());
    if (vendor) {
      this.name.set(vendor.name);
      this.trade.set(vendor.trade ?? '');
      this.contactName.set(vendor.contact_name ?? '');
      this.phone.set(vendor.phone ?? '');
      this.email.set(vendor.email ?? '');
      this.notes.set(vendor.notes ?? '');
    }
    this.loading.set(false);
  }

  isEdit(): boolean {
    return this.id().length > 0;
  }

  title(): string {
    return this.isEdit() ? 'Edit Vendor' : 'New Vendor';
  }

  subtitle(): string {
    return this.isEdit()
      ? 'Changing a vendor here changes them on every project.'
      : 'A name is enough. Everything else can be filled in later.';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  isValid(): boolean {
    return this.name().trim().length > 0;
  }

  cancel(): void {
    void this.router.navigate(this.isEdit() ? ['/vendors', this.id()] : ['/vendors']);
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    const body = {
      name: this.name().trim(),
      trade: this.trade().trim() || null,
      contact_name: this.contactName().trim() || null,
      phone: this.phone().trim() || null,
      email: this.email().trim() || null,
      notes: this.notes().trim() || null,
    };
    const saved = this.isEdit()
      ? await this.vendors.edit(this.id(), body)
      : await this.vendors.add(body);

    if (saved) {
      this.toast.show(this.isEdit() ? 'Vendor saved.' : `${saved.name} added.`);
      void this.router.navigate(['/vendors', saved.id]);
    } else {
      this.toast.show(this.vendors.error() ?? 'Could not save that vendor.', 'error');
    }
  }
}
