import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Role, Transaction } from "@shared/schema";
import { Download } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { format, isToday } from "date-fns";
import { CreditCard, ReceiptText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FaFilePdf, FaFileExcel } from "react-icons/fa";

type TransactionWithEmployee = Transaction & {
  employeeName: string;
};

export default function VendorDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const transaction = JSON.parse(event.data);
      if (transaction.vendorId === user?.id) {
        toast({
          title: "New Transaction",
          description: `Received: $${transaction.amount}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      }
    };

    setWs(socket);
    return () => socket.close();
  }, [user?.id]);

  if (user?.role !== Role.VENDOR) {
    return <div>Access denied</div>;
  }

  const { data: transactions } = useQuery<TransactionWithEmployee[]>({
    queryKey: ["/api/vendor/transactions"],
    queryFn: async () => {
      const res = await fetch("/api/vendor/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });

  const downloadReport = async (format: 'pdf' | 'excel') => {
    try {
      const params = new URLSearchParams({
        format,
        ...(dateRange.from && { startDate: dateRange.from.toISOString() }),
        ...(dateRange.to && { endDate: dateRange.to.toISOString() })
      });

      const response = await fetch(`/api/vendor/reports?${params}`);
      if (!response.ok) throw new Error('Failed to download report');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendor_transactions.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download report:", error);
    }
  };

  // Calculate total earnings
  const totalEarnings = transactions
    ?.filter((t) => t.status === "completed")
    .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0;

  // Calculate today's earnings
  const todayEarnings = transactions
    ?.filter((t) => t.status === "completed" && isToday(new Date(t.createdAt)))
    .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0) || 0;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
          <div className="flex items-center gap-4">
            <span>Welcome, {user?.username}</span>
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Total Earnings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-6 w-6" />
                Total Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">₹{totalEarnings.toFixed(2)}</p>
            </CardContent>
          </Card>

          {/* Today's Earnings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-6 w-6" />
                Today's Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">₹{todayEarnings.toFixed(2)}</p>
            </CardContent>
          </Card>

          {/* Recent Transactions Count */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-6 w-6" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {transactions?.filter((t) => t.status === "completed").length || 0} transactions received
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Date Range & Download Buttons */}
            <div className="grid gap-4 md:flex md:items-center md:justify-between mb-6">
              <div className="flex flex-col gap-2 w-full md:w-auto">
                <Label className="font-medium">Date Range</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="date"
                    value={dateRange.from?.toISOString().split("T")[0] || ""}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        from: e.target.value ? new Date(e.target.value) : undefined,
                      }))
                    }
                    className="w-full md:w-auto"
                  />
                  <Input
                    type="date"
                    value={dateRange.to?.toISOString().split("T")[0] || ""}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        to: e.target.value ? new Date(e.target.value) : undefined,
                      }))
                    }
                    className="w-full md:w-auto"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Button onClick={() => downloadReport('excel')} className="flex items-center gap-2 w-full md:w-auto">
                  <FaFileExcel className="text-green-600" /> Download Excel
                </Button>
                <Button onClick={() => downloadReport('pdf')} className="flex items-center gap-2 w-full md:w-auto">
                  <FaFilePdf className="text-red-600" /> Download PDF
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {transactions
                ?.slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">Amount: ₹{transaction.amount}</p>
                      <p className="text-sm text-muted-foreground">
                        From: {transaction.employeeName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(transaction.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-1 rounded-full text-sm ${
                          transaction.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {transaction.status}
                      </span>
                    </div>
                  </div>
                ))}
              {(!transactions || transactions.length === 0) && (
                <p className="text-center text-muted-foreground">No transactions yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}