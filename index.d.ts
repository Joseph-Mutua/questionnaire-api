import express from "express";
declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: number;
        email: string;
        password: string;
      };
    }
  }
}