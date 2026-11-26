import { Pipe, type PipeTransform } from '@angular/core';

export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Writes a count with its noun, such as "1 category" or "3 categories". */
@Pipe({ name: 'count', standalone: true })
export class CountPipe implements PipeTransform {
  transform(count: number, singular: string, plural?: string): string {
    return counted(count, singular, plural);
  }
}
