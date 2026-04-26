interface Props {
  average: number;
  agreement: number;
  consensus: number;
  totalVoters: number;
}

export default function MetricsRibbon({ average, agreement, consensus, totalVoters }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg border border-[#DFE1E6] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#DEEBFF] flex items-center justify-center text-[#0052CC]">
          📊
        </div>
        <div>
          <div className="text-2xl font-bold text-[#172B4D]">{average}</div>
          <div className="text-xs text-[#5E6C84]">Average</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#DFE1E6] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#E3FCEF] flex items-center justify-center text-[#36B37E]">
          🤝
        </div>
        <div>
          <div className="text-2xl font-bold text-[#172B4D]">{agreement}%</div>
          <div className="text-xs text-[#5E6C84]">Agreement</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#DFE1E6] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#EAE6FF] flex items-center justify-center text-[#6554C0]">
          🎯
        </div>
        <div>
          <div className="text-2xl font-bold text-[#172B4D]">{consensus}</div>
          <div className="text-xs text-[#5E6C84]">Consensus</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[#DFE1E6] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#FFFAE6] flex items-center justify-center text-[#FF991F]">
          👥
        </div>
        <div>
          <div className="text-2xl font-bold text-[#172B4D]">{totalVoters}</div>
          <div className="text-xs text-[#5E6C84]">Voters</div>
        </div>
      </div>
    </div>
  );
}
