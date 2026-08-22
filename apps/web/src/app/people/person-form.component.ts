import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { PersonService } from './person.service';

@Component({
  selector: 'app-person-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './person-form.component.html',
  styleUrl: './person-form.component.scss',
})
export class PersonFormComponent {
  readonly people = inject(PersonService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly pageTitle = inject(Title);

  readonly id = input('');

  readonly loading = signal(false);
  readonly name = signal('');
  readonly role = signal('');
  readonly phone = signal('');
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
    const person = await this.people.get(this.id());
    if (person) {
      this.name.set(person.name);
      this.role.set(person.role ?? '');
      this.phone.set(person.phone ?? '');
      this.notes.set(person.notes ?? '');
    }
    this.loading.set(false);
  }

  isEdit(): boolean {
    return this.id().length > 0;
  }

  title(): string {
    return this.isEdit() ? 'Edit' : 'Add Someone';
  }

  subtitle(): string {
    return this.isEdit()
      ? 'Changing somebody here changes them on every project.'
      : 'A name is enough. Everything else can be filled in later.';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  isValid(): boolean {
    return this.name().trim().length > 0;
  }

  cancel(): void {
    void this.router.navigate(this.isEdit() ? ['/people', this.id()] : ['/people']);
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    const body = {
      name: this.name().trim(),
      role: this.role().trim() || null,
      phone: this.phone().trim() || null,
      notes: this.notes().trim() || null,
    };
    const saved = this.isEdit()
      ? await this.people.edit(this.id(), body)
      : await this.people.add(body);

    if (saved) {
      this.toast.show(this.isEdit() ? 'Saved.' : `${saved.name} added.`);
      void this.router.navigate(['/people', saved.id]);
    } else {
      this.toast.show(this.people.error() ?? 'Could not save that person.', 'error');
    }
  }
}
