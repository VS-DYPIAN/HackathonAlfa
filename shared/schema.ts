import { z } from "zod";

export const Role = {
  ADMIN: "admin",
  EMPLOYEE: "employee",
  VENDOR: "vendor",
} as const;

export type RoleType = typeof Role[keyof typeof Role];

export const userSchema = z.object({
  id: z.number(),
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum([Role.ADMIN, Role.EMPLOYEE, Role.VENDOR]),
  walletBalance: z.number().default(0),
});

export const insertUserSchema = userSchema.omit({ id: true });

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const transactionSchema = z.object({
  id: z.number(),
  employeeId: z.number(),
  vendorId: z.number(),
  amount: z.number(),
  timestamp: z.date(),
  status: z.string(),
  employeeName: z.string().optional(),
  vendorName: z.string().optional()
});

export const insertTransactionSchema = transactionSchema.omit({ id: true });

export type Transaction = z.infer<typeof transactionSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;