import type { Request, Response, NextFunction } from "express";
import { unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { ShipperService } from "../services/shipper.service.js";
import { ShipperRepository } from "../repositories/shipper.repository.js";
import type { ListShippersQuery } from "../dto/index.js";

const repo = new ShipperRepository();
const service = new ShipperService(repo);

type MulterFile = { path?: string; originalname: string; mimetype?: string };

function parseListQuery(req: Request): ListShippersQuery {
  return {
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  };
}

/* ───────── shippers ───────── */

export async function listShippers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await service.listShippers(parseListQuery(req));
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function listShippersMaster(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await service.listShippersMaster(parseListQuery(req));
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function getShipperById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.getShipperById(req.params.id);
    if (!row) {
      sendError(res, "Shipper not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function createShipper(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createShipper(req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateShipper(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updateShipper(req.params.id, req.body);
    if (!row) {
      sendError(res, "Shipper not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removeShipper(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeleteShipper(req.params.id);
    if (!row) {
      sendError(res, "Shipper not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}

/* ───────── plants ───────── */

export async function listPlants(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await service.listPlants(req.params.id);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function createPlant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createPlant(req.params.id, req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updatePlant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updatePlant(req.params.plantId, req.body);
    if (!row) {
      sendError(res, "Plant not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removePlant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeletePlant(req.params.plantId);
    if (!row) {
      sendError(res, "Plant not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}

/* ───────── loadports ───────── */

export async function listLoadports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await service.listLoadports(req.params.id);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

export async function createLoadport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.createLoadport(req.params.id, req.body);
    sendSuccess(res, row, { statusCode: 201 });
  } catch (err) {
    next(err);
  }
}

export async function updateLoadport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.updateLoadport(req.params.lpId, req.body);
    if (!row) {
      sendError(res, "Load port not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

export async function removeLoadport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.softDeleteLoadport(req.params.lpId);
    if (!row) {
      sendError(res, "Load port not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Deleted" });
  } catch (err) {
    next(err);
  }
}

/* ───────── document header ───────── */

export async function uploadDocumentHeader(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipperId = req.params.id as string;
  const file = (req as Request & { file?: MulterFile }).file;
  const tempPath = file?.path;

  if (!tempPath) {
    sendError(res, "File is required (field name: file)", { statusCode: 400 });
    return;
  }

  try {
    const row = await service.uploadDocumentHeader(
      shipperId,
      tempPath,
      file.originalname || "header.png",
      file.mimetype,
    );
    sendSuccess(res, row, { message: "Document header uploaded", statusCode: 201 });
  } catch (err) {
    next(err);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function downloadDocumentHeader(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { stream, fileName, mimeType } = await service.getDocumentHeaderStream(req.params.id as string);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function removeDocumentHeader(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await service.removeDocumentHeader(req.params.id as string);
    sendSuccess(res, row, { message: "Document header removed" });
  } catch (err) {
    next(err);
  }
}
