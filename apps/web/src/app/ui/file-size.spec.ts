import { fileSize } from './file-size';

describe('fileSize', () => {
  it('counts small files in bytes', () => {
    expect(fileSize(0)).toBe('0 bytes');
    expect(fileSize(1)).toBe('1 byte');
    expect(fileSize(512)).toBe('512 bytes');
  });

  it('uses decimal units with one decimal place below ten', () => {
    expect(fileSize(2_000)).toBe('2 KB');
    expect(fileSize(2_450)).toBe('2.5 KB');
    expect(fileSize(1_250_000)).toBe('1.3 MB');
    expect(fileSize(25_000_000)).toBe('25 MB');
    expect(fileSize(3_200_000_000)).toBe('3.2 GB');
  });
});
