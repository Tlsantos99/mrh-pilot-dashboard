interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'navy' | 'pink' | 'teal' | 'orange' | 'green';
  size?: 'sm' | 'md' | 'lg';
}

const colorMap = {
  navy:   'border-l-[#00305E] text-[#00305E]',
  pink:   'border-l-[#E8007D] text-[#E8007D]',
  teal:   'border-l-[#00B4A0] text-[#00B4A0]',
  orange: 'border-l-[#EF9F27] text-[#EF9F27]',
  green:  'border-l-[#00B4A0] text-[#00B4A0]',
};

const sizeMap = {
  sm: 'text-xl',
  md: 'text-3xl',
  lg: 'text-4xl',
};

export default function KPICard({ label, value, sub, color = 'navy', size = 'md' }: KPICardProps) {
  return (
    <div className={`kpi-card border-l-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold ${sizeMap[size]} ${colorMap[color].split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
