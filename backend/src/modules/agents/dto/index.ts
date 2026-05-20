export interface AgentRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentDto {
  name: string;
}

export interface UpdateAgentDto {
  name: string;
}

export interface ListAgentsQuery {
  search?: string;
}
