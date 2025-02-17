import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, isToday } from "date-fns";
import { CreditCard, ReceiptText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { FaFilePdf, FaFileExcel } from "react-icons/fa";

import jsPDF from "jspdf";
import "jspdf-autotable"; // Import this to extend jsPDF with autoTable

type TransactionWithEmployee = Transaction & {
  employeeName: string;
};

export default function VendorDashboard() {
  const { user, logoutMutation } = useAuth();

  const { data: transactions } = useQuery<TransactionWithEmployee[]>({
    queryKey: ["/api/vendor/transactions"],
    queryFn: async () => {
      const res = await fetch("/api/vendor/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });

  const downloadExcel = async () => {
    if (!transactions || transactions.length === 0) {
      alert("No transactions available to download.");
      return;
    }

    const startDateStr = dateRange.from
      ? dateRange.from.toISOString().split("T")[0]
      : "all";
    const endDateStr = dateRange.to
      ? dateRange.to.toISOString().split("T")[0]
      : "all";
    const fileName = `vendor_transactions_${startDateStr}_to_${endDateStr}.xlsx`;

    const params = new URLSearchParams({
      ...(dateRange.from && { startDate: dateRange.from.toISOString() }),
      ...(dateRange.to && { endDate: dateRange.to.toISOString() }),
    });

    const response = await fetch(`/api/vendor/transactions/excel?${params}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // const totalEarnings = transactions
  //   ?.filter((t) => t.status === "completed")
  //   .reduce((sum, t) => sum + t.amount, 0);

  // const todayEarnings = transactions
  //   ?.filter((t) => t.status === "completed" && isToday(new Date(t.timestamp)))
  //   .reduce((sum, t) => sum + t.amount, 0);

  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  //
  const downloadPDF = () => {
    if (!transactions || transactions.length === 0) {
      alert("No transactions available to download.");
      return;
    }

    // Filter transactions based on date range
    const filteredTransactions = transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.timestamp);
      const fromDate = dateRange.from ? new Date(dateRange.from) : null;
      const toDate = dateRange.to ? new Date(dateRange.to) : null;

      return (
        (!fromDate || transactionDate >= fromDate) &&
        (!toDate || transactionDate <= toDate)
      );
    });

    if (filteredTransactions.length === 0) {
      alert("No transactions found for the selected date range.");
      return;
    }

    const doc = new jsPDF();
    doc.text("Vendor Transactions Report", 14, 10);

    // Display selected date range
    const startDateStr = dateRange.from
      ? format(dateRange.from, "MMM d, yyyy")
      : "All";
    const endDateStr = dateRange.to
      ? format(dateRange.to, "MMM d, yyyy")
      : "All";
    doc.text(`Date Range: ${startDateStr} - ${endDateStr}`, 14, 20);

    const tableColumn = ["Transaction ID", "Amount", "Status", "Date"];
    const tableRows: any[] = [];

    filteredTransactions.forEach((transaction) => {
      const transactionData = [
        transaction.id,
        transaction.amount,
        transaction.status,
        format(new Date(transaction.timestamp), "MMM d, yyyy h:mm a"),
      ];
      tableRows.push(transactionData);
    });

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 30, // Adjust to avoid overlap with the date range text
    });

    const fileName = `transactions_${startDateStr}_to_${endDateStr}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
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
          {/* Recent Transactions Count */}
          <Card className="bg-gray-200 rounded-xl shadow-lg">
            <CardHeader className="bg-gray-800 text-white rounded-t-xl">
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-6 w-6" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {transactions?.filter((t) => t.status === "completed").length ||
                  0}{" "}
                transactions received
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card className="mt-8 bg-gray-200 rounded-xl shadow-lg">
          <CardHeader className="bg-gray-800 text-white rounded-t-xl">
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {/* Date Range & Download Buttons */}
            <div className="grid gap-4 md:flex md:items-center md:justify-between">
              {/* Date Range Picker */}
              <div className="flex flex-col gap-2 w-full md:w-auto">
                <Label className="font-medium">Date Range</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="date"
                    value={dateRange.from?.toISOString().split("T")[0] || ""}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        from: e.target.value
                          ? new Date(e.target.value)
                          : undefined,
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
                        to: e.target.value
                          ? new Date(e.target.value)
                          : undefined,
                      }))
                    }
                    className="w-full md:w-auto"
                  />
                </div>
              </div>

              {/* Download Buttons with Icons */}
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Button
                  onClick={downloadExcel}
                  className="flex items-center gap-2 w-full md:w-auto bg-green-500 text-white rounded-lg"
                >
                  <FaFileExcel className="text-white" /> Download CSV
                </Button>
                <Button
                  onClick={downloadPDF}
                  className="flex items-center gap-2 w-full md:w-auto bg-red-500 text-white rounded-lg"
                >
                  <FaFilePdf className="text-white" /> Download PDF
                </Button>
              </div>
            </div>
            <br></br>

            <div className="space-y-4">
              {transactions
                ?.slice()
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() -
                    new Date(a.timestamp).getTime(),
                ) // Descending order
                .map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-gray-100"
                  >
                    <div>
                      <p className="font-medium">
                        Amount: ₹{transaction.amount}
                      </p>
                      <p className="text-sm font-semibold text-gray-700">
                        Transaction ID: {transaction.id}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(
                          new Date(transaction.timestamp),
                          "MMM d, yyyy h:mm a",
                        )}
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
                <p className="text-center text-muted-foreground">
                  No transactions yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
