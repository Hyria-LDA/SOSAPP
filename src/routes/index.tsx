import { createFileRoute, redirect } from "@tanstack/react-router";

// Use the same login and registration checks for the website and native app.
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/app", replace: true, search: true, hash: location.hash });
  },
});
