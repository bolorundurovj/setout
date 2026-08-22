import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import {
  Router,
  RouterOutlet,
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import type { VendorRead } from '@setout/api-client';
import { DeliveryService } from '../deliveries/delivery.service';
import { SetoutTitleStrategy } from '../title.strategy';
import { ToastService } from '../toast.service';
import { VendorDetailComponent } from './vendor-detail.component';
import { VendorService } from './vendor.service';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class Shell {}

function vendor(id: string, name: string): VendorRead {
  return {
    id,
    name,
    trade: 'cement',
    contact_name: null,
    phone: null,
    email: null,
    notes: null,
    expense_count: 0,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('the vendor page title, reached by navigating', () => {
  function setUp() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter(
          [{ path: 'vendors/:id', component: VendorDetailComponent, title: 'Vendor' }],
          withComponentInputBinding(),
        ),
        { provide: TitleStrategy, useClass: SetoutTitleStrategy },
        {
          provide: VendorService,
          useValue: {
            error: () => null,
            get: async (id: string) =>
              vendor(id, id === 'v1' ? 'Corner Depot Cement' : 'Riverside Sawmill'),
            spend: async () => null,
            agreements: async () => [],
          },
        },
        {
          provide: DeliveryService,
          useValue: {
            error: () => null,
            forVendor: () => ({ rows: [], total: 0, owed: 0 }),
            loadForVendor: async () => undefined,
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ReturnType<typeof setUp>) {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  it('names the vendor once it has loaded', async () => {
    const fixture = setUp();
    await TestBed.inject(Router).navigateByUrl('/vendors/v1');
    await settle(fixture);

    expect(TestBed.inject(Title).getTitle()).toBe('Corner Depot Cement · Setout');
  });

  it('follows a move from one vendor straight to another', async () => {
    const fixture = setUp();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/vendors/v1');
    await settle(fixture);

    await router.navigateByUrl('/vendors/v2');
    await settle(fixture);

    expect(TestBed.inject(Title).getTitle()).toBe('Riverside Sawmill · Setout');
  });
});
