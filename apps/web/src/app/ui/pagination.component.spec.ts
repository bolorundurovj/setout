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

  it('says which rows are on show', () => {
    expect(render(47, 3, 'expenses').componentInstance.countLabel()).toBe('21-30 of 47 expenses');
  });

  it('says it is showing all of them when they fit on one page', () => {
    expect(render(7, 1, 'items').componentInstance.countLabel()).toBe('All 7 items');
  });

  it('does not count a last page that runs short as full', () => {
    expect(render(23, 3).componentInstance.countLabel()).toBe('21-23 of 23');
  });

  it('has something to say with nothing to show', () => {
    expect(render(0).componentInstance.countLabel()).toBe('Nothing to show');
  });

  it('hides the controls when there is only one page', () => {
    const element = render(7).nativeElement as HTMLElement;
    expect(element.querySelector('nav')).toBeNull();
    expect(render(11).nativeElement.querySelector('nav')).toBeTruthy();
  });

  it('stops Previous on the first page and Next on the last', () => {
    const first = render(47, 1).nativeElement as HTMLElement;
    const steps = first.querySelectorAll<HTMLButtonElement>('.step');
    expect(steps[0].disabled).toBe(true);
    expect(steps[1].disabled).toBe(false);

    const last = render(47, 5).nativeElement as HTMLElement;
    const ends = last.querySelectorAll<HTMLButtonElement>('.step');
    expect(ends[0].disabled).toBe(false);
    expect(ends[1].disabled).toBe(true);
  });

  it('marks the page being read for a screen reader', () => {
    const element = render(47, 3).nativeElement as HTMLElement;
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
  });

  it('asks for a page only when it is a different one', () => {
    const fixture = render(47, 3);
    const asked: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => asked.push(page));

    fixture.componentInstance.go(4);
    fixture.componentInstance.go(3);
    fixture.componentInstance.go(99);

    expect(asked).toEqual([4, 5]);
  });
});
