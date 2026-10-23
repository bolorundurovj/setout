import { TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  function render(total: number, page = 1, noun = '') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PaginationComponent] });
    const fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('noun', noun);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the visible row range', () => {
    expect(render(47, 3, 'expenses').componentInstance.countLabel()).toBe('21-30 of 47 expenses');
  });

  it('shows All N when the rows fit on one page', () => {
    expect(render(7, 1, 'items').componentInstance.countLabel()).toBe('All 7 items');
  });

  it('ends the range at the total on a short last page', () => {
    expect(render(23, 3).componentInstance.countLabel()).toBe('21-23 of 23');
  });

  it('shows a message for zero rows', () => {
    expect(render(0).componentInstance.countLabel()).toBe('No results');
  });

  it('hides the controls when there is only one page', () => {
    const element = render(7).nativeElement as HTMLElement;
    expect(element.querySelector('nav')).toBeNull();
    expect(render(11).nativeElement.querySelector('nav')).toBeTruthy();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const first = render(47, 1).nativeElement as HTMLElement;
    const steps = first.querySelectorAll<HTMLButtonElement>('.prev-next');
    expect(steps[0].disabled).toBe(true);
    expect(steps[1].disabled).toBe(false);

    const last = render(47, 5).nativeElement as HTMLElement;
    const ends = last.querySelectorAll<HTMLButtonElement>('.prev-next');
    expect(ends[0].disabled).toBe(false);
    expect(ends[1].disabled).toBe(true);
  });

  it('sets aria-current on the current page', () => {
    const element = render(47, 3).nativeElement as HTMLElement;
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
  });

  it('emits pageChange only for a different page', () => {
    const fixture = render(47, 3);
    const asked: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => asked.push(page));

    fixture.componentInstance.goToPage(4);
    fixture.componentInstance.goToPage(3);
    fixture.componentInstance.goToPage(99);

    expect(asked).toEqual([4, 5]);
  });
});
