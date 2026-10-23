import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { SetoutTitleStrategy } from './title.strategy';

describe('SetoutTitleStrategy', () => {
  function strategyWith(page: string | undefined) {
    const strategy = TestBed.inject(SetoutTitleStrategy);
    strategy.buildTitle = () => page;
    return strategy;
  }

  it('appends the app name to the page title', () => {
    strategyWith('Projects').updateTitle({} as RouterStateSnapshot);
    expect(TestBed.inject(Title).getTitle()).toBe('Projects · Setout');
  });

  it('uses the app name alone when the route has no title', () => {
    strategyWith(undefined).updateTitle({} as RouterStateSnapshot);
    expect(TestBed.inject(Title).getTitle()).toBe('Setout');
  });
});
