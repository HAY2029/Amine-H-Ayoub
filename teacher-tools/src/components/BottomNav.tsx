import { Headphones } from "lucide-react";

export type TabType = "audio" | "mushaf";

interface Props {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  hasPlayer?: boolean;
}

const BottomNav = ({ activeTab, onChange, hasPlayer }: Props) => {
  // تم إخفاء زر المصحف — المصحف قيد التطوير
  return null;
};

export default BottomNav;
