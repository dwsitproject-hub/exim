import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { AgentService } from "../services/agent.service.js";
import { AgentRepository } from "../repositories/agent.repository.js";
import type { ListAgentsQuery } from "../dto/index.js";

const repo = new AgentRepository();
const service = new AgentService(repo);

export async function listAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query: ListAgentsQuery = {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    };
    const rows = await service.listAgents(query);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getAgentById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.getAgentById(req.params.id);
    if (!row) {
      sendError(res, "Agent not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createAgent(req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updateAgent(req.params.id, req.body);
    if (!row) {
      sendError(res, "Agent not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removeAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeleteAgent(req.params.id);
    if (!row) {
      sendError(res, "Agent not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}
