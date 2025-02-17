import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@shared/schema";
import { format } from "date-fns";

export default function PaymentSuccess() {
  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ["/api/employee/transactions"],
    queryFn: async () => {
      const res = await fetch("/api/employee/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  // Get the latest transaction
  const latestTransaction = transactions?.length
    ? [...transactions].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )[0]
    : null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-green-50">
      <Card className="w-full max-w-md mx-4 shadow-lg rounded-lg">
        <CardContent className="pt-6 text-center">
          <div className="flex mb-4 justify-center">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>

          {latestTransaction ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">
                    Amount: ₹{latestTransaction.amount}
                  </p>
                  <p className="font-medium">
                    Transaction ID: {latestTransaction.id}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(
                      new Date(latestTransaction.timestamp),
                      "MMM d, yyyy h:mm a",
                    )}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-full text-sm bg-green-100 text-green-800">
                  {latestTransaction.status}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">
              No transactions yet
            </p>
          )}

          <h1 className="text-3xl font-semibold text-green-800">
            Payment Successful!
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Your payment has been successfully processed. Thank you for your
            transaction.
          </p>

          <div className="mt-6 space-y-3">
            <Button
              variant="outline"
              className="w-full py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-md"
              onClick={() => (window.location.href = "/")}
            >
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
