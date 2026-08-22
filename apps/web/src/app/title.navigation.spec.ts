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

  it('shows the route placeholder before the record has loaded', async () => {
    record.set(null);
    await go('/vendors/v1');
    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });

  it('keeps a name a page set after the strategy has run', async () => {
    record.set(null);
    const fixture = await go('/vendors/v1');

    TestBed.inject(Title).setTitle('Corner Depot Cement · Setout');
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe('Corner Depot Cement · Setout');
  });

  it('puts the placeholder back when the next navigation starts', async () => {
    record.set(null);
    const fixture = await go('/vendors/v1');
    TestBed.inject(Title).setTitle('Corner Depot Cement · Setout');

    await TestBed.inject(Router).navigateByUrl('/vendors/v2');
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });
});
