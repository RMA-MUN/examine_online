export interface ScoreExportOptionItem {
  id: number;
  name: string;
}

export interface ScoreExportOptions {
  classes: ScoreExportOptionItem[];
  courses: ScoreExportOptionItem[];
}
