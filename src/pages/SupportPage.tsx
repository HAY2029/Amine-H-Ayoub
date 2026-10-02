import { useNavigate } from "react-router-dom";
import SupportChat from "@/components/SupportChat";
import AppNav from "@/components/AppNav";

export default function SupportPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen page-nour text-foreground" dir="rtl">
      <AppNav />
      <SupportChat pageMode onClose={() => navigate(-1)} />
    </div>
  );
}
