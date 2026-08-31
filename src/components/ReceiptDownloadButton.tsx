import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReceiptDownloadButtonProps {
  orderId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  iconOnly?: boolean;
}

const ReceiptDownloadButton = ({
  orderId,
  variant = "outline",
  size = "sm",
  iconOnly = false,
}: ReceiptDownloadButtonProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const download = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expirée");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-receipt-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ order_id: orderId, download: true }),
        },
      );
      if (!response.ok) throw new Error("Reçu indisponible");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `scoly-recu-${orderId.slice(0, 8).toUpperCase()}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Téléchargement impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : size}
      onClick={download}
      disabled={loading}
      aria-label="Télécharger le reçu PDF"
      title="Télécharger le reçu PDF"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {!iconOnly && "Reçu PDF"}
    </Button>
  );
};

export default ReceiptDownloadButton;