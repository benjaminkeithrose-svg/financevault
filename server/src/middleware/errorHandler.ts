import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { ZodError } from "zod";

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Raised by a route to send a specific status with a plain-English message. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** "purchasePrice" -> "Purchase price", "tenancies.0.rent" -> "Tenancies 1 rent". */
function fieldLabel(path: (string | number)[]): string {
  if (path.length === 0) return "";
  const words = path
    .map((part) => (typeof part === "number" ? String(part + 1) : part.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()))
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function zodMessage(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const label = fieldLabel(issue.path);
      const message = issue.code === "invalid_type" && issue.received === "undefined" ? "is required" : issue.message.toLowerCase();
      return label ? `${label} ${message}` : issue.message;
    })
    .join("; ");
}

type Mapped = { status: number; message: string; log?: boolean };

/**
 * Turns what went wrong into something a person can act on. Library errors
 * carry internals (query text, constraint names, stack-ish detail) that mean
 * nothing on screen, so each known kind is mapped to a status and a plain
 * message, and only truly unexpected errors are logged in full.
 */
function mapError(err: unknown): Mapped {
  if (err instanceof HttpError) return { status: err.status, message: err.message };
  if (err instanceof ZodError) return { status: 400, message: zodMessage(err) };
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025":
      case "P2001":
      case "P2015":
        return { status: 404, message: "That record doesn't exist — it may already have been deleted." };
      case "P2003":
        return {
          status: 409,
          message: "This can't be deleted or changed because other records still point to it. Remove or reassign those first.",
        };
      case "P2002":
        return { status: 409, message: "A record with those details already exists." };
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, message: "Some of the information sent wasn't in the expected format.", log: true };
  }
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return { status: 413, message: "That file is too large to upload." };
    return { status: 400, message: `The upload couldn't be read (${err.message.toLowerCase()}).` };
  }
  // express.json() rejects malformed bodies with a SyntaxError carrying a status.
  if (err instanceof SyntaxError && (err as { status?: number }).status === 400) {
    return { status: 400, message: "The request body wasn't valid JSON." };
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return { status, message: err instanceof Error ? err.message : "Request could not be processed." };
  }
  return { status: 500, message: "Something went wrong on our side. The details have been written to the server log.", log: true };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const mapped = mapError(err);
  if (mapped.log) console.error(err);
  if (res.headersSent) return;
  res.status(mapped.status).json({ error: mapped.message });
}

/** JSON rather than Express's HTML page for API paths that don't exist. */
export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({ error: `No such API endpoint: ${req.method} ${req.path}` });
}
