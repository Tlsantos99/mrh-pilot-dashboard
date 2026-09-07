interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

export default function SectionHeader({ title, subtitle, badge }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h2 className="text-lg font-semibold text-[#00305E]">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {badge && (
        <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}
