import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { auth } from "@/middleware/auth";
import { z } from "zod";

const router = Router();

// Update employee balance
router.put("/employees/:employeeId/balance", auth, async (req, res) => {
  const { employeeId } = req.params;
  const { amount } = req.body;

  const schema = z.object({
    amount: z.number().min(0, "Amount must be non-negative"),
  });

  try {
    const parsedBody = schema.parse(req.body);
    const employee = await prisma.user.update({
      where: {
        id: parseInt(employeeId),
      },
      data: {
        walletBalance: {
          increment: parsedBody.amount,
        },
      },
    });

    res.status(200).json(employee);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Get all employees
router.get("/employees", auth, async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: {
        role: "employee",
      },
    });

    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
