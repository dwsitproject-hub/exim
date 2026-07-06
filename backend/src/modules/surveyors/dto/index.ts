export interface SurveyorRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSurveyorDto {
  name: string;
}

export interface UpdateSurveyorDto {
  name: string;
}

export interface ListSurveyorsQuery {
  search?: string;
}
