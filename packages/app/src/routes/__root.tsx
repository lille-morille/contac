import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Providers } from "../components/providers.tsx";
import "@fontsource-variable/geist";
import "../styles.css";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Contac" },
    ],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <Outlet />
        </Providers>
        <Scripts />
      </body>
    </html>
  ),
});
