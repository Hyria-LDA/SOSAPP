import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetch ao abrir/fechar teclado virtual no mobile,
        // que causava re-render e perda de foco/scroll nos formulários.
        refetchOnWindowFocus: false,
        // Reaproveita os dados já carregados ao navegar entre telas.
        // Atualizações explícitas após criar/editar continuam invalidando o cache.
        staleTime: 2 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
