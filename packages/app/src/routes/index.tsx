import { createFileRoute } from "@tanstack/react-router";
import { Home } from "./workspace/home.tsx";

export const Route = createFileRoute("/")({ component: Home });
