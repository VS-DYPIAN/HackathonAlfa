
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Role } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { loginMutation, registerMutation, user } = useAuth();

  if (user) {
    const redirectPath = user.role === Role.ADMIN
      ? "/admin"
      : user.role === Role.EMPLOYEE
      ? "/employee"
      : "/vendor";
    return <Redirect to={redirectPath} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>{isLogin ? "Login" : "Register"}</CardTitle>
          <CardDescription>
            {isLogin ? "Sign in to your account" : "Create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLogin) {
                loginMutation.mutate({ username, password });
              } else {
                registerMutation.mutate({ username, password });
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending || registerMutation.isPending}
            >
              {isLogin ? "Login" : "Register"}
            </Button>
          </form>
          <Button
            variant="link"
            className="w-full mt-4"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Need an account?" : "Already have an account?"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
