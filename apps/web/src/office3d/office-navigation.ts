export type Point = [number, number];
export type Destination = 'office' | 'coffee' | 'lounge' | 'terrace';

// Map coordinates refer to the 1536 × 1024 illustrated office.
export const destinations: Record<Destination, Point> = {
  office: [490, 310], coffee: [170, 560], lounge: [640, 755], terrace: [710, 910],
};

const junction: Point = [420, 650];
const approaches: Record<Destination, Point[]> = {
  office: [[420, 460], [450, 375], [530, 375], [530, 328]],
  coffee: [[340, 620], [180, 620]],
  lounge: [[450, 685], [690, 685], [690, 745]],
  terrace: [[450, 685], [650, 685], [650, 890]],
};

export function routeBetween(from: Destination, to: Destination): Point[] {
  if (from === to) return [];
  return [...approaches[from].slice().reverse(), junction, ...approaches[to], destinations[to]].map(point => [...point]);
}
