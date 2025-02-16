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

export default function VendorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState({
    startDate: "",
    endDate: "",
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

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", user.id, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      params.append("vendorId", user.id.toString());

      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    }
  });

  const downloadReport = async (format: 'pdf' | 'excel') => {
    const params = new URLSearchParams();
    if (dateRange.startDate) params.append("startDate", dateRange.startDate);
    if (dateRange.endDate) params.append("endDate", dateRange.endDate);
    params.append("vendorId", user.id.toString());
    params.append("format", format);

    const res = await fetch(`/api/reports?${params}`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-report.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalEarnings = transactions?.reduce(
    (sum: number, t: Transaction) => sum + t.amount,
    0
  ) ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Vendor Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Total Earnings</CardTitle>
        </CardHeader>
        <CardContent>
          <h2 className="text-2xl font-bold">${totalEarnings.toFixed(2)}</h2>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generate Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({
                ...prev,
                startDate: e.target.value
              }))}
            />
            <Input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({
                ...prev,
                endDate: e.target.value
              }))}
            />
            <div className="flex gap-4">
              <Button onClick={() => downloadReport('pdf')}>
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button onClick={() => downloadReport('excel')}>
                <Download className="mr-2 h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2">Amount</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions?.map((transaction: Transaction) => (
                  <tr key={transaction.id}>
                    <td className="p-2">{transaction.id}</td>
                    <td className="p-2">{transaction.employeeId}</td>
                    <td className="p-2">${transaction.amount}</td>
                    <td className="p-2">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}