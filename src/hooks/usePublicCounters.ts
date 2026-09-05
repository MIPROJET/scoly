import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublicCounters {
  products: number;
  articles: number;
  profiles: number;
  resources: number;
  partners: number;
  schools: number;
}

const EMPTY: PublicCounters = {
  products: 0,
  articles: 0,
  profiles: 0,
  resources: 0,
  partners: 0,
  schools: 0,
};

/**
 * Compteurs publics de la page d'accueil.
 * Un seul appel serveur mis en cache 10 minutes, au lieu d'une dizaine de
 * comptages séparés déclenchés par chaque section.
 */
export const usePublicCounters = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["public-counters"],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PublicCounters> => {
      const { data, error } = await supabase.rpc("get_public_counters");
      if (error || !data) return EMPTY;
      return { ...EMPTY, ...(data as unknown as Partial<PublicCounters>) };
    },
  });

  return { counters: data ?? EMPTY, loading: isLoading };
};

export default usePublicCounters;
