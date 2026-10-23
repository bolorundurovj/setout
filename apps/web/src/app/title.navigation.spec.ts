import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, RouterOutlet, TitleStrategy, provideRouter } from '@angular/router';
import { SetoutTitleStrategy } from './title.strategy';

const record = signal<{ name: string } | null>(null);

@Component({
  standalone: true,
  template: '<p>{{ record()?.name }}</p>',
})
class RecordPage {
  readonly record = record;
}

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class Shell {}

describe('the page title through a real navigation', () => {
  async function go(url: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([
          { path: 'vendors', component: RecordPage, title: 'Vendors' },
          { path: 'vendors/:id', component: RecordPage, title: 'Vendor' },
        ]),
        { provide: TitleStrategy, useClass: SetoutTitleStrategy },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the route title before the record loads', async () => {
    record.set(null);
    await go('/vendors/v1');
    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });

  it('keeps a title the page sets after the strategy runs', async () => {
    record.set(null);
    const fixture = await go('/vendors/v1');

    TestBed.inject(Title).setTitle('Corner Depot Cement · Setout');
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe('Corner Depot Cement · Setout');
  });

  it('restores the route title on the next navigation', async () => {
    record.set(null);
    const fixture = await go('/vendors/v1');
    TestBed.inject(Title).setTitle('Corner Depot Cement · Setout');

    await TestBed.inject(Router).navigateByUrl('/vendors/v2');
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });
});
